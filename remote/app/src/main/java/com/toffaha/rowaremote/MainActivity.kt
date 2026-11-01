package com.toffaha.rowaremote

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.WindowManager
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
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** 📺 ROWA Remote — the phone becomes the TV remote (Android TV Remote v2 over Wi-Fi). */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var tv: AtvClient
    private lateinit var finder: Finder
    private val net = Executors.newSingleThreadExecutor()
    private val found = LinkedHashMap<String, String>()   // host -> name (this scan)
    private val prefs by lazy { Updater.prefs(this) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tv = AtvClient(applicationContext, { push() }, { txt -> js("window.onIme&&window.onIme(${JSONObject.quote(txt)})") })
        finder = Finder(this, { n, h -> synchronized(found) { found[h] = n }; autoPick(n, h); push() }, { push() })

        val root = FrameLayout(this)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            setBackgroundColor(0xFF0B0D12.toInt())
            isHapticFeedbackEnabled = true
            addJavascriptInterface(Bridge(), "Rowa")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    if (req.url.scheme == "file") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, req.url)) }; return true
                }
            }
        }
        root.setBackgroundColor(0xFF0B0D12.toInt())
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        WindowCompat.getInsetsController(window, root).apply { isAppearanceLightStatusBars = false; isAppearanceLightNavigationBars = false }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.rowaBack&&window.rowaBack()?'1':'0'") { if (it?.contains("1") != true) finish() }
            }
        })
        keepOn()
        Updater.restore(this)
        Updater.schedule(this)
        InstallReceiver.onDone = { push() }
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        if (Updater.dueForCheck(this)) net.execute { Updater.check(this); push() }
        web.loadUrl("file:///android_asset/index.html")
    }

    override fun onStart() {
        super.onStart()
        InstallReceiver.foreground = true
        val cur = prefs.getString("cur", "") ?: ""
        if (cur.isNotEmpty()) tv.connect(cur, nameOf(cur)) else finder.start()
    }

    override fun onStop() {
        super.onStop()
        InstallReceiver.foreground = false
        tv.disconnect(); finder.finish()
    }

    // ---- saved TVs ----
    private fun tvs(): JSONArray = runCatching { JSONArray(prefs.getString("tvs", "[]")) }.getOrDefault(JSONArray())
    private fun nameOf(host: String): String {
        val a = tvs(); for (i in 0 until a.length()) if (a.getJSONObject(i).optString("host") == host) return a.getJSONObject(i).optString("name")
        return host
    }
    private fun saveTv(host: String, name: String) {
        val a = tvs(); val out = JSONArray()
        for (i in 0 until a.length()) if (a.getJSONObject(i).optString("host") != host) out.put(a.getJSONObject(i))
        out.put(JSONObject().put("host", host).put("name", name))
        prefs.edit().putString("tvs", out.toString()).putString("cur", host).apply()
    }
    /** first time: grab the TV called ROWA (or the only TV found) automatically */
    private fun autoPick(name: String, host: String) {
        if ((prefs.getString("cur", "") ?: "").isNotEmpty()) {
            // DHCP gave the saved TV a new address → follow it
            val a = tvs()
            for (i in 0 until a.length()) { val o = a.getJSONObject(i)
                if (o.optString("name") == name && o.optString("host") != host && !tv.connected) { saveTv(host, name); runOnUiThread { tv.connect(host, name) }; return } }
            return
        }
        if (name.contains("rowa", true) || synchronized(found) { found.size } == 1) { saveTv(host, name); runOnUiThread { tv.connect(host, name) } }
    }

    private fun keepOn() {
        if (prefs.getBoolean("keepOn", false)) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** 🔊 phone volume buttons control the TV */
    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        if (prefs.getBoolean("volKeys", true) && tv.connected &&
            (e.keyCode == KeyEvent.KEYCODE_VOLUME_UP || e.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || e.keyCode == KeyEvent.KEYCODE_VOLUME_MUTE)) {
            if (e.action == KeyEvent.ACTION_DOWN) { tv.key(e.keyCode); buzz() }
            return true
        }
        return super.dispatchKeyEvent(e)
    }

    private fun buzz() {
        if (prefs.getBoolean("haptic", true)) runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING) }
    }

    private fun js(code: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(code, null) }

    fun state(): JSONObject {
        val f = JSONArray(); synchronized(found) { found.forEach { (h, n) -> f.put(JSONObject().put("host", h).put("name", n)) } }
        return JSONObject()
            .put("status", tv.status).put("error", tv.error).put("host", tv.host).put("name", tv.name)
            .put("on", tv.isOn ?: JSONObject.NULL).put("vol", tv.volLevel).put("volMax", tv.volMax).put("muted", tv.muted)
            .put("app", tv.app).put("model", tv.tvModel).put("vendor", tv.tvVendor)
            .put("tvs", tvs()).put("found", f).put("scanning", finder.running)
            .put("haptic", prefs.getBoolean("haptic", true)).put("volKeys", prefs.getBoolean("volKeys", true))
            .put("keepOn", prefs.getBoolean("keepOn", false)).put("autoKb", prefs.getBoolean("autoKb", true))
            .put("autoUpdate", Updater.auto(this)).put("lang", prefs.getString("lang", "ar"))
            .put("apps", runCatching { JSONArray(prefs.getString("apps", null)) }.getOrNull() ?: JSONObject.NULL)
            .put("version", BuildConfig.VERSION_NAME).put("code", BuildConfig.VERSION_CODE)
            .put("latest", Updater.latestCode).put("update", Updater.hasUpdate()).put("notes", Updater.notes)
            .put("upStatus", Updater.status).put("upPct", Updater.pct).put("upError", Updater.error)
    }

    fun push() { val s = state().toString(); js("window.onRowa&&window.onRowa($s)") }

    inner class Bridge {
        @JavascriptInterface fun state(): String = this@MainActivity.state().toString()
        @JavascriptInterface fun key(code: Int) { tv.key(code); buzz() }
        @JavascriptInterface fun keyDown(code: Int) { tv.key(code, AtvClient.LONG_START); buzz() }
        @JavascriptInterface fun keyUp(code: Int) = tv.key(code, AtvClient.LONG_END)
        @JavascriptInterface fun repeat(code: Int) = tv.key(code)
        @JavascriptInterface fun text(t: String) = tv.text(t)
        @JavascriptInterface fun launch(link: String) { tv.launch(link); buzz() }
        @JavascriptInterface fun scan() { synchronized(found) { found.clear() }; runOnUiThread { finder.start() }; push() }
        @JavascriptInterface fun use(host: String, name: String) {
            val h = host.trim(); if (h.isEmpty()) return
            saveTv(h, name.ifBlank { h }); runOnUiThread { tv.connect(h, name.ifBlank { h }) }
        }
        @JavascriptInterface fun forget(host: String) {
            val a = tvs(); val out = JSONArray()
            for (i in 0 until a.length()) if (a.getJSONObject(i).optString("host") != host) out.put(a.getJSONObject(i))
            prefs.edit().putString("tvs", out.toString()).apply()
            if (prefs.getString("cur", "") == host) { prefs.edit().remove("cur").apply(); tv.disconnect() }
            push()
        }
        @JavascriptInterface fun reconnect() = runOnUiThread { tv.connect() }
        @JavascriptInterface fun pair() = tv.startPairing()
        @JavascriptInterface fun code(c: String): Boolean = tv.submitCode(c)
        @JavascriptInterface fun cancelPair() = tv.cancelPairing()
        /** new phone identity → every TV must pair again */
        @JavascriptInterface fun resetKey() { tv.disconnect(); Cert.reset(applicationContext); runOnUiThread { tv.connect() } }
        @JavascriptInterface fun setPref(k: String, v: String) {
            val e = prefs.edit()
            when (k) {
                "haptic", "volKeys", "keepOn", "autoKb", "autoUpdate" -> e.putBoolean(k, v == "true")
                "lang", "apps" -> e.putString(k, v)
                else -> return
            }
            e.apply()
            if (k == "keepOn") runOnUiThread { keepOn() }
            if (k == "autoUpdate") Updater.schedule(this@MainActivity)
            push()
        }
        @JavascriptInterface fun checkUpdate() = net.execute { Updater.check(this@MainActivity); push() }
        @JavascriptInterface fun installUpdate() {
            if (!Updater.canInstall(this@MainActivity)) {
                runOnUiThread { runCatching { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } }
                return
            }
            net.execute { runCatching { Updater.downloadAndInstall(this@MainActivity, false) { push() } }; push() }
        }
        @JavascriptInterface fun open(url: String) = runOnUiThread { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
    }
}
