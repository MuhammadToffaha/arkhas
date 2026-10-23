package eg.arkhas.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * In-app update from GitHub Releases: check → download the APK inside the app (with progress) → Android installer.
 * Signed with the same key every build, so it installs over the current version and keeps settings.
 */
object Updater {
    private const val API = "https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/latest"
    private const val CACHE_MS = 6 * 3600_000L

    /** {current, currentName, latest, latestName, url, size, notes, date, available} */
    fun check(ctx: Context, force: Boolean): JSONObject {
        val prefs = ctx.getSharedPreferences("arkhas", Context.MODE_PRIVATE)
        val cached = prefs.getString("updInfo", null)
        if (!force && cached != null && System.currentTimeMillis() - prefs.getLong("updAt", 0) < CACHE_MS) {
            return withCurrent(JSONObject(cached))
        }
        val c = URL(API).openConnection() as HttpURLConnection
        c.setRequestProperty("Accept", "application/vnd.github+json")
        c.setRequestProperty("User-Agent", "Arkhas-Android")
        c.connectTimeout = 8000; c.readTimeout = 10000
        if (c.responseCode != 200) throw Exception("GitHub HTTP ${c.responseCode}")
        val rel = JSONObject(c.inputStream.bufferedReader().readText())
        val assets = rel.getJSONArray("assets")
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.getString("name").endsWith(".apk") }
        val latest = rel.getString("tag_name").removePrefix("v").toIntOrNull() ?: 0
        val info = JSONObject()
            .put("latest", latest)
            .put("latestName", "1.0.$latest")
            .put("url", apk?.getString("browser_download_url") ?: "")
            .put("size", apk?.optLong("size") ?: 0)
            .put("notes", rel.optString("body", ""))
            .put("date", rel.optString("published_at", ""))
        prefs.edit().putString("updInfo", info.toString()).putLong("updAt", System.currentTimeMillis()).apply()
        return withCurrent(info)
    }

    private fun withCurrent(info: JSONObject) = info
        .put("current", BuildConfig.VERSION_CODE)
        .put("currentName", BuildConfig.VERSION_NAME)
        .put("available", info.optInt("latest") > BuildConfig.VERSION_CODE && info.optString("url").isNotEmpty())

    /** Download with progress (0..100). Returns the APK file. Only GitHub URLs are accepted. */
    fun download(ctx: Context, url: String, progress: (Int) -> Unit): File {
        require(url.startsWith("https://github.com/${BuildConfig.UPDATE_REPO}/releases/download/")) { "bad update url" }
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
        val out = File(dir, "arkhas-update.apk")
        var target = url
        repeat(6) {
            val c = URL(target).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.setRequestProperty("User-Agent", "Arkhas-Android")
            c.connectTimeout = 10_000; c.readTimeout = 30_000
            val code = c.responseCode
            if (code in 300..399) { target = URL(URL(target), c.getHeaderField("Location")).toString(); c.disconnect(); return@repeat }
            if (code != 200) throw Exception("HTTP $code")
            val total = c.contentLengthLong.takeIf { it > 0 } ?: -1
            var done = 0L; var last = -1
            c.inputStream.use { inp ->
                out.outputStream().use { o ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = inp.read(buf); if (n < 0) break
                        o.write(buf, 0, n); done += n
                        val pct = if (total > 0) (done * 100 / total).toInt() else -1
                        if (pct != last) { last = pct; progress(pct) }
                    }
                }
            }
            if (total > 0 && done != total) throw Exception("download incomplete")
            return out
        }
        throw Exception("too many redirects")
    }

    /** True if Android lets us open the installer; otherwise opens the "install unknown apps" switch for this app. */
    fun canInstall(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ctx.packageManager.canRequestPackageInstalls()) return true
        ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return false
    }

    /**
     * 🤫 Install through Android's PackageInstaller. On Android 12+ no prompt is shown when Arkhas is the app that
     * installed itself last time ("installer of record"); the very first in-app update asks once, after that it's silent.
     * Older Android / first time: Android shows its normal confirm screen (from the background: a notification).
     */
    fun installSilent(ctx: Context, apk: File, fromBackground: Boolean) {
        val pi = ctx.packageManager.packageInstaller
        val params = android.content.pm.PackageInstaller.SessionParams(android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        if (Build.VERSION.SDK_INT >= 34) params.setRequestUpdateOwnership(true)
        params.setSize(apk.length())
        val id = pi.createSession(params)
        pi.openSession(id).use { session ->
            apk.inputStream().use { inp -> session.openWrite("arkhas.apk", 0, apk.length()).use { out -> inp.copyTo(out); session.fsync(out) } }
            val i = Intent(ctx, UpdateReceiver::class.java).setAction(UpdateReceiver.STATUS).putExtra("bg", fromBackground)
            val flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) android.app.PendingIntent.FLAG_MUTABLE else 0)
            session.commit(android.app.PendingIntent.getBroadcast(ctx, id, i, flags).intentSender)
        }
    }

    fun install(ctx: Context, apk: File) {
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", apk)
        ctx.startActivity(Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
