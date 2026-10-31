package eg.arkhas.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** 🔎 Shows the Google Lens results for the photo inside the app; product links open in their store app / browser. */
class LensSheet(private val act: MainActivity, root: FrameLayout) {
    private val sheet = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE); visibility = View.GONE }
    private val web = WebView(act)

    init {
        val bar = LinearLayout(act).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#FF2D63")); setPadding(8, 8, 8, 8)
        }
        val t = TextView(act).apply { text = "🔎 Google Lens"; setTextColor(Color.WHITE); textSize = 16f; setPadding(24, 0, 0, 0) }
        val close = Button(act).apply { text = "✕"; setTextColor(Color.parseColor("#FF2D63")); setBackgroundColor(Color.WHITE); setOnClickListener { hide() } }
        bar.addView(t, LinearLayout.LayoutParams(0, -2, 1f))
        bar.addView(close, LinearLayout.LayoutParams(-2, -2))
        sheet.addView(bar, LinearLayout.LayoutParams(-1, -2))
        sheet.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(sheet, FrameLayout.LayoutParams(-1, -1))
        setup()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup() {
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.userAgentString = Net.DESKTOP_UA
        web.settings.useWideViewPort = true
        web.settings.loadWithOverviewMode = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val h = req.url.host ?: ""
                if (h.endsWith("google.com") || h.endsWith("gstatic.com") || h.endsWith("google.com.eg")) return false
                runCatching { act.startActivity(Intent(Intent.ACTION_VIEW, req.url)) }   // a shop's product page
                return true
            }
        }
    }

    val visible get() = sheet.visibility == View.VISIBLE
    fun show(url: String) { web.loadUrl(url); sheet.visibility = View.VISIBLE; sheet.bringToFront() }
    fun hide() { sheet.visibility = View.GONE }
    fun back(): Boolean { if (!visible) return false; if (web.canGoBack()) web.goBack() else hide(); return true }
}
