package eg.arkhas.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Arkhas runs entirely on the phone: the page (web/index.html + engine.js) does the searching,
 * this activity gives it network access (Net), a hidden browser for JS-heavy stores (Renderer),
 * settings storage, and self-updates (web files from GitHub, APK from GitHub Releases).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var renderer: Renderer
    private val prefs by lazy { getSharedPreferences("arkhas", Context.MODE_PRIVATE) }
    @Volatile private var pendingQuery: String = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        // invisible browser for rendering JS stores; still laid out so pages run normally
        val hidden = WebView(this).apply { visibility = View.INVISIBLE }
        root.addView(hidden, FrameLayout.LayoutParams(-1, -1))
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            addJavascriptInterface(Bridge(), "Native")
            webViewClient = ShellClient()
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        renderer = Renderer(hidden)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })

        pendingQuery = sharedText(intent) ?: ""
        web.loadUrl(WebFiles.indexUrl(this))

        // newest UI / store rules from GitHub -> used from next start
        thread { runCatching { WebFiles.update(this) } }
        checkForApkUpdate()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        sharedText(intent)?.let { q -> web.evaluateJavascript("window.arkhasSearch(${JSONObject.quote(q)})", null) }
    }

    /** Text from Share / text-selection menu, cleaned to a short product phrase. */
    private fun sharedText(i: Intent?): String? = when (i?.action) {
        Intent.ACTION_SEND -> i.getStringExtra(Intent.EXTRA_TEXT)
        Intent.ACTION_PROCESS_TEXT -> i.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        else -> null
    }?.replace(Regex("https?://\\S+"), " ")?.replace(Regex("\\s+"), " ")?.trim()?.take(80)?.ifBlank { null }

    // ---------------- bridge used by web/index.html ----------------
    inner class Bridge {
        /** Async fetch; answers via window.__native(id, ok, text). opts: {lang, render, wait, json} */
        @JavascriptInterface
        fun fetch(id: Int, url: String, opts: String) {
            val o = runCatching { JSONObject(opts) }.getOrDefault(JSONObject())
            val lang = o.optString("lang", "en")
            val reply = { ok: Boolean, text: String ->
                runOnUiThread { web.evaluateJavascript("window.__native($id,$ok,${JSONObject.quote(text)})", null) }
            }
            if (!url.startsWith("https://") && !url.startsWith("http://")) return reply(false, "bad url")
            if (o.optBoolean("render")) {
                renderer.render(url, o.optString("wait").ifBlank { null }) { ok, html -> reply(ok, html) }
            } else {
                Net.pool.execute {
                    try { reply(true, Net.get(url, lang, o.optBoolean("json"))) }
                    catch (e: Exception) { reply(false, e.message ?: e.javaClass.simpleName) }
                }
            }
        }

        @JavascriptInterface fun getPref(k: String): String = prefs.getString("p_$k", "") ?: ""
        @JavascriptInterface fun setPref(k: String, v: String) = prefs.edit().putString("p_$k", v).apply()
        @JavascriptInterface fun readConfig(name: String): String = WebFiles.read(this@MainActivity, name)
        @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun pendingQuery(): String = pendingQuery.also { pendingQuery = "" }
    }

    // ---------------- links: result pages open in their own app / browser ----------------
    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val u = req.url
            if (u.scheme == "file") return false
            try { startActivity(Intent(Intent.ACTION_VIEW, u)) }
            catch (_: Exception) { Toast.makeText(this@MainActivity, u.toString(), Toast.LENGTH_SHORT).show() }
            return true
        }
    }

    // ---------------- APK self-update via GitHub Releases ----------------
    private fun checkForApkUpdate() {
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastUpdateCheck", 0) < 12 * 3600_000) return
        prefs.edit().putLong("lastUpdateCheck", now).apply()
        thread {
            runCatching {
                val c = URL("https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/latest").openConnection() as HttpURLConnection
                c.setRequestProperty("Accept", "application/vnd.github+json")
                c.connectTimeout = 8000; c.readTimeout = 8000
                val json = JSONObject(c.inputStream.bufferedReader().readText())
                val latest = json.getString("tag_name").removePrefix("v").toIntOrNull() ?: 0
                val assets = json.getJSONArray("assets")
                val apk = (0 until assets.length()).map { assets.getJSONObject(it) }
                    .firstOrNull { it.getString("name").endsWith(".apk") }?.getString("browser_download_url")
                if (latest > BuildConfig.VERSION_CODE && apk != null) runOnUiThread {
                    AlertDialog.Builder(this)
                        .setTitle(R.string.update_title)
                        .setMessage(getString(R.string.update_msg, "1.0.$latest"))
                        .setPositiveButton(R.string.download) { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apk))) }
                        .setNegativeButton(R.string.later, null)
                        .show()
                }
            }
        }
    }
}
