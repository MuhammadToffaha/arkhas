package com.toffaha.machich

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

/** 🇩🇪 Mach ich! — German A2 in 30 days. UI = assets/www (HTML/JS), this class = native bridge "Mi". */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val io = Executors.newSingleThreadExecutor()
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false

    companion object { @Volatile var instance: MainActivity? = null }

    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** 🎤 Google speech recognition in German → list of what was heard */
    private val listen = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val heard = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) ?: arrayListOf()
        js("App.onHeard(${JSONObject.quote(JSONArray(heard).toString())})")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#F4F6FB")) }
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.textZoom = 100
            settings.mediaPlaybackRequiresUserGesture = false
            isVerticalScrollBarEnabled = false
            overScrollMode = WebView.OVER_SCROLL_NEVER
            setBackgroundColor(Color.TRANSPARENT)
            addJavascriptInterface(Bridge(), "Mi")
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
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, ins ->
            val b = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }
        web.loadUrl("file:///android_asset/www/index.html")

        tts = TextToSpeech(this) { st ->
            if (st == TextToSpeech.SUCCESS) {
                val r = tts?.setLanguage(Locale.GERMANY) ?: TextToSpeech.LANG_NOT_SUPPORTED
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("App.back()") { r -> if (r != "true") finish() }
            }
        })

        if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        UpdateWorker.schedule(this)
        Reminder.schedule(this)
    }

    override fun onResume() { super.onResume(); Prefs.inForeground = true }
    override fun onPause() { super.onPause(); Prefs.inForeground = false; tts?.stop() }
    override fun onDestroy() { tts?.shutdown(); if (instance === this) instance = null; super.onDestroy() }

    fun js(code: String) = runOnUiThread { runCatching { web.evaluateJavascript(code, null) } }
    fun installMsg(m: String) = js("App.onInstallMsg(${JSONObject.quote(m)})")

    private val dataFile get() = File(filesDir, "data.json")

    inner class Bridge {
        @JavascriptInterface fun load(): String = runCatching { dataFile.readText() }.getOrDefault("")

        /** atomic write — progress never lost */
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

        /** 🔊 German voice. rate 1.0 normal, 0.7 slow */
        @JavascriptInterface fun speak(text: String, rate: Float) = runOnUiThread {
            if (!ttsReady) { js("App.toast('🔇 Install German voice: Settings → Text-to-speech')"); return@runOnUiThread }
            tts?.setSpeechRate(rate)
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u")
        }
        @JavascriptInterface fun stopSpeak() = runOnUiThread { tts?.stop() }
        @JavascriptInterface fun hasVoice(): Boolean = ttsReady

        /** 🎤 speak German — result comes back to App.onHeard */
        @JavascriptInterface fun listen(prompt: String) = runOnUiThread {
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
            }
            try { listen.launch(i) } catch (e: ActivityNotFoundException) { js("App.toast('🎤 No speech service — install Google app')"); js("App.onHeard('[]')") }
        }

        @JavascriptInterface fun checkUpdate() = io.execute {
            val r = runCatching { Updater.latest() }.getOrNull()
            js("App.onUpdate(${JSONObject.quote(r?.json() ?: "")})")
        }

        @JavascriptInterface fun installUpdate(url: String) = io.execute {
            val ctx = this@MainActivity
            if (!Updater.canInstall(ctx)) {
                installMsg("🔐 Allow \"Install apps\" for Mach ich! then tap Update again"); Updater.askInstallPermission(ctx); return@execute
            }
            try {
                var last = -1
                val f = Updater.download(ctx, url) { p -> val pc = (p * 100).toInt(); if (pc != last) { last = pc; js("App.onProgress($p)") } }
                installMsg("📦 Installing…")
                Updater.install(ctx, f)
            } catch (e: Exception) { installMsg("⚠️ Download failed: ${e.message}") }
        }

        @JavascriptInterface fun openUrl(url: String) = runOnUiThread {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: ActivityNotFoundException) { }
        }
    }
}
