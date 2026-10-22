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
import kotlinx.coroutines.sync.withLock
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

    private fun money(v: Double) = String.format(java.util.Locale.US, "EGP %,d", Math.round(v))

    /** Same message format as the app's 📤 button. */
    fun waText(deals: List<JSONObject>): String = buildString {
        append("🔥 عروض أرخص\n\n")
        deals.take(10).forEachIndexed { i, d ->
            val pct = d.optInt("pct")
            if (deals.size > 1) append("${i + 1}) ")
            append(if (pct > 0) "🔥 -$pct%" else "🟡 MEGA").append(" · ").append(d.optString("source")).append("\n")
            append(d.optString("title").take(90)).append("\n")
            append("💰 ").append(money(d.optDouble("price")))
            if (d.optDouble("old_price", 0.0) > d.optDouble("price")) append(" (بدل ${money(d.optDouble("old_price"))})")
            append("\n").append(d.optString("url")).append("\n\n")
        }
        append("📲 من تطبيق أرخص")
    }

    /** Opens WhatsApp with the message filled in; the user picks the group and taps send. */
    private fun waIntent(ctx: Context, deals: List<JSONObject>, code: Int): PendingIntent =
        PendingIntent.getActivity(ctx, code,
            Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/?text=" + Uri.encode(waText(deals)))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

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
                .addAction(0, "📤 واتساب", waIntent(ctx, listOf(d), url.hashCode() + 7))
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
                .addAction(0, "📤 ابعت الكل واتساب", waIntent(ctx, top, 2))
                .setGroup("deals").setGroupSummary(true).setAutoCancel(true)
                .build())
        }
    }
}

/** Background job: run the engine headless, keep only deals not notified before, notify. */
/**
 * "Already sent" memory. A product is identified by its store product ID (Amazon ASIN, Noon SKU),
 * else by its link without tracking parts, and also by store + normalised title, so the same item found on
 * two pages, with a different ?ref= or a slightly different % is still recognised as the same item.
 */
class SentLog(private val prefs: android.content.SharedPreferences, private val name: String, private val days: Int = 7) {
    private val log = runCatching { JSONObject(prefs.getString(name, "{}") ?: "{}") }.getOrDefault(JSONObject())
    init {
        val now = System.currentTimeMillis()
        log.keys().asSequence().toList().forEach { if (now - log.optLong(it) > days * 86_400_000L) log.remove(it) }
    }
    fun has(d: JSONObject) = keys(d).any { log.has(it) }
    fun add(d: JSONObject) { val now = System.currentTimeMillis(); keys(d).forEach { log.put(it, now) } }
    fun save() {
        if (log.length() > 4000) {   // keep the newest 4000 keys
            val keep = log.keys().asSequence().sortedByDescending { log.optLong(it) }.take(4000).toSet()
            log.keys().asSequence().toList().forEach { if (it !in keep) log.remove(it) }
        }
        prefs.edit().putString(name, log.toString()).apply()
    }

    companion object {
        fun keys(d: JSONObject): List<String> {
            val url = d.optString("url"); val src = d.optString("source").lowercase()
            val out = mutableListOf<String>()
            Regex("/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})").find(url)?.let { out += "amz:" + it.groupValues[1] }
            Regex("/([A-Z0-9]{6,})/p(?:/|\\?|$)").find(url)?.let { out += "noon:" + it.groupValues[1] }
            val clean = url.substringBefore("#").substringBefore("?").trimEnd('/').lowercase()
                .replace(Regex("/ref=[^/]*$"), "").replace(Regex("^https?://(www\\.)?"), "")
            if (clean.isNotBlank()) out += "url:" + clean
            val t = d.optString("title").lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim().take(70)
            if (t.length >= 8) out += "t:$src|$t"
            return out
        }
    }
}

/** Background job: run the engine headless, keep only deals not sent before, notify / post to Telegram. */
class DealWatchWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    companion object { private val lock = kotlinx.coroutines.sync.Mutex() }   // periodic + "check now" never overlap

    override suspend fun doWork(): Result = lock.withLock { work() }

    private suspend fun work(): Result {
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
        val arr = res.optJSONArray("deals") ?: JSONArray()

        // same product twice in one batch (e.g. Amazon 70%+ and 50%+ pages) -> keep the bigger discount once
        val batch = mutableListOf<JSONObject>()
        for (d in (0 until arr.length()).map { arr.getJSONObject(it) }.sortedByDescending { it.optInt("pct") }) {
            val k = SentLog.keys(d).toSet()
            if (batch.none { b -> SentLog.keys(b).any { it in k } }) batch += d
        }

        val cfg = DealAlerts.config(ctx)
        val notifLog = SentLog(prefs, "alertSeen2")
        val newForPhone = batch.filter { !notifLog.has(it) }
        newForPhone.forEach { notifLog.add(it) }; notifLog.save()
        status.put("found", batch.size).put("new", newForPhone.size).put("sources", res.optJSONArray("sources") ?: JSONArray())

        withContext(Dispatchers.IO) {
            if (cfg.optBoolean("notify", true)) DealAlerts.notify(ctx, newForPhone)
            // ✈️ Telegram: only items never posted to this group before; marked as posted only after Telegram accepts them
            val tg = cfg.optJSONObject("tg")
            val tok = tg?.optString("token").orEmpty().ifBlank { BuildConfig.TG_TOKEN }
            val chat = if (tg != null) Telegram.destination(tg) else ""
            if (tg != null && tg.optBoolean("on") && tok.isNotBlank() && chat.isNotBlank()) {
                val tgLog = SentLog(prefs, "tgSent:$chat", days = 7)
                val todo = batch.filter { !tgLog.has(it) }
                status.put("tgNew", todo.size)
                if (todo.isNotEmpty()) {
                    try { status.put("tgSent", Telegram.send(tok, chat, todo) { d -> tgLog.add(d); tgLog.save() }) }
                    catch (e: Exception) { status.put("tgError", e.message ?: "error") }
                } else status.put("tgSent", 0)
            }
        }
        prefs.edit().putString("p_alertLast", status.toString()).apply()
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
            private fun answer(id: Int, ok: Boolean, text: String) {
                main.post { if (!done.get()) web.evaluateJavascript("window.__native($id,$ok,${JSONObject.quote(text)})", null) }
            }
            @JavascriptInterface fun fetch(id: Int, url: String, opts: String) {
                val o = runCatching { JSONObject(opts) }.getOrDefault(JSONObject())
                if (!url.startsWith("https://") && !url.startsWith("http://")) { answer(id, false, "bad url"); return }
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
            @JavascriptInterface fun defaultTgToken(): String = BuildConfig.TG_TOKEN
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
