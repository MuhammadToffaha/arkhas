package eg.arkhas.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * 🔔 Deal alerts: every few hours, even with the app closed, run the same deals engine (web/engine.js)
 * in an invisible WebView, and notify about NEW deals at or above the chosen discount.
 * Settings live in the page prefs under "alerts": {on, min, stores[], mega, hours}.
 */
object DealAlerts {
    const val CHANNEL = "deals"
    private const val WORK = "deal-watch"
    private const val WORK_NOW = "deal-watch-now"

    fun prefs(ctx: Context) = ctx.getSharedPreferences("arkhas", Context.MODE_PRIVATE)

    fun config(ctx: Context): JSONObject =
        runCatching { JSONObject(prefs(ctx).getString("p_alerts", null) ?: "{}") }.getOrDefault(JSONObject())

    /** (Re)schedule or cancel the periodic check from the saved config. */
    fun schedule(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        val c = config(ctx)
        if (!c.optBoolean("on")) { wm.cancelUniqueWork(WORK); return }
        val hours = c.optInt("hours", 3).coerceIn(1, 24).toLong()
        val req = PeriodicWorkRequestBuilder<DealWatchWorker>(hours, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(10, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    /** "Check now" button. */
    fun runNow(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<DealWatchWorker>()
            .setInputData(workDataOf("manual" to true))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, req)
    }

    fun canNotify(ctx: Context) = Build.VERSION.SDK_INT < 33 ||
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL, "تنبيهات العروض · Deal alerts", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "Big discounts on Amazon, Noon, Jumia"
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun picture(url: String?): Bitmap? = runCatching {
        if (url.isNullOrBlank() || !url.startsWith("http")) return null
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 5000; c.readTimeout = 7000
        c.setRequestProperty("User-Agent", Net.DESKTOP_UA)
        c.inputStream.use { BitmapFactory.decodeStream(it) }
    }.getOrNull()

    private fun money(v: Double) = "%,d ج.م".format(Math.round(v))

    /** One notification per deal (max 6, biggest discount first) + a group summary. */
    @SuppressLint("MissingPermission")
    fun notify(ctx: Context, deals: List<JSONObject>) {
        if (deals.isEmpty() || !canNotify(ctx)) return
        ensureChannel(ctx)
        val nm = NotificationManagerCompat.from(ctx)
        val top = deals.sortedByDescending { it.optInt("pct") }.take(6)
        for (d in top) {
            val url = d.optString("url")
            val pct = d.optInt("pct")
            val mega = d.optString("tag") == "mega"
            val title = (if (pct > 0) "🔥 -$pct%" else "🟡 Mega") + " · " + d.optString("source")
            val body = d.optString("title").take(120) + "\n" + money(d.optDouble("price")) +
                (if (d.optDouble("old_price", 0.0) > d.optDouble("price")) "  (بدل ${money(d.optDouble("old_price"))})" else "") +
                (if (mega) "  🟡 MEGA" else "")
            val open = PendingIntent.getActivity(ctx, url.hashCode(),
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val b = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_deal)
                .setContentTitle(title)
                .setContentText(body.lineSequence().first())
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setGroup("deals")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
            picture(d.optString("image")).let { if (it != null) b.setLargeIcon(it) }
            nm.notify(url.hashCode(), b.build())
        }
        if (top.size > 1) {
            val app = PendingIntent.getActivity(ctx, 1,
                Intent(ctx, MainActivity::class.java).putExtra("openDeals", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            nm.notify(1, NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_deal)
                .setContentTitle("⚡ ${deals.size} عرض جديد · new deals")
                .setContentText("أعلى خصم -${top.first().optInt("pct")}%")
                .setContentIntent(app)
                .setGroup("deals").setGroupSummary(true).setAutoCancel(true)
                .build())
        }
    }
}

/** Background job: run the engine headless, keep only deals not notified before, notify. */
class DealWatchWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = DealAlerts.prefs(ctx)
        val manual = inputData.getBoolean("manual", false)
        val raw = withTimeoutOrNull(170_000) { withContext(Dispatchers.Main) { HeadlessEngine(ctx).run() } }
        val status = JSONObject().put("at", System.currentTimeMillis()).put("manual", manual)
        if (raw.isNullOrBlank()) {
            prefs.edit().putString("p_alertLast", status.put("error", "timeout").toString()).apply()
            return if (manual) Result.success() else Result.retry()
        }
        val res = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
        val deals = res.optJSONArray("deals") ?: JSONArray()

        // remember what was already notified (7 days) so each deal alerts once
        val seen = runCatching { JSONObject(prefs.getString("alertSeen", "{}") ?: "{}") }.getOrDefault(JSONObject())
        val now = System.currentTimeMillis()
        seen.keys().asSequence().toList().forEach { if (now - seen.optLong(it) > 7 * 86_400_000L) seen.remove(it) }
        val fresh = (0 until deals.length()).map { deals.getJSONObject(it) }.filter { d ->
            val key = d.optString("url").substringBefore("?") + "|" + d.optInt("pct")
            if (seen.has(key)) false else { seen.put(key, now); true }
        }
        prefs.edit().putString("alertSeen", seen.toString())
            .putString("p_alertLast", status.put("found", deals.length()).put("new", fresh.size)
                .put("sources", res.optJSONArray("sources") ?: JSONArray()).toString())
            .apply()
        withContext(Dispatchers.IO) { DealAlerts.notify(ctx, fresh) }
        return Result.success()
    }
}

/**
 * Loads the app page (web/index.html) in an invisible WebView with Native.isBackground() = true.
 * The page then runs Arkhas.deals() for the alert stores and hands the result back via Native.bgDone(json).
 */
class HeadlessEngine(private val ctx: Context) {
    private val main = Handler(Looper.getMainLooper())
    private val prefs = DealAlerts.prefs(ctx)

