package eg.arkhas.app

import android.annotation.SuppressLint
import android.content.Context
import android.Manifest
import android.content.Intent
import android.os.Build
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Arkhas runs entirely on the phone: the page (web/index.html + engine.js) does the searching,
 * this activity gives it network access (Net), a hidden browser for JS-heavy stores (Renderer),
 * settings storage, and self-updates (web files from GitHub, APK from GitHub Releases).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private val renderers = mutableListOf<Renderer>()  // 3 hidden browsers -> JS stores load in parallel
    private val prefs by lazy { getSharedPreferences("arkhas", Context.MODE_PRIVATE) }
    @Volatile private var pendingQuery: String = ""
    @Volatile private var openDeals = false
    private lateinit var photoSearch: PhotoSearch
    private lateinit var lensSheet: LensSheet

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        photoSearch = PhotoSearch(this) { r -> runOnUiThread { web.evaluateJavascript("window.__photo&&window.__photo(${r})", null) } }

        val root = FrameLayout(this)
        // invisible browsers for rendering JS stores; still laid out so pages run normally
        repeat(3) {
            val hidden = WebView(this).apply { visibility = View.INVISIBLE }
            root.addView(hidden, FrameLayout.LayoutParams(-1, -1))
            renderers += Renderer(hidden)
        }
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            addJavascriptInterface(Bridge(), "Native")
            webViewClient = ShellClient()
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        lensSheet = LensSheet(this, root)
        setContentView(root)
        keepClearOfNotch(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (lensSheet.back()) return; if (web.canGoBack()) web.goBack() else finish() }
        })

        pendingQuery = sharedText(intent) ?: ""
        openDeals = intent?.getBooleanExtra("openDeals", false) == true
        DealAlerts.schedule(this)   // keep the background check alive after updates
        AutoUpdate.schedule(this)   // 🤫 silent auto-update (Settings switch)
        web.loadUrl(WebFiles.indexUrl(this))

        // newest UI / store rules from GitHub -> used from next start
        thread { runCatching { WebFiles.update(this) } }
    }

    /**
     * Android 15 draws apps edge-to-edge: without this the page sits under the status bar / camera notch.
     * Pad the content by the system bars, the display cutout and the keyboard.
     */
    private var rootView: View? = null

    private fun keepClearOfNotch(root: View) {
        rootView = root
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        root.setBackgroundColor(if (dark) 0xFF14130F.toInt() else 0xFFF6F3EC.toInt())
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra("openDeals", false)) web.evaluateJavascript("window.arkhasOpen&&window.arkhasOpen('deals')", null)
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
                val wait = o.optString("wait").ifBlank { null }
                runOnUiThread { renderers.minBy { it.load }.render(url, wait) { ok, html -> reply(ok, html) } }
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
        /** 📷 search by photo: "camera" or "gallery" -> window.__photo(result) */
        @JavascriptInterface fun photo(mode: String) { runOnUiThread { if (mode == "camera") photoSearch.camera() else photoSearch.gallery() } }
        @JavascriptInterface fun lens(): Boolean = photoSearch.lens()
        /** 🔎 upload the last photo to Google Lens -> window.__lens(id, {ok, url}) */
        @JavascriptInterface fun lensUpload(id: Int) = Net.pool.execute {
            val r = photoSearch.lensUpload().toString()
            runOnUiThread { web.evaluateJavascript("window.__lens&&window.__lens($id,$r)", null) }
        }
        @JavascriptInterface fun lensShow(url: String) { runOnUiThread { lensSheet.show(url) } }
        /** 🎟️ copy a promo code */
        @JavascriptInterface fun copy(text: String) {
            runOnUiThread {
                val cm = getSystemService(android.content.ClipboardManager::class.java)
                cm?.setPrimaryClip(android.content.ClipData.newPlainText("code", text))
            }
        }
        /** 🤫 Settings switch for silent auto-update */
        @JavascriptInterface fun setAutoUpdate(on: Boolean) {
            prefs.edit().putString("p_autoUpd", if (on) "1" else "0").apply()
            AutoUpdate.schedule(this@MainActivity)
        }
        @JavascriptInterface fun lastUpdateError(): String = prefs.getString("updErr", "") ?: ""
        /** 🛒 first installed package from a comma list, or "" */
        @JavascriptInterface fun hasApp(pkgs: String): String = pkgs.split(",").map { it.trim() }.firstOrNull { p ->
            p.isNotEmpty() && runCatching { packageManager.getPackageInfo(p, 0); true }.getOrDefault(false) } ?: ""
        /** 🛒 open a product/cart link inside that store's app; falls back to the normal chooser/browser */
        @JavascriptInterface fun openApp(url: String, pkg: String) {
            runOnUiThread {
                val u = android.net.Uri.parse(url)
                val ok = pkg.isNotBlank() && runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, u).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
                }.getOrDefault(false)
                if (!ok) runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
            }
        }
        /** 🎨 status/nav bar colour follows the page theme (header gradient start). */
        @JavascriptInterface fun setBars(color: String, lightBars: Boolean) {
            val c = runCatching { android.graphics.Color.parseColor(color) }.getOrNull() ?: return
            runOnUiThread {
                val r = rootView ?: return@runOnUiThread
                r.setBackgroundColor(c)
                WindowCompat.getInsetsController(window, r).apply {
                    isAppearanceLightStatusBars = lightBars
                    isAppearanceLightNavigationBars = lightBars
                }
            }
        }
        @JavascriptInterface fun pendingQuery(): String = pendingQuery.also { pendingQuery = "" }

        // ---- 🔔 deal alerts (Settings). Config is saved by the page in pref "alerts". ----
        @JavascriptInterface fun isBackground(): Boolean = false
        @JavascriptInterface fun pendingView(): String = (if (openDeals) "deals" else "").also { openDeals = false }
        @JavascriptInterface fun setAlerts(json: String) {
            prefs.edit().putString("p_alerts", json).apply()
            val on = runCatching { JSONObject(json).optBoolean("on") }.getOrDefault(false)
            runOnUiThread {
                if (on && !DealAlerts.canNotify(this@MainActivity) && Build.VERSION.SDK_INT >= 33)
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41)
                DealAlerts.schedule(this@MainActivity)
            }
        }
        @JavascriptInterface fun testAlerts() = DealAlerts.runNow(this@MainActivity)
        @JavascriptInterface fun canNotify(): Boolean = DealAlerts.canNotify(this@MainActivity)
        @JavascriptInterface fun defaultTgToken(): String = BuildConfig.TG_TOKEN

        // ---- in-app update (Settings → Updates). Answers via window.__native(id, ok, text) like fetch. ----
        private fun answer(id: Int, ok: Boolean, text: String) =
            runOnUiThread { web.evaluateJavascript("window.__native($id,$ok,${JSONObject.quote(text)})", null) }

        /** Latest GitHub release vs this app. force=false uses a 6 h cache. */
        @JavascriptInterface
        fun checkUpdate(id: Int, force: Boolean) = Net.pool.execute {
            try { answer(id, true, Updater.check(this@MainActivity, force).toString()) }
            catch (e: Exception) { answer(id, false, e.message ?: "error") }
        }

        /** Download the APK (progress -> window.__updProgress(pct)) and open the Android installer. */
        @JavascriptInterface
        fun installUpdate(id: Int, url: String) = Net.pool.execute {
            try {
                val apk = Updater.download(this@MainActivity, url) { pct ->
                    runOnUiThread { web.evaluateJavascript("window.__updProgress&&window.__updProgress($pct)", null) }
                }
                runOnUiThread {
                    if (Updater.canInstall(this@MainActivity)) {
                        // 🤫 PackageInstaller: silent on Android 12+ once Arkhas installed itself; old way if that fails
                        val ok = runCatching { Updater.installSilent(this@MainActivity, apk, fromBackground = false) }.isSuccess
                        if (!ok) Updater.install(this@MainActivity, apk)
                        answer(id, true, "installing")
                    }
                    else answer(id, true, "need-permission")   // user flips the switch, comes back, taps again
                }
            } catch (e: Exception) { answer(id, false, e.message ?: "error") }
        }

        /** Pull the newest store list / search page from GitHub now; reloads the page when something changed. */
        @JavascriptInterface
        fun refreshWeb(id: Int) = Net.pool.execute {
            try {
                val changed = WebFiles.update(this@MainActivity)
                answer(id, true, if (changed) "changed" else "same")
                if (changed) runOnUiThread { web.postDelayed({ web.loadUrl(WebFiles.indexUrl(this@MainActivity)) }, 1200) }
            } catch (e: Exception) { answer(id, false, e.message ?: "error") }
        }

        @JavascriptInterface fun webVersion(): String =
            java.io.File(WebFiles.dir(this@MainActivity), "stores.json").takeIf { it.exists() }?.lastModified()?.toString() ?: "bundled"
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

}
