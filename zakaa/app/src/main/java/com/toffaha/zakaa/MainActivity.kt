package com.toffaha.zakaa

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** 🧠 ذكاء — puzzles for kids. UI = assets/www (HTML/JS), this class = native bridge "Zk". */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val io = Executors.newSingleThreadExecutor()

    companion object { @Volatile var instance: MainActivity? = null }

    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#FFF6E5")) }
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.textZoom = 100
            settings.mediaPlaybackRequiresUserGesture = false
            isVerticalScrollBarEnabled = false
            overScrollMode = WebView.OVER_SCROLL_NEVER
            setBackgroundColor(Color.TRANSPARENT)
            addJavascriptInterface(Bridge(), "Zk")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                    if (req.url.scheme == "file") return false
                    try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (e: ActivityNotFoundException) { }
                    return true
                }
            }
        }
        root.addView(web)
        setContentView(root)
        // Android 15 draws edge-to-edge: keep the page out of the status / nav bars.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, ins ->
            val b = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }
        web.loadUrl("file:///android_asset/www/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("App.back()") { r -> if (r != "true") finish() }
            }
        })

        if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        UpdateWorker.schedule(this)
    }

    override fun onResume() { super.onResume(); Prefs.inForeground = true }
    override fun onPause() { super.onPause(); Prefs.inForeground = false }
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }

    fun js(code: String) = runOnUiThread { runCatching { web.evaluateJavascript(code, null) } }
    fun installMsg(m: String) = js("App.onInstallMsg(${JSONObject.quote(m)})")

    private val dataFile get() = File(filesDir, "data.json")

    inner class Bridge {
        @JavascriptInterface fun load(): String = runCatching { dataFile.readText() }.getOrDefault("")

        /** atomic write, so a kid closing the app mid-save never loses the stars */
        @JavascriptInterface fun save(json: String) {
            synchronized(this) {
                val tmp = File(filesDir, "data.tmp")
                tmp.writeText(json)
                if (!tmp.renameTo(dataFile)) { dataFile.writeText(json); tmp.delete() }
            }
        }

        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun versionCode(): Int = BuildConfig.VERSION_CODE
        @JavascriptInterface fun getPref(k: String, d: String): String = Prefs.get(this@MainActivity, k, d)
        @JavascriptInterface fun setPref(k: String, v: String) = Prefs.set(this@MainActivity, k, v)

        @JavascriptInterface fun checkUpdate() = io.execute {
            val r = runCatching { Updater.latest() }.getOrNull()
            js("App.onUpdate(${JSONObject.quote(r?.json() ?: "")})")
        }

        @JavascriptInterface fun installUpdate(url: String) = io.execute {
            val ctx = this@MainActivity
            if (!Updater.canInstall(ctx)) {
                installMsg("🔐 فعّل \"تثبيت التطبيقات\" لذكاء وارجع اضغط حدّث"); Updater.askInstallPermission(ctx); return@execute
            }
            try {
                var last = -1
                val f = Updater.download(ctx, url) { p -> val pc = (p * 100).toInt(); if (pc != last) { last = pc; js("App.onProgress($p)") } }
                installMsg("📦 بيتثبت…")
                Updater.install(ctx, f)
            } catch (e: Exception) { installMsg("⚠️ فشل التحميل: ${e.message}") }
        }

        @JavascriptInterface fun openUrl(url: String) = runOnUiThread {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: ActivityNotFoundException) { }
        }
    }
}