    suspend fun run(): String = suspendCancellableCoroutine { cont ->
        val web = WebView(ctx)
        val hidden = WebView(ctx)
        val renderer = Renderer(hidden)
        val done = AtomicBoolean(false)
        fun finish(result: String) {
            if (!done.compareAndSet(false, true)) return
            main.post { runCatching { web.destroy(); hidden.destroy() } }
            if (cont.isActive) cont.resume(result)
        }

        class BgBridge {
            private fun answer(id: Int, ok: Boolean, text: String) = main.post {
                if (!done.get()) web.evaluateJavascript("window.__native($id,$ok,${JSONObject.quote(text)})", null)
            }
            @JavascriptInterface fun fetch(id: Int, url: String, opts: String) {
                val o = runCatching { JSONObject(opts) }.getOrDefault(JSONObject())
                if (!url.startsWith("https://") && !url.startsWith("http://")) return answer(id, false, "bad url")
                if (o.optBoolean("render")) {
                    val wait = o.optString("wait").ifBlank { null }
                    main.post { renderer.render(url, wait) { ok, html -> answer(id, ok, html) } }
                } else Net.pool.execute {
                    try { answer(id, true, Net.get(url, o.optString("lang", "en"), o.optBoolean("json"))) }
                    catch (e: Exception) { answer(id, false, e.message ?: e.javaClass.simpleName) }
                }
            }
            @JavascriptInterface fun getPref(k: String): String = prefs.getString("p_$k", "") ?: ""
            @JavascriptInterface fun setPref(k: String, v: String) = prefs.edit().putString("p_$k", v).apply()
            @JavascriptInterface fun readConfig(name: String): String = WebFiles.read(ctx, name)
            @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
            @JavascriptInterface fun pendingQuery(): String = ""
            @JavascriptInterface fun isBackground(): Boolean = true
            @JavascriptInterface fun bgDone(json: String) = finish(json)
        }

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.blockNetworkImage = true
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(BgBridge(), "Native")
        web.loadUrl(WebFiles.indexUrl(ctx))
        cont.invokeOnCancellation { finish("") }
    }
}
