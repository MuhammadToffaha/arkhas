package eg.arkhas.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * 🛒 Add to cart in the user's real Amazon / noon / Jumia account.
 *
 * One WebView with the app's shared cookie jar:
 *  - "Store accounts" shows it full-screen on the store's sign-in page (the user signs in themselves, once);
 *  - "🛒" loads the product invisibly, runs web/cartbot.js to press the store's own Add-to-cart button,
 *    and reports back. Carts are per account, so the item shows up in the store app's cart too.
 *  - if it can't finish on its own (size to pick, not signed in, page changed) the same page is shown
 *    so the user just taps Add to cart there.
 */
class CartBot(private val act: MainActivity, root: FrameLayout, private val onResult: (Int, String, String) -> Unit) {

    companion object {
        val LOGIN = mapOf(
            "amazon" to "https://www.amazon.eg/gp/css/homepage.html?language=en_AE",
            "noon" to "https://www.noon.com/egypt-en/account_mobile/",
            "jumia" to "https://www.jumia.com.eg/customer/account/login/"
        )
        val NAMES = mapOf("amazon" to "Amazon", "noon" to "noon", "jumia" to "Jumia")
        fun storeOf(url: String): String? {
            val h = runCatching { android.net.Uri.parse(url).host ?: "" }.getOrDefault("").lowercase()
            return when {
                h == "amazon.eg" || h.endsWith(".amazon.eg") -> "amazon"
                h == "noon.com" || h.endsWith(".noon.com") -> "noon"
                h == "jumia.com.eg" || h.endsWith(".jumia.com.eg") -> "jumia"
                else -> null
            }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val sheet = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE) }
    private val title = TextView(act).apply { setTextColor(Color.WHITE); textSize = 16f; setPadding(32, 0, 16, 0) }
    private val web = WebView(act)
    private var job: Job? = null
    private val queue = ArrayDeque<Job>()

    private class Job(val id: Int, val url: String, val store: String) { var clicked = false; var done = false }

    init {
        val bar = LinearLayout(act).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#FF2D63")); setPadding(8, 8, 8, 8)
        }
        val close = Button(act).apply {
            text = "✓  Done / تم"; setTextColor(Color.parseColor("#FF2D63")); setBackgroundColor(Color.WHITE); isAllCaps = false
            setOnClickListener { hide() }
        }
        bar.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        bar.addView(close, LinearLayout.LayoutParams(-2, -2))
        sheet.addView(bar, LinearLayout.LayoutParams(-1, -2))
        sheet.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        sheet.visibility = View.INVISIBLE      // laid out (pages run normally) but not drawn / touchable
        root.addView(sheet, FrameLayout.LayoutParams(-1, -1))
        setup()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup() {
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.javaScriptCanOpenWindowsAutomatically = false
        // some stores refuse embedded browsers; look like normal mobile Chrome
        web.settings.userAgentString = web.settings.userAgentString.replace("; wv", "").replace(Regex("Version/[\\d.]+ "), "")
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.addJavascriptInterface(Js(), "ArkCart")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val j = job ?: return
                if (j.done) return
                val js = runCatching { WebFiles.read(act, "cartbot.js") }.getOrNull() ?: return
                view.evaluateJavascript("window.__ARK_STORE=${JSONObject.quote(j.store)};window.__ARK_CLICKED=${j.clicked};$js", null)
            }
            // store app links (intent://, market://) stay inside this page
            override fun shouldOverrideUrlLoading(view: WebView, req: android.webkit.WebResourceRequest): Boolean =
                req.url.scheme != "https" && req.url.scheme != "http"
        }
    }

    private inner class Js {
        @JavascriptInterface fun clicked() { main.post { job?.clicked = true } }
        @JavascriptInterface fun result(json: String) { main.post { finish(runCatching { JSONObject(json) }.getOrDefault(JSONObject())) } }
    }

    val visible get() = sheet.visibility == View.VISIBLE

    /** Store accounts: show the sign-in page. */
    fun login(store: String) {
        val u = LOGIN[store] ?: return
        job?.let { it.done = true }; job = null
        title.text = "🔐 ${NAMES[store]} — sign in / سجّل دخولك"
        web.loadUrl(u)
        show()
    }

    fun add(id: Int, url: String) {
        val s = storeOf(url) ?: return onResult(id, "unsupported", "")
        queue.addLast(Job(id, url, s))
        if (job == null) next()
    }

    private fun next() {
        val j = queue.removeFirstOrNull() ?: return
        job = j
        web.stopLoading()
        web.loadUrl(j.url)
        main.postDelayed({ if (job === j && !j.done) finish(JSONObject().put("status", "unsure")) }, 30_000)
    }

    private fun finish(r: JSONObject) {
        val j = job ?: return
        if (j.done) return
        j.done = true
        val st = r.optString("status", "unsure")
        CookieManager.getInstance().flush()
        val name = NAMES[j.store]
        when (st) {
            "ok" -> toast("✅ Added to $name cart · اتضاف لعربة $name")
            "signin" -> { toast("🔐 Sign in to $name once, then tap 🛒 again · سجّل دخول $name مرة واحدة"); title.text = "🔐 $name — sign in / سجّل دخولك"; show() }
            else -> { toast("👆 Tap “Add to cart” on the page · اضغط أضف للعربة"); title.text = "🛒 $name"; show() }
        }
        onResult(j.id, st, r.optString("msg"))
        job = null
        if (!visible) next()      // if the page is shown, wait until the user closes it
    }

    private fun show() { sheet.visibility = View.VISIBLE; sheet.bringToFront() }

    fun hide() {
        sheet.visibility = View.INVISIBLE
        CookieManager.getInstance().flush()
        act.cartSheetClosed()
        next()
    }

    private fun toast(s: String) = Toast.makeText(act, s, Toast.LENGTH_LONG).show()

    /** Back button: close the sheet (or go back inside it) instead of leaving the app. */
    fun back(): Boolean {
        if (!visible) return false
        if (web.canGoBack()) web.goBack() else hide()
        return true
    }
}
