package com.toffaha.machich

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** 🔁 Self-update from GitHub Releases. Mach ich! lives in the arkhas repo: tags machich-vN, asset machich.apk. */
object Updater {
    const val REPO = "MuhammadToffaha/arkhas"
    const val TAG_PREFIX = "machich-v"
    private const val RELEASES = "https://api.github.com/repos/$REPO/releases?per_page=100"

    data class Release(val code: Int, val name: String, val notes: String, val url: String) {
        fun json(): String = JSONObject().put("code", code).put("name", name).put("notes", notes).put("url", url).toString()
    }

    fun open(url: String): HttpURLConnection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15000; readTimeout = 30000; instanceFollowRedirects = true
        setRequestProperty("User-Agent", "MachIch-Android")
        setRequestProperty("Accept", "application/vnd.github+json")
    }

    /** newest release whose tag is machich-vN (the repo's "latest" release belongs to Arkhas) */
    fun latest(): Release? {
        val c = open(RELEASES)
        try {
            if (c.responseCode != 200) return null
            val arr = JSONArray(c.inputStream.bufferedReader().readText())
            var best: Release? = null
            for (k in 0 until arr.length()) {
                val o = arr.getJSONObject(k)
                val tag = o.optString("tag_name")
                if (!tag.startsWith(TAG_PREFIX) || o.optBoolean("draft")) continue
                val code = tag.removePrefix(TAG_PREFIX).toIntOrNull() ?: continue
                val assets = o.optJSONArray("assets") ?: continue
                var apk: String? = null
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name").endsWith(".apk")) { apk = a.optString("browser_download_url"); break }
                }
                if (apk != null && (best == null || code > best.code)) best = Release(code, o.optString("name").ifBlank { "1.0.$code" }, o.optString("body"), apk)
            }
            return best
        } finally { c.disconnect() }
    }

    fun download(ctx: Context, url: String, progress: (Float) -> Unit): File {
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "machich-update.apk")
        val c = open(url)
        c.setRequestProperty("Accept", "application/octet-stream")
        try {
            if (c.responseCode !in 200..299) throw RuntimeException("HTTP ${c.responseCode}")
            val total = c.contentLengthLong
            var done = 0L
            c.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf); if (n < 0) break
                        out.write(buf, 0, n); done += n
                        if (total > 0) progress(done.toFloat() / total)
                    }
                }
            }
        } finally { c.disconnect() }
        return file
    }

    fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

    fun askInstallPermission(ctx: Context) {
        ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Android 12+: silent after the first update (this app becomes installer of record). */
    fun install(ctx: Context, file: File): Boolean {
        if (!canInstall(ctx)) { askInstallPermission(ctx); return false }
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) setRequestUpdateOwnership(true)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { s ->
            s.openWrite("machich.apk", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                s.fsync(out)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val pi = PendingIntent.getBroadcast(ctx, id, Intent(ctx, InstallReceiver::class.java).setPackage(ctx.packageName), flags)
            s.commit(pi.intentSender)
        }
        return true
    }
}
