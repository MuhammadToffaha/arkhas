package eg.arkhas.app

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The search UI + engine + store rules live in /web of the GitHub repo.
 * A copy ships inside the APK; on every start we fetch the newest copy from GitHub
 * and use it from the next start on. So fixing a store = edit web/stores.json + git push. No new APK.
 */
object WebFiles {
    const val BRIDGE_VERSION = 1
    val FILES = listOf("index.html", "engine.js", "stores.json", "synonyms.json", "icon.svg")
    private const val RAW = "https://raw.githubusercontent.com/${BuildConfig.UPDATE_REPO}/main/web/"

    fun dir(ctx: Context) = File(ctx.filesDir, "web")

    /** URL the WebView loads: downloaded copy if complete, else the bundled one. */
    fun indexUrl(ctx: Context): String {
        val d = dir(ctx)
        return if (FILES.all { File(d, it).length() > 0 }) "file://${File(d, "index.html").absolutePath}"
        else "file:///android_asset/web/index.html"
    }

    fun read(ctx: Context, name: String): String {
        require(name in FILES) { "unknown file $name" }
        val f = File(dir(ctx), name)
        return if (indexUrl(ctx).startsWith("file:///android_asset")) ctx.assets.open("web/$name").bufferedReader().readText()
        else f.readText()
    }

    /** Download all files to a temp dir, validate, then swap in atomically. Returns true if something changed. */
    fun update(ctx: Context): Boolean {
        val tmp = File(ctx.cacheDir, "web-new").apply { deleteRecursively(); mkdirs() }
        for (name in FILES) {
            val c = URL(RAW + name + "?t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
            c.connectTimeout = 10_000; c.readTimeout = 15_000
            c.setRequestProperty("Cache-Control", "no-cache")
            if (c.responseCode != 200) return false
            File(tmp, name).writeBytes(c.inputStream.use { it.readBytes() })
        }
        val html = File(tmp, "index.html").readText()
        val need = Regex("""name="arkhas-bridge" content="(\d+)"""").find(html)?.groupValues?.get(1)?.toInt() ?: 99
        if (need > BRIDGE_VERSION) return false  // newer page needs a newer app; keep current files
        if (!html.contains("engine.js") || File(tmp, "engine.js").length() < 1000) return false
        val cur = dir(ctx)
        val changed = FILES.any { !File(cur, it).exists() || !File(cur, it).readBytes().contentEquals(File(tmp, it).readBytes()) }
        if (changed) {
            cur.deleteRecursively()
            tmp.renameTo(cur)
        }
        return changed
    }
}
