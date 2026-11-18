package com.toffaha.jama

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.Executors

/** 🧩 JAMA — installs and updates all of Muhammad Toffaha's apps from their GitHub releases. */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val pool = Executors.newSingleThreadExecutor()   // one download/install at a time
    private val net = Executors.newFixedThreadPool(2)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(Bridge(), "Jama")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    if (req.url.scheme == "file") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, req.url)) }
                    return true
                }
            }
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        bars(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.jamaBack&&window.jamaBack()?'1':'0'") { if (it?.contains("1") != true) finish() }
            }
        })
        InstallReceiver.onDone = { push() }
        AutoUpdate.schedule(this)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        web.loadUrl("file:///android_asset/index.html")
    }

    private fun bars(root: View) {
        WindowCompat.getInsetsController(window, root).apply { isAppearanceLightStatusBars = false; isAppearanceLightNavigationBars = false }
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        root.setBackgroundColor(0xFF6C3BFF.toInt())
        web.setBackgroundColor(if (dark) 0xFF0F0B1E.toInt() else 0xFFF5F3FF.toInt())
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }
    }

    override fun onResume() {
        super.onResume()
        InstallReceiver.foreground = true
        push()     // an app may have been installed / removed meanwhile
    }

    override fun onPause() { super.onPause(); InstallReceiver.foreground = false }

    /** send the current state to the page */
    fun push() {
        val s = Store.state(this).toString()
        runOnUiThread { web.evaluateJavascript("window.onJama&&window.onJama($s)", null) }
    }

    inner class Bridge {
        @JavascriptInterface fun state(): String = Store.state(this@MainActivity).toString()
        @JavascriptInterface fun refresh() = net.execute { Store.check(); push() }
        @JavascriptInterface fun install(id: String) {
            if (!Store.canInstall(this@MainActivity)) { askPermission(); return }
            val a = runCatching { Store.app(id) }.getOrNull() ?: return
            Store.status[id] = "queued"; push()
            pool.execute { runCatching { Store.downloadAndInstall(this@MainActivity, a, false) { push() } }; push() }
        }
        @JavascriptInterface fun updateAll() {
            if (!Store.canInstall(this@MainActivity)) { askPermission(); return }
            Store.APPS.filter { Store.hasUpdate(this@MainActivity, it) }.sortedBy { if (it.id == "jama") 1 else 0 }.forEach { install(it.id) }
        }
        @JavascriptInterface fun open(id: String) {
            val a = runCatching { Store.app(id) }.getOrNull() ?: return
            packageManager.getLaunchIntentForPackage(a.pkg)?.let { runOnUiThread { startActivity(it) } }
        }
        @JavascriptInterface fun setAuto(on: Boolean) { AutoUpdate.set(this@MainActivity, on); push() }
        @JavascriptInterface fun allowInstalls() = askPermission()
        // 🤖 AI hub (FreeLLMAPI on the phone via Termux) — slow calls answer through window.onAi(tag, json)
        @JavascriptInterface fun aiSettings(): String = Ai.settings(this@MainActivity).toString()
        @JavascriptInterface fun aiSave(url: String, key: String, model: String): String = try {
            // empty key = keep the saved one (the page never sees the stored key)
            Ai.save(this@MainActivity, url, key.ifBlank { Ai.key(this@MainActivity) }, model); "ok"
        } catch (e: Exception) { e.message ?: "error" }
        @JavascriptInterface fun aiTest() = net.execute { ai("test", Ai.test(this@MainActivity).toString()) }
        @JavascriptInterface fun aiChat(messages: String) = net.execute {
            val r = runCatching { Ai.chat(this@MainActivity, org.json.JSONArray(messages)) }
                .getOrElse { org.json.JSONObject().put("ok", false).put("error", it.message ?: "error") }
            ai("chat", r.toString())
        }
        @JavascriptInterface fun aiStart() {
            if (!Ai.termuxInstalled(this@MainActivity)) {
                runOnUiThread { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/com.termux/"))) } }
                return
            }
            if (!Ai.termuxPermission(this@MainActivity)) { runOnUiThread { requestPermissions(arrayOf(Ai.TERMUX_PERM), 2) }; return }
            val r = runCatching { Ai.startServer(this@MainActivity); "ok" }.getOrElse { it.message ?: "error" }
            ai("start", org.json.JSONObject().put("ok", r == "ok").put("error", r).toString())
        }
        @JavascriptInterface fun aiSetup(): String = Ai.SETUP
        @JavascriptInterface fun copy(text: String) = runOnUiThread {
            getSystemService(android.content.ClipboardManager::class.java)
                .setPrimaryClip(android.content.ClipData.newPlainText("JAMA", text))
        }
        @JavascriptInterface fun openTermux() = runOnUiThread {
            packageManager.getLaunchIntentForPackage(Ai.TERMUX)?.let { startActivity(it) }
                ?: runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/com.termux/"))) }
        }
        @JavascriptInterface fun openDashboard() = runOnUiThread {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Ai.DASHBOARD))) }
        }
        @JavascriptInterface fun releases(id: String) {
            val a = runCatching { Store.app(id) }.getOrNull() ?: return
            runOnUiThread { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/${Store.OWNER}/${a.repo}/releases"))) }
        }
    }

    private fun ai(tag: String, json: String) =
        runOnUiThread { web.evaluateJavascript("window.onAi&&window.onAi('$tag',$json)", null) }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 2) ai("perm", Ai.settings(this).toString())
    }

    private fun askPermission() = runOnUiThread {
        runCatching { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) }
    }
}
