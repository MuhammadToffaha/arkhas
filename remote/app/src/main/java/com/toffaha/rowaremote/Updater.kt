package com.toffaha.rowaremote

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * 🔄 Same update setup as all Toffaha apps: releases "remote-vN" in MuhammadToffaha/arkhas (never "latest"),
 * version 1.0.N, silent check + install once a day, small pop-up on open when a newer version exists.
 */
object Updater {
    private const val API = "https://api.github.com/repos/MuhammadToffaha/arkhas/releases?per_page=100"
    private const val PREFIX = "remote-v"
    private const val WORK = "rowa-remote-daily-update"

    @Volatile var latestCode = 0
    @Volatile var latestUrl = ""
    @Volatile var notes = ""
    @Volatile var status = "idle"     // idle · checking · downloading · installing · error
    @Volatile var pct = 0
    @Volatile var error = ""

    fun prefs(ctx: Context) = ctx.getSharedPreferences("remote", Context.MODE_PRIVATE)
    fun auto(ctx: Context) = prefs(ctx).getBoolean("autoUpdate", true)
    fun hasUpdate() = latestCode > BuildConfig.VERSION_CODE && latestUrl.isNotEmpty()

    private fun get(url: String, accept: String): HttpURLConnection {
        var u = url
        repeat(6) {
            val c = URL(u).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.setRequestProperty("User-Agent", "ROWA-Remote-Android"); c.setRequestProperty("Accept", accept)
            c.connectTimeout = 15_000; c.readTimeout = 60_000
            val code = c.responseCode
            if (code in 300..399) {
                val loc = c.getHeaderField("Location") ?: throw Exception("redirect")
                c.disconnect(); u = URL(URL(u), loc).toString()
                if (!u.startsWith("https://")) throw Exception("insecure redirect")
                return@repeat
            }
            if (code != 200) { c.disconnect(); throw Exception("HTTP $code") }
            return c
        }
        throw Exception("too many redirects")
    }

    fun check(ctx: Context): Boolean = try {
        status = "checking"
        val arr = JSONArray(get(API, "application/vnd.github+json").inputStream.bufferedReader().use { it.readText() })
        var best = 0; var url = ""; var body = ""
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            val tag = r.optString("tag_name")
            if (!tag.startsWith(PREFIX) || r.optBoolean("draft")) continue
            val code = tag.removePrefix(PREFIX).toIntOrNull() ?: continue
            val assets = r.optJSONArray("assets") ?: continue
            val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.optString("name").endsWith(".apk") } ?: continue
            if (code > best) { best = code; url = apk.optString("browser_download_url"); body = r.optString("body").take(800) }
        }
        latestCode = best; latestUrl = url; notes = body
        prefs(ctx).edit().putLong("checkedAt", System.currentTimeMillis()).putInt("latest", best).putString("latestUrl", url).apply()
        status = "idle"; error = ""; true
    } catch (e: Exception) { status = "idle"; error = e.message ?: "error"; false }

    /** cached result from the last check (pop-up shows instantly on open) */
    fun restore(ctx: Context) {
        val p = prefs(ctx)
        latestCode = p.getInt("latest", 0); latestUrl = p.getString("latestUrl", "") ?: ""
    }

    fun dueForCheck(ctx: Context) = System.currentTimeMillis() - prefs(ctx).getLong("checkedAt", 0) > 24 * 3600_000L

    fun canInstall(ctx: Context) = Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    fun downloadAndInstall(ctx: Context, background: Boolean, onChange: () -> Unit) {
        require(latestUrl.startsWith("https://github.com/MuhammadToffaha/")) { "bad url" }
        status = "downloading"; pct = 0; error = ""; onChange()
        try {
            val f = File(File(ctx.cacheDir, "apks").apply { mkdirs() }, "rowa-remote.apk")
            val c = get(latestUrl, "application/octet-stream")
            val total = c.contentLengthLong; var done = 0L; var last = -1
            c.inputStream.use { inp -> f.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = inp.read(buf); if (n < 0) break
                    out.write(buf, 0, n); done += n
                    val p = if (total > 0) (done * 100 / total).toInt() else -1
                    if (p - last >= 4 || p == 100) { last = p; pct = p; onChange() }
                }
            } }
            if (total > 0 && done != total) throw Exception("download incomplete")
            status = "installing"; onChange()
            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            params.setSize(f.length())
            val sid = pi.createSession(params)
            pi.openSession(sid).use { s ->
                f.inputStream().use { inp -> s.openWrite("app.apk", 0, f.length()).use { out -> inp.copyTo(out); s.fsync(out) } }
                val i = Intent(ctx, InstallReceiver::class.java).setAction(InstallReceiver.STATUS).putExtra("bg", background)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                s.commit(PendingIntent.getBroadcast(ctx, sid, i, flags).intentSender)
            }
        } catch (e: Exception) { status = "error"; error = e.message ?: "error"; onChange(); throw e }
    }

    fun schedule(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        if (!auto(ctx)) { wm.cancelUniqueWork(WORK); return }
        val req = PeriodicWorkRequestBuilder<DailyUpdate>(24, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).setRequiresBatteryNotLow(true).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }
}

/** 🤫 once a day: newer version → download and install quietly. */
class DailyUpdate(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        if (!Updater.auto(ctx)) return@withContext Result.success()
        if (!Updater.check(ctx)) return@withContext Result.retry()
        if (Updater.hasUpdate() && Updater.canInstall(ctx)) runCatching { Updater.downloadAndInstall(ctx, true) {} }
        Result.success()
    }
}

class InstallReceiver : BroadcastReceiver() {
    companion object {
        const val STATUS = "com.toffaha.rowaremote.INSTALL_STATUS"
        @Volatile var foreground = false
        @Volatile var onDone: (() -> Unit)? = null

        fun notify(ctx: Context, title: String, text: String, tap: Intent?) {
            if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("updates", "تحديثات · Updates", NotificationManager.IMPORTANCE_DEFAULT))
            val b = NotificationCompat.Builder(ctx, "updates").setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(title).setContentText(text).setAutoCancel(true)
            if (tap != null) b.setContentIntent(PendingIntent.getActivity(ctx, 7, tap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            nm.notify(7, b.build())
        }
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) { Updater.schedule(ctx); return }
        if (intent.action != STATUS) return
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                if (foreground && !intent.getBooleanExtra("bg", false)) runCatching { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                else notify(ctx, "🔄 تحديث ريموت روا جاهز · ROWA Remote update ready", "اضغط للتثبيت · Tap to install", confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.status = "idle"
            else -> { Updater.status = "error"; Updater.error = (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed ($st)").take(160) }
        }
        onDone?.invoke()
    }
}
