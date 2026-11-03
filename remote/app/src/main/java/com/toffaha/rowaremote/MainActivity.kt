package com.toffaha.rowaremote

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
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
import kotlin.concurrent.thread

/**
 * 📺 ROWA Remote — phone → Android TV remote over Wi-Fi.
 * Two ways in, picked automatically: Google TV remote protocol (port 6466, pair with a code)
 * or ADB over Wi-Fi (port 5555, "Allow debugging" once). The doctor explains whatever is blocked.
 */
private val TCL_RISKY = listOf(176, 178, 170, 172, 165, 175, 222, 229, 242, 243, 244, 245, 246, 255, 223, 224, 83, 219, 120, 130, 187)

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var atv: AtvClient
    private lateinit var adb: AdbClient
    private lateinit var tcl: TclClient
    private lateinit var finder: Finder
    private val io = Executors.newFixedThreadPool(3)
    private val prefs by lazy { Updater.prefs(this) }

    /** "atv" | "adb" | "" */
    @Volatile private var mode = ""
    /** "" | probing | noports */
    @Volatile private var phase = ""
    @Volatile private var doctor: JSONObject? = null
    @Volatile private var scanPct = -1
    private val found = LinkedHashMap<String, JSONObject>()
    private var lastText = ""
    @Volatile private var visible = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        atv = AtvClient(applicationContext, { push() }, { txt -> lastText = txt; adbReset(txt); atv.resetText(txt); js("window.onIme&&window.onIme(${JSONObject.quote(txt)})") })
        adb = AdbClient(applicationContext) { push() }
        tcl = TclClient { push() }
        Log.init(applicationContext)
        atv.onGiveUp = { giveUp() }
        // 🛡️ TCL: keys that open TCL's own overlay menus (settings, source, guide, info…) knock over its remote
        // service / the whole TV when injected from a phone → off by default on TCL, user can re-enable
        atv.onHello = { vendor ->
            if (atv.host !in knownGood) prefs.edit().putString("good", (knownGood + atv.host).joinToString(",")).apply()
            if (vendor.contains("TCL", true) && !prefs.getBoolean("tclSafe", false)) {
                atv.blocked.addAll(TCL_RISKY)
                prefs.edit().putBoolean("tclSafe", true).putString("blocked", atv.blocked.joinToString(",")).apply()
                Log.d("TCL detected → overlay keys disabled: ${TCL_RISKY.joinToString(",")}")
                push()
            }
        }
        // 🛡️ keys that crash this TV's remote service (176 Settings proven on TCL v7) + whatever we learn later
        atv.blocked.addAll((prefs.getString("blocked", "176") ?: "176").split(",").mapNotNull { it.trim().toIntOrNull() })
        atv.onBlockedLearned = { k -> prefs.edit().putString("blocked", atv.blocked.joinToString(",")).apply(); js("window.onBlocked&&window.onBlocked($k)"); push() }
        bindWifi()
        finder = Finder(this, { n, h, kind -> addFound(h, n, kind); push() }, { push() })

        val root = FrameLayout(this)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            setBackgroundColor(0xFF07080D.toInt())
            addJavascriptInterface(Bridge(), "Rowa")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    if (req.url.scheme == "file") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, req.url)) }; return true
                }
            }
        }
        root.setBackgroundColor(0xFF07080D.toInt())
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
        Updater.restore(this); Updater.schedule(this)
        InstallReceiver.onDone = { push() }
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        if (Updater.dueForCheck(this)) io.execute { Updater.check(this); push() }
        web.loadUrl("file:///android_asset/index.html")
        // ADB mode: keep "current app" fresh for the 📌 shortcut button
        thread(isDaemon = true, name = "adb-app") {
            while (true) {
                Thread.sleep(7000)
                if (visible && mode == "adb" && adb.connected) runCatching { val a = adb.currentApp(); if (a.isNotEmpty() && a != adb.app) { adb.app = a; push() } }
            }
        }
    }

    private val ui = android.os.Handler(android.os.Looper.getMainLooper())
    private val linger = Runnable { Log.d("left app 3 min → disconnect"); atv.disconnect(); adb.disconnect(); tcl.disconnect() }
    private fun cancelLinger() = ui.removeCallbacks(linger)

    override fun onStart() {
        super.onStart()
        visible = true; InstallReceiver.foreground = true
        cancelLinger()
        val cur = prefs.getString("cur", "") ?: ""
        val st = status()
        if (cur.isNotEmpty() && (live || st == "connecting" || st == "recovering" || st == "pairing" || st == "code" || st == "auth")) { push(); return }
        if (cur.isNotEmpty()) connectTv(cur, nameOf(cur), save = false) else scan()
    }

    override fun onStop() {
        super.onStop()
        visible = false; InstallReceiver.foreground = false
        finder.finish()
        ui.postDelayed(linger, 3 * 60_000L)
    }

    // ---------------- connection ----------------
    private val method get() = prefs.getString("method", "auto") ?: "auto"
    private val curHost get() = prefs.getString("cur", "") ?: ""

    private fun connectTv(host: String, name: String, save: Boolean = true) {
        if (host.isBlank()) return
        if (save) saveTv(host, name)
        cancelLinger()
        atv.disconnect(); adb.disconnect(); tcl.disconnect()
        atv.host = host; atv.name = name; adb.host = host; adb.name = name; tcl.host = host; tcl.name = name
        doctor = null
        val m = method
        Log.d("connect $name $host method=$m")
        when (m) {
            "adb" -> { mode = "adb"; phase = ""; adb.connect(host, name) }
            "tcl" -> { mode = "tcl"; phase = ""; tcl.connect(host, name) }
            "atv" -> { mode = "atv"; phase = ""; atv.connect(host, name) }
            else -> {
                // 📺 auto: TCL's own channel (4123) first — on TCL-platform sets like ROWA it never touches the
                // Google remote service that freezes. No 6466 probing (that service is fragile).
                mode = ""; phase = "probing"; push()
                io.execute {
                    val t = Net.open(host, TclClient.PORT, 2500)
                    Log.d("auto: TCL port 4123 ${if (t) "open → TCL mode" else "closed → Google remote"}")
                    runOnUiThread {
                        if (curHost.isNotEmpty() && curHost != host) return@runOnUiThread
                        phase = ""
                        if (t) { mode = "tcl"; tcl.connect(host, name) } else { mode = "atv"; atv.connect(host, name) }
                        push()
                    }
                }
            }
        }
        push()
    }

    /** Google remote never answered → auto: try ADB; otherwise show the connection check */
    private fun giveUp() = io.execute {
        val h = curHost.ifEmpty { atv.host }
        Log.d("google remote not answering → " + if (method == "auto") "trying ADB" else "connection check")
        if (method == "auto" && Net.open(h, TclClient.PORT, 3000)) { Log.d("→ TCL port 4123 open, using TCL mode"); runOnUiThread { mode = "tcl"; phase = ""; tcl.connect(h, nameOf(h)) }; return@execute }
        if (method == "auto" && Net.open(h, Net.ADB, 4000)) { runOnUiThread { mode = "adb"; phase = ""; adb.connect(h, nameOf(h)) }; return@execute }
        // 🧊 TV answers ping but 6466 swallows the connection (timeout, not refused) = its remote service is frozen
        //    from an earlier session. Only a power cut clears it → say so right away, no 1-minute search.
        val pingOk = runCatching { java.net.InetAddress.getByName(h).isReachable(2000) }.getOrDefault(false)
        if (pingOk && atv.error == "timeout" && (h in knownGood || h == curHost)) {
            Log.d("TV $h answers ping but port 6466 is silent → TV remote service frozen (needs power cut)")
            phase = "frozen"; doctor = null; push(); runDoctor(h); return@execute
        }
        // 🔀 the TV may have a new IP after a restart (router gave .7 to another device) → look for it and follow
        if (!rescued.contains(h)) {
            rescued.add(h)
            phase = "searching"; push()
            Log.d("searching the network for the TV (maybe new IP)")
            runOnUiThread { finder.start(10) }
            Net.scan(applicationContext, { hit -> if (hit.adb) addFound(hit.host, null, "adb"); if (hit.atv) addFound(hit.host, null, "atv"); if (hit.cast) addFound(hit.host, null, "cast") }, { p -> scanPct = p; push() })
            Thread.sleep(1500)
            val name = nameOf(h)
            val cand = synchronized(found) { found.values.filter { it.optString("host") != h && (it.optBoolean("atv") || it.optBoolean("adb")) } }
            val pick = cand.firstOrNull { it.optString("name") == name } ?: cand.firstOrNull { it.optString("name").contains("rowa", true) } ?: cand.singleOrNull()
            if (pick != null) {
                val nh = pick.optString("host")
                Log.d("TV found at new address $nh → reconnecting")
                runOnUiThread { connectTv(nh, if (name.startsWith("TV ") || name == h) pick.optString("name") else name) }
                return@execute
            }
            Log.d("no other TV with an open remote/ADB port found")
        }
        phase = "noports"; doctor = null; push(); runDoctor(h)
    }
    private val rescued = mutableSetOf<String>()
    private val knownGood: Set<String> get() = (prefs.getString("good", "") ?: "").split(",").filter { it.isNotBlank() }.toSet()

    /** send TV traffic over Wi-Fi even when Android prefers mobile data (Wi-Fi "without internet") */
    @Volatile private var wifiOk = true
    private fun bindWifi() = runCatching {
        val cm = getSystemService(android.net.ConnectivityManager::class.java)
        val req = android.net.NetworkRequest.Builder().addTransportType(android.net.NetworkCapabilities.TRANSPORT_WIFI).build()
        cm.registerNetworkCallback(req, object : android.net.ConnectivityManager.NetworkCallback() {
            override fun onAvailable(n: android.net.Network) {
                cm.bindProcessToNetwork(n)
                val was = wifiOk; wifiOk = true
                if (!was && visible) runOnUiThread { if (curHost.isNotEmpty()) connectTv(curHost, nameOf(curHost), save = false) }
                push()
            }
            override fun onLost(n: android.net.Network) {
                if (cm.boundNetworkForProcess == n) cm.bindProcessToNetwork(null)
                wifiOk = false; push()
            }
        })
    }

    private fun runDoctor(host: String) = io.execute {
        val r = Net.doctor(applicationContext, host)
        doctor = JSONObject(r).put("at", System.currentTimeMillis()); push()
        val ports = Net.portScan(host)
        val open = ports.filterValues { it == "open" }.keys.sorted().map { "$it ${Net.VENDOR_PORTS[it]}" }
        doctor?.put("ports", JSONArray(open)); push()
    }

    private fun status(): String = phase.ifEmpty {
        when (mode) { "atv" -> atv.status; "adb" -> adb.status; "tcl" -> tcl.status; else -> "idle" }
    }
    private val live get() = (mode == "atv" && atv.connected) || (mode == "adb" && adb.connected) || (mode == "tcl" && tcl.connected)

    // ---------------- discovery ----------------
    private fun addFound(host: String, name: String?, kind: String) {
        synchronized(found) {
            val o = found.getOrPut(host) { JSONObject().put("host", host).put("name", "TV $host") }
            if (!name.isNullOrBlank() && (kind != "cast" || o.optString("name").startsWith("TV "))) o.put("name", name)
            when (kind) { "atv" -> o.put("atv", true); "adb" -> o.put("adb", true); "cast" -> o.put("cast", true); "old" -> o.put("old", true) }
        }
        autoPick(host)
    }

    /** first run: take the TV named ROWA, or the only TV found */
    private fun autoPick(host: String) {
        val o = synchronized(found) { found[host] } ?: return
        val usable = o.optBoolean("atv") || o.optBoolean("adb")
        val name = o.optString("name")
        if (curHost.isNotEmpty()) {
            // saved TV got a new address from the router → follow it
            val a = tvs()
            for (i in 0 until a.length()) { val t = a.getJSONObject(i)
                if (usable && t.optString("name") == name && !name.startsWith("TV ") && t.optString("host") != host && !live) { runOnUiThread { connectTv(host, name) }; return } }
            return
        }
        val usableCount = synchronized(found) { found.values.count { it.optBoolean("atv") || it.optBoolean("adb") } }
        if (usable && (name.contains("rowa", true) || usableCount == 1)) runOnUiThread { if (curHost.isEmpty()) connectTv(host, name) }
    }

    private fun scan() {
        runOnUiThread { finder.start() }
        if (scanPct in 0..99) return
        if (live) { Log.d("scan: connected → mDNS only, no port probing"); return }
        scanPct = 0; push()
        io.execute {
            Net.scan(applicationContext, { h -> if (h.adb) addFound(h.host, null, "adb"); if (h.atv) addFound(h.host, null, "atv"); if (h.cast) addFound(h.host, null, "cast"); push() },
                { p -> scanPct = p; push() })
            scanPct = 100; push()
        }
    }

    // ---------------- saved TVs ----------------
    private fun tvs(): JSONArray = runCatching { JSONArray(prefs.getString("tvs", "[]")) }.getOrDefault(JSONArray())
    private fun nameOf(host: String): String {
        val a = tvs(); for (i in 0 until a.length()) if (a.getJSONObject(i).optString("host") == host) return a.getJSONObject(i).optString("name")
        return host
    }
    private fun saveTv(host: String, name: String) {
        val a = tvs(); val out = JSONArray()
        for (i in 0 until a.length()) { val o = a.getJSONObject(i); if (o.optString("host") != host && o.optString("name") != name) out.put(o) }
        out.put(JSONObject().put("host", host).put("name", name))
        prefs.edit().putString("tvs", out.toString()).putString("cur", host).apply()
    }

    // ---------------- actions ----------------
    private fun key(code: Int) { when (mode) { "atv" -> atv.key(code); "adb" -> adb.key(code); "tcl" -> tcl.key(code) } }
    private fun adbReset(v: String) { adb.resetText(v) }

    private fun keepOn() {
        if (prefs.getBoolean("keepOn", false)) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** 🔊 phone volume buttons control the TV */
    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        if (prefs.getBoolean("volKeys", true) && live &&
            (e.keyCode == KeyEvent.KEYCODE_VOLUME_UP || e.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || e.keyCode == KeyEvent.KEYCODE_VOLUME_MUTE)) {
            if (e.action == KeyEvent.ACTION_DOWN) { key(e.keyCode); buzz() }
            return true
        }
        return super.dispatchKeyEvent(e)
    }

    private fun buzz() {
        if (prefs.getBoolean("haptic", true)) runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING) }
    }

    private fun js(code: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(code, null) }

    /** ADB for the extras (app manager / screenshot), also when the remote itself runs on the Google protocol */
    private fun ensureAdb(): Boolean {
        if (adb.connected) return true
        val h = curHost.ifEmpty { return false }
        if (!Net.open(h, Net.ADB, 2000)) return false
        if (adb.status != "connecting" && adb.status != "auth") adb.connect(h, nameOf(h))
        repeat(60) { if (adb.connected) return true; if (adb.status == "offline") return false; Thread.sleep(500) }
        return adb.connected
    }

    fun state(): JSONObject {
        val f = JSONArray(); synchronized(found) { found.values.forEach { f.put(it) } }
        val st = status()
        return JSONObject()
            .put("status", st).put("mode", mode).put("method", method)
            .put("error", when (mode) { "adb" -> adb.error; "tcl" -> tcl.error; else -> atv.error })
            .put("host", curHost.ifEmpty { atv.host }).put("name", nameOf(curHost).takeIf { curHost.isNotEmpty() } ?: "")
            .put("on", if (mode == "atv") (atv.isOn ?: JSONObject.NULL) else JSONObject.NULL)
            .put("vol", if (mode == "atv") atv.volLevel else -1).put("volMax", atv.volMax).put("muted", atv.muted)
            .put("app", if (mode == "adb") adb.app else atv.app)
            .put("tclKeys", JSONArray(TclClient.KEYS.keys.toList()))
            .put("blocked", JSONArray(if (mode == "atv") atv.blocked.toList() else emptyList<Int>()))
            .put("adbTools", adb.connected).put("adbStatus", adb.status)
            .put("doctor", doctor ?: JSONObject.NULL)
            .put("tvs", tvs()).put("found", f).put("scanning", finder.running || scanPct in 0..99).put("scanPct", scanPct)
            .put("haptic", prefs.getBoolean("haptic", true)).put("volKeys", prefs.getBoolean("volKeys", true))
            .put("keepOn", prefs.getBoolean("keepOn", false)).put("autoKb", prefs.getBoolean("autoKb", true))
            .put("autoUpdate", Updater.auto(this)).put("lang", prefs.getString("lang", "ar"))
            .put("apps", runCatching { JSONArray(prefs.getString("apps", null)) }.getOrNull() ?: JSONObject.NULL)
            .put("wiz", prefs.getString("wiz", "")).put("setup", prefs.getString("setup", "")).put("phone", Net.localIp() ?: "").put("wifi", wifiOk)
            .put("version", BuildConfig.VERSION_NAME).put("code", BuildConfig.VERSION_CODE)
            .put("latest", Updater.latestCode).put("update", Updater.hasUpdate()).put("notes", Updater.notes)
            .put("upStatus", Updater.status).put("upPct", Updater.pct).put("upError", Updater.error)
    }

    fun push() { val s = state().toString(); js("window.onRowa&&window.onRowa($s)") }

    inner class Bridge {
        @JavascriptInterface fun state(): String = this@MainActivity.state().toString()
        @JavascriptInterface fun key(code: Int) { this@MainActivity.key(code); buzz() }
        /** long press: Google mode sends one normal press (no down/up pair that can get stuck); ADB does a real long press */
        @JavascriptInterface fun keyDown(code: Int) {
            when (mode) { "atv" -> atv.key(code); "adb" -> adb.key(code, long = true); "tcl" -> tcl.key(code) }; buzz()
        }
        @JavascriptInterface fun keyUp(code: Int) {}
        @JavascriptInterface fun repeat(code: Int) = this@MainActivity.key(code)
        @JavascriptInterface fun text(t: String) {
            if (mode == "adb") adb.text(t) else atv.text(t)
            lastText = t
        }
        @JavascriptInterface fun clearText() {
            val n = maxOf(lastText.length, 20).coerceAtMost(80)
            if (mode == "adb") { adb.keys(67, n); adb.resetText() } else { atv.resetText("x".repeat(n)); atv.text("") }
            lastText = ""
        }
        /** ADB opens apps reliably (no Play Store needed) → use it whenever it's connected */
        @JavascriptInterface fun launch(link: String) { if (adb.connected) adb.launch(link) else if (mode == "atv") atv.launch(link); buzz() }
        @JavascriptInterface fun scan() = this@MainActivity.scan()
        @JavascriptInterface fun use(host: String, name: String) {
            val h = host.trim(); if (h.isEmpty()) return
            runOnUiThread { connectTv(h, name.ifBlank { "TV $h" }) }
        }
        @JavascriptInterface fun forget(host: String) {
            val a = tvs(); val out = JSONArray()
            for (i in 0 until a.length()) if (a.getJSONObject(i).optString("host") != host) out.put(a.getJSONObject(i))
            prefs.edit().putString("tvs", out.toString()).apply()
            if (curHost == host) { prefs.edit().remove("cur").apply(); atv.disconnect(); adb.disconnect(); tcl.disconnect(); mode = ""; phase = "" }
            push()
        }
        @JavascriptInterface fun reconnect() = runOnUiThread { rescued.clear(); if (curHost.isNotEmpty()) connectTv(curHost, nameOf(curHost), save = false) }
        @JavascriptInterface fun doctor() { if (curHost.isNotEmpty()) { doctor = null; push(); runDoctor(curHost) } }
        @JavascriptInterface fun pair() { if (mode != "atv") { mode = "atv"; phase = ""; atv.host = curHost; atv.name = nameOf(curHost) }; atv.startPairing() }
        @JavascriptInterface fun code(c: String): Boolean = atv.submitCode(c)
        @JavascriptInterface fun cancelPair() = atv.cancelPairing()
        @JavascriptInterface fun resetKey() { atv.disconnect(); Cert.reset(applicationContext); reconnect() }
        @JavascriptInterface fun setPref(k: String, v: String) {
            val e = prefs.edit()
            when (k) {
                "haptic", "volKeys", "keepOn", "autoKb", "autoUpdate" -> e.putBoolean(k, v == "true")
                "lang", "apps", "method", "wiz", "setup" -> e.putString(k, v)
                else -> return
            }
            e.apply()
            if (k == "keepOn") runOnUiThread { keepOn() }
            if (k == "autoUpdate") Updater.schedule(this@MainActivity)
            if (k == "method") reconnect()
            push()
        }
        @JavascriptInterface fun log(): String = Log.text()
        @JavascriptInterface fun shareLog() = runOnUiThread {
            val txt = "ROWA Remote ${BuildConfig.VERSION_NAME} · ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}\n\n" + Log.text()
            runCatching { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, txt), "Log")) }
        }
        // ---- ⚡ ADB auto-setup wizard helpers ----
        @JavascriptInterface fun probeAdb() = io.execute {
            val h = curHost; val ok = h.isNotEmpty() && Net.open(h, Net.ADB, 2500)
            js("window.onAdbProbe&&window.onAdbProbe($ok)")
        }
        @JavascriptInterface fun adbConnect() = io.execute { ensureAdb(); push() }
        // ---- 🧹 TV app manager + 📸 screenshot (ADB) ----
        @JavascriptInterface fun packages() = io.execute {
            if (!ensureAdb()) { js("window.onPkgs&&window.onPkgs(null)"); return@execute }
            val arr = JSONArray(); adb.packages().forEach { (p, sys, dis) -> arr.put(JSONObject().put("p", p).put("sys", sys).put("off", dis)) }
            js("window.onPkgs&&window.onPkgs($arr)")
        }
        @JavascriptInterface fun pkg(p: String, action: String) = io.execute {
            if (!Regex("[A-Za-z0-9_.]+").matches(p) || !ensureAdb()) return@execute
            val r = when (action) { "off" -> adb.disable(p); "on" -> adb.enable(p); "del" -> adb.uninstall(p); "open" -> { adb.launch(p); "" }; else -> "" }
            js("window.onPkgDone&&window.onPkgDone(${JSONObject.quote(p)},${JSONObject.quote(action)},${JSONObject.quote(r.trim().take(200))})")
        }
        @JavascriptInterface fun shot() = io.execute {
            val png = if (ensureAdb()) adb.screenshot() else null
            js("window.onShot&&window.onShot(${if (png == null) "null" else "'" + Base64.encodeToString(png, Base64.NO_WRAP) + "'"})")
        }
        @JavascriptInterface fun unblock() { atv.blocked.clear(); prefs.edit().putString("blocked", "").apply(); push() }
        @JavascriptInterface fun checkUpdate() = io.execute { Updater.check(this@MainActivity); push() }
        @JavascriptInterface fun installUpdate() {
            if (!Updater.canInstall(this@MainActivity)) {
                runOnUiThread { runCatching { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } }
                return
            }
            io.execute { runCatching { Updater.downloadAndInstall(this@MainActivity, false) { push() } }; push() }
        }
        @JavascriptInterface fun open(url: String) = runOnUiThread { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
    }
}
