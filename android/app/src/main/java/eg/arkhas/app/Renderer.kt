package eg.arkhas.app

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Loads JavaScript-heavy store pages (Noon, B.TECH, Carrefour) in an invisible WebView
 * and hands back the rendered HTML. One page at a time; everything runs on the main thread.
 */
class Renderer(private val view: WebView) {
    private data class Job(val url: String, val wait: String?, val done: (Boolean, String) -> Unit)

    private val queue = ArrayDeque<Job>()
    private var current: Job? = null
    private val main = Handler(Looper.getMainLooper())
    private var polls = 0

    init { setup() }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup() {
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.blockNetworkImage = true
        view.settings.userAgentString = Net.DESKTOP_UA
        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(v: WebView, url: String?) {
                if (current != null && polls == 0) poll()
            }
        }
    }

    fun render(url: String, wait: String?, done: (Boolean, String) -> Unit) = main.post {
        queue.addLast(Job(url, wait, done))
        if (current == null) next()
    }

    private fun next() {
        val job = queue.removeFirstOrNull() ?: run { current = null; return }
        current = job; polls = 0
        view.loadUrl(job.url)
        main.postDelayed({ if (current === job) grab(job) }, 20_000)  // hard timeout
    }

    /** Wait until the product-card selector shows up (max ~10s), then grab the HTML. */
    private fun poll() {
        val job = current ?: return
        polls++
        val check = if (job.wait.isNullOrBlank()) "true"
        else "!!document.querySelector(${JSONObject.quote(job.wait)})"
        view.evaluateJavascript("(function(){window.scrollBy(0,1500);try{return $check}catch(e){return false}})()") { r ->
            if (current !== job) return@evaluateJavascript
            if (r == "true" || polls >= 14) main.postDelayed({ grab(job) }, 600)
            else main.postDelayed({ poll() }, 700)
        }
    }

    private fun grab(job: Job) {
        if (current !== job) return
        view.evaluateJavascript("document.documentElement.outerHTML") { r ->
            if (current !== job) return@evaluateJavascript
            current = null
            val html = try { JSONTokener(r).nextValue() as? String ?: "" } catch (_: Exception) { "" }
            view.stopLoading()
            job.done(html.isNotEmpty(), if (html.isNotEmpty()) html else "render failed")
            next()
        }
    }
}
