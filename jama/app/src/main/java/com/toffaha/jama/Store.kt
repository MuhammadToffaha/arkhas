package com.toffaha.jama

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/** One app JAMA manages. Releases live on GitHub; the version number is the last number of the tag (v34, v1.17, jama-v5). */
data class ManagedApp(
    val id: String, val pkg: String, val repo: String, val emoji: String,
    val nameAr: String, val nameEn: String, val descAr: String, val descEn: String,
    /** null = the repo's "latest" release; otherwise only releases whose tag starts with this */
    val tagPrefix: String? = null
)

object Store {
    const val OWNER = "MuhammadToffaha"

    val APPS = listOf(
        ManagedApp("arkhas", "eg.arkhas.app", "arkhas", "🏷️", "أرخص", "Arkhas",
            "أرخص 3 أسعار في مصر + عروض فلاش", "Cheapest 3 prices in Egypt + flash deals"),
        ManagedApp("halal", "com.toffaha.halal", "halal", "🕌", "حلال سكانر", "Halal Scanner",
            "امسح باركود المنتج واعرف حلال ولا لأ", "Scan a barcode — halal or not"),
        ManagedApp("english", "com.toffaha.kalimat", "English-app", "📚", "إنجليزي بودي وأنوس", "English for Boudy & Anoos",
            "كلمات كتاب المعاصر صفحة بصفحة", "El-Moasser vocabulary, page by page"),
        ManagedApp("quran", "com.toffaha.qurangarden", "Quran-Garden", "🌱", "حديقة القرآن", "Quran Garden",
            "حفظ القرآن للأطفال حتى سورة يس", "Kids' Quran memorization up to Yasin"),
        ManagedApp("bonian", "com.toffaha.bonian", "bonian", "🏢", "بُنيان", "Bonian",
            "حسابات العمارة: الشهرية والمصروفات والمتأخرات", "Building fees, expenses & overdue units"),
        ManagedApp("jama", BuildConfig.APPLICATION_ID, "arkhas", "🧩", "جاما", "JAMA",
            "مدير التطبيقات — بيثبّت ويحدّث الكل", "App manager — installs and updates everything", tagPrefix = "jama-v"),
    )

    data class Release(val code: Int, val name: String, val url: String, val size: Long, val notes: String)

    /** latest release per app id (filled by check) */
    val latest = ConcurrentHashMap<String, Release>()
    val status = ConcurrentHashMap<String, String>()     // idle / downloading / installing / error
    val pct = ConcurrentHashMap<String, Int>()
    val error = ConcurrentHashMap<String, String>()
    @Volatile var checkedAt = 0L
    @Volatile var checkError = ""

    fun app(id: String) = APPS.first { it.id == id }

