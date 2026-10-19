package eg.arkhas.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

/**
 * Thin native shell around the Arkhas web UI.
 * The UI and all scraping logic live on YOUR server, so most updates need no new APK:
 * change the server, pull-to-refresh, done. The APK itself only checks GitHub Releases for shell updates.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private val prefs by lazy { getSharedPreferences("arkhas", Context.MODE_PRIVATE) }

    private var server: String
        get() = prefs.getString("server", BuildConfig.DEFAULT_SERVER) ?: ""
        set(v) = prefs.edit().putString("server", v.trim().trimEnd('/')).apply()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setSupportMultipleWindows(false) // target=_blank -> shouldOverrideUrlLoading
            webViewClient = ShellClient()
        }
        swipe = SwipeRefreshLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(-1, -1))
            setOnRefreshListener { web.reload() }
            // only pull-to-refresh when the page is scrolled to the top
            setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 }
        }
        setContentView(swipe)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else if (server.isBlank()) askServer(firstRun = true)
        else open(intent)

        checkForUpdate(silent = true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        open(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** Opens the home page, or a search if the app was launched via Share / text selection. */
    private fun open(intent: Intent?) {
        if (server.isBlank()) return askServer(firstRun = true)
        val shared = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        }?.let(::cleanShared)
        val url = if (shared.isNullOrBlank()) "$server/"
        else "$server/?q=" + URLEncoder.encode(shared, "UTF-8")
        web.loadUrl(url)
    }

    /** Shared text often includes a link + promo text; keep a short product-like phrase. */
    private fun cleanShared(t: String): String =
        t.replace(Regex("https?://\\S+"), " ").replace(Regex("\\s+"), " ").trim().take(80)

    // ---------------- menu ----------------
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, R.string.menu_reload)
        menu.add(0, 2, 1, R.string.menu_server)
        menu.add(0, 3, 2, R.string.menu_update)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            1 -> web.reload()
            2 -> askServer(firstRun = false)
            3 -> checkForUpdate(silent = false)
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }

    private fun askServer(firstRun: Boolean) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(server.ifBlank { "http://" })
            setSelection(text.length)
        }
        val pad = (20 * resources.displayMetrics.density).toInt()
        val box = FrameLayout(this).apply { setPadding(pad, 0, pad, 0); addView(input) }
        AlertDialog.Builder(this)
            .setTitle(R.string.server_title)
            .setMessage(R.string.server_msg)
            .setView(box)
            .setCancelable(!firstRun)
            .setPositiveButton(R.string.save) { _, _ ->
                var v = input.text.toString().trim()
                if (!v.startsWith("http")) v = "http://$v"
                server = v
                open(null)
            }
            .apply { if (!firstRun) setNegativeButton(R.string.cancel, null) }
            .show()
    }

    // ---------------- web client ----------------
    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val target = req.url
            val home = Uri.parse(server)
            if (target.host == home.host && target.port == home.port) return false // our UI
            // store / Facebook / Dubizzle links -> their app if installed, else the browser
            try {
                startActivity(Intent(Intent.ACTION_VIEW, target))
            } catch (_: Exception) {
                Toast.makeText(this@MainActivity, target.toString(), Toast.LENGTH_SHORT).show()
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            swipe.isRefreshing = true
        }

        override fun onPageFinished(view: WebView, url: String?) {
            swipe.isRefreshing = false
        }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
            if (!req.isForMainFrame) return
            swipe.isRefreshing = false
            Toast.makeText(this@MainActivity, R.string.cant_reach, Toast.LENGTH_LONG).show()
            askServer(firstRun = false)
        }
    }

    // ---------------- self-update via GitHub Releases ----------------
    private fun checkForUpdate(silent: Boolean) {
        val now = System.currentTimeMillis()
        if (silent && now - prefs.getLong("lastUpdateCheck", 0) < 12 * 3600_000) return
        prefs.edit().putLong("lastUpdateCheck", now).apply()
        thread {
            try {
                val conn = URL("https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/latest")
                    .openConnection() as HttpURLConnection
                conn.setRequestProperty("Accept", "application/vnd.github+json")
                conn.connectTimeout = 8000; conn.readTimeout = 8000
                val json = JSONObject(conn.inputStream.bufferedReader().readText())
                val tag = json.getString("tag_name")               // "v42"
                val latest = tag.removePrefix("v").toIntOrNull() ?: 0
                val assets = json.getJSONArray("assets")
                var apk: String? = null
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.getString("name").endsWith(".apk")) apk = a.getString("browser_download_url")
                }
                runOnUiThread {
                    if (latest > BuildConfig.VERSION_CODE && apk != null) {
                        AlertDialog.Builder(this)
                            .setTitle(R.string.update_title)
                            .setMessage(getString(R.string.update_msg, "1.0.$latest"))
                            .setPositiveButton(R.string.download) { _, _ ->
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apk)))
                            }
                            .setNegativeButton(R.string.later, null)
                            .show()
                    } else if (!silent) {
                        Toast.makeText(this, R.string.update_none, Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                if (!silent) runOnUiThread { Toast.makeText(this, e.message ?: "error", Toast.LENGTH_SHORT).show() }
            }
        }
    }
}