    private fun get(url: String, accept: String = "application/vnd.github+json"): HttpURLConnection {
        var u = url
        repeat(6) {
            val c = URL(u).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.setRequestProperty("User-Agent", "JAMA-Android")
            c.setRequestProperty("Accept", accept)
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

    private fun text(url: String) = get(url).inputStream.bufferedReader().use { it.readText() }

    private fun toRelease(r: JSONObject): Release? {
        val code = Regex("(\\d+)$").find(r.optString("tag_name"))?.groupValues?.get(1)?.toIntOrNull() ?: return null
        val assets = r.optJSONArray("assets") ?: JSONArray()
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.optString("name").endsWith(".apk") } ?: return null
        return Release(code, "1.0.$code", apk.optString("browser_download_url"), apk.optLong("size"), r.optString("body").take(1500))
    }

    /** Ask GitHub for every app's newest release. */
    fun check(): Boolean {
        var ok = true
        for (a in APPS) {
            try {
                val rel = if (a.tagPrefix == null) toRelease(JSONObject(text("https://api.github.com/repos/$OWNER/${a.repo}/releases/latest")))
                else {
                    val arr = JSONArray(text("https://api.github.com/repos/$OWNER/${a.repo}/releases?per_page=100"))
                    (0 until arr.length()).map { arr.getJSONObject(it) }
                        .filter { it.optString("tag_name").startsWith(a.tagPrefix) && !it.optBoolean("draft") }
                        .mapNotNull { toRelease(it) }.maxByOrNull { it.code }
                }
                if (rel != null) latest[a.id] = rel
            } catch (e: Exception) { ok = false; checkError = e.message ?: "error" }
        }
        if (ok) checkError = ""
        checkedAt = System.currentTimeMillis()
        return ok
    }

    /** installed versionCode, or -1 */
    fun installedCode(ctx: Context, pkg: String): Long = try {
        val i = ctx.packageManager.getPackageInfo(pkg, 0)
        if (Build.VERSION.SDK_INT >= 28) i.longVersionCode else @Suppress("DEPRECATION") i.versionCode.toLong()
    } catch (e: Exception) { -1 }

    fun installedName(ctx: Context, pkg: String): String =
        runCatching { ctx.packageManager.getPackageInfo(pkg, 0).versionName ?: "" }.getOrDefault("")

    fun hasUpdate(ctx: Context, a: ManagedApp): Boolean {
        val cur = installedCode(ctx, a.pkg); val r = latest[a.id] ?: return false
        return cur >= 0 && r.code > cur
    }

    fun canInstall(ctx: Context) = Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    /** Download the APK (only from this owner's GitHub releases) and hand it to Android's installer. */
    fun downloadAndInstall(ctx: Context, a: ManagedApp, fromBackground: Boolean, onChange: () -> Unit) {
        val r = latest[a.id] ?: throw Exception("no release")
        require(r.url.startsWith("https://github.com/$OWNER/")) { "bad url" }
        status[a.id] = "downloading"; pct[a.id] = 0; error.remove(a.id); onChange()
        try {
            val dir = File(ctx.cacheDir, "apks").apply { mkdirs() }
            val f = File(dir, "${a.id}.apk")
            val c = get(r.url, "application/octet-stream")
            val total = c.contentLengthLong
            var done = 0L; var last = -1
            c.inputStream.use { inp ->
                f.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = inp.read(buf); if (n < 0) break
                        out.write(buf, 0, n); done += n
                        val p = if (total > 0) (done * 100 / total).toInt() else -1
                        if (p != last && (p - last >= 3 || p == 100)) { last = p; pct[a.id] = p; onChange() }
                    }
                }
            }
            if (total > 0 && done != total) throw Exception("download incomplete")
            status[a.id] = "installing"; onChange()
            install(ctx, a, f, fromBackground)
        } catch (e: Exception) {
            status[a.id] = "error"; error[a.id] = e.message ?: "error"; onChange()
            throw e
        }
    }

    private fun install(ctx: Context, a: ManagedApp, apk: File, fromBackground: Boolean) {
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(a.pkg)
        // Android 12+: no prompt when JAMA installed this app last time (first time Android asks once)
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        if (Build.VERSION.SDK_INT >= 34 && a.id == "jama") params.setRequestUpdateOwnership(true)
        params.setSize(apk.length())
        val sid = pi.createSession(params)
        pi.openSession(sid).use { s ->
            apk.inputStream().use { inp -> s.openWrite("${a.id}.apk", 0, apk.length()).use { out -> inp.copyTo(out); s.fsync(out) } }
            val i = Intent(ctx, InstallReceiver::class.java).setAction(InstallReceiver.STATUS)
                .putExtra("app", a.id).putExtra("bg", fromBackground)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(ctx, sid, i, flags).intentSender)
        }
    }

    /** Everything the page shows. */
    fun state(ctx: Context): JSONObject {
        val arr = JSONArray()
        for (a in APPS) {
            val cur = installedCode(ctx, a.pkg); val r = latest[a.id]
            arr.put(JSONObject()
                .put("id", a.id).put("emoji", a.emoji).put("pkg", a.pkg)
                .put("nameAr", a.nameAr).put("nameEn", a.nameEn).put("descAr", a.descAr).put("descEn", a.descEn)
                .put("installed", cur >= 0).put("curCode", cur).put("curName", installedName(ctx, a.pkg))
                .put("latest", r?.code ?: 0).put("latestName", r?.name ?: "").put("size", r?.size ?: 0)
                .put("notes", r?.notes ?: "")
                .put("update", cur >= 0 && r != null && r.code > cur)
                .put("status", status[a.id] ?: "idle").put("pct", pct[a.id] ?: 0).put("error", error[a.id] ?: ""))
        }
        return JSONObject().put("apps", arr).put("checkedAt", checkedAt).put("checkError", checkError)
            .put("canInstall", canInstall(ctx)).put("auto", AutoUpdate.enabled(ctx))
            .put("version", BuildConfig.VERSION_NAME)
    }
}
