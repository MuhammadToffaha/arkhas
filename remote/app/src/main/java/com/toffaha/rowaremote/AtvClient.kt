package com.toffaha.rowaremote

import android.content.Context
import android.os.Build
import java.io.BufferedInputStream
import java.io.OutputStream
import java.math.BigInteger
import java.net.InetSocketAddress
import java.net.Socket
import java.security.MessageDigest
import java.security.interfaces.RSAPublicKey
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import javax.net.ssl.SSLException
import javax.net.ssl.SSLSocket
import kotlin.concurrent.thread

/**
 * 📺 Android TV Remote protocol v2 — the same one Google's "Google TV" phone app uses.
 * Port 6467 = pairing (code shown on the TV), port 6466 = the remote itself (keys, text, apps, volume, power state).
 * No ADB, no developer options: the TV only needs the built-in "Android TV Remote Service".
 */
class AtvClient(private val ctx: Context, private val onChange: () -> Unit, private val onIme: (String) -> Unit) {

    companion object {
        const val PORT_REMOTE = 6466
        const val PORT_PAIR = 6467
        // PING | KEY | POWER | VOLUME | APP_LINK — no IME: keyboard sync upsets some TVs' remote service (TCL v7)
        const val FEATURES = 1 or 2 or 32 or 64 or 512
        const val SHORT = 3; const val LONG_START = 1; const val LONG_END = 2
    }

    @Volatile var host = ""
    @Volatile var name = ""
    /** idle · connecting · connected · recovering · needpair · pairing · code · paired · offline */
    @Volatile var status = "idle"
    @Volatile var error = ""
    @Volatile var isOn: Boolean? = null
    @Volatile var volLevel = -1
    @Volatile var volMax = 100
    @Volatile var muted = false
    @Volatile var app = ""
    @Volatile var tvModel = ""
    @Volatile var tvVendor = ""
    /** keep reconnecting while the screen is open */
    @Volatile var wanted = false
    /** called when the TV never answered on 6466 (twice) — MainActivity then tries ADB / shows the check */
    @Volatile var onGiveUp: (() -> Unit)? = null
    private var everConnected = false
    /** after a drop: keep trying quietly until this time (TV may be restarting itself) */
    @Volatile private var recoverUntil = 0L
    /** called once per session with the TV vendor (MainActivity applies TCL-safe keys) */
    @Volatile var onHello: ((String) -> Unit)? = null
    private var activeFeatures = FEATURES

    private var gen = 0
    private var sock: Socket? = null
    private var out: OutputStream? = null
    private var pairSock: SSLSocket? = null
    private var pairOut: OutputStream? = null
    private var imeCounter = 0
    private var fieldCounter = 0
    private val writer = Executors.newSingleThreadExecutor()

    private fun set(s: String, e: String = "") { if (s != status || e != error) Log.d("google: $s${if (e.isNotEmpty()) " ($e)" else ""}"); status = s; error = e; onChange() }

    private fun open(port: Int, readTimeout: Int): SSLSocket {
        // cheap TVs nap their Wi-Fi: a ping wakes the radio, then a patient connect
        runCatching { java.net.InetAddress.getByName(host).isReachable(800) }
        val plain = Socket().apply { connect(InetSocketAddress(host, port), 10_000); tcpNoDelay = true; keepAlive = true }
        val s = Cert.ssl(ctx).socketFactory.createSocket(plain, host, port, true) as SSLSocket
        s.soTimeout = 10_000
        s.startHandshake()
        s.soTimeout = readTimeout
        return s
    }

    @Synchronized private fun closeAll() {
        gen++
        runCatching { sock?.close() }; runCatching { pairSock?.close() }
        sock = null; out = null; pairSock = null; pairOut = null
    }

    fun disconnect() { wanted = false; recoverUntil = 0; closeAll(); if (status != "needpair") set("idle") }

    /** connect to the remote port; tells the UI "needpair" if the TV doesn't know this phone yet */
    fun connect(h: String = host, n: String = name) {
        if (h.isBlank()) return
        closeAll()
        if (h != host) everConnected = false
        host = h; name = n; wanted = true
        val g = synchronized(this) { gen }
        set("connecting")
        thread(name = "atv-remote") { runRemote(g, 0) }
    }

    private fun runRemote(g: Int, attempt: Int) {
        var configured = false
        var reached = false
        try {
            val s = open(PORT_REMOTE, 0)
            reached = true
            synchronized(this) { if (g != gen) { s.close(); return }; sock = s; out = s.outputStream }
            val inp = BufferedInputStream(s.inputStream)
            while (g == gen) {
                val m = Msg.read(inp)
                rx(m)
                if (m.has(1)) configured = true
                handle(m)
            }
        } catch (e: Exception) {
            if (g != gen) return
            Log.d("google: link ended reached=$reached configured=$configured ${e.javaClass.simpleName}: ${e.message}")
            // TV dropped us within 2 s of a special key → that key kills this TV's remote service: never send it again
            if (configured && lastSentKey != 0 && lastSentKey !in core && System.currentTimeMillis() - lastSentAt < 2000 && blocked.add(lastSentKey)) {
                Log.d("google: key $lastSentKey crashed the TV's remote service → blocked from now on")
                onBlockedLearned?.invoke(lastSentKey)
            }
            synchronized(this) { sock = null; out = null }
            val now = System.currentTimeMillis()
            if (configured) recoverUntil = now + 240_000
            when {
                // 🔁 link was working, then dropped → quiet, spaced reconnects for up to 4 min (no hammering)
                wanted && everConnected && now < recoverUntil -> {
                    set("recovering", if (configured) "dropped" else "waiting")
                    Thread.sleep(if (configured) 8000 else 15_000)
                    if (g == gen && wanted) runRemote(g, 0)
                }
                // TV answered but dropped us before configuring → it doesn't trust this phone yet
                !configured && (reached || e is SSLException) -> { wanted = false; set("needpair") }
                !everConnected && attempt >= 1 -> {
                    wanted = false
                    set("unreachable", if (e is java.net.SocketTimeoutException) "timeout" else if (e is java.net.ConnectException) "refused" else (e.message ?: ""))
                    onGiveUp?.invoke()
                }
                wanted && (attempt == 0 || configured) -> {
                    set("offline", "reconnecting")
                    Thread.sleep(6000)   // give a struggling TV time; never hammer it
                    if (g == gen && wanted) { set("connecting"); runRemote(g, if (configured) 0 else 1) }
                }
                wanted -> {
                    wanted = false
                    set("offline", if (everConnected) "gaveup" else (e.message ?: "unreachable"))
                }
                else -> set("offline", e.message ?: "")
            }
        }
    }

    private fun handle(m: Msg) {
        when {
            m.has(1) -> {   // remote_configure: TV says hello + what it supports
                val c = m.msg(1)!!
                val supported = c.int(1)
                Log.d("google: TV hello features=$supported model=${c.msg(2)?.str(1)} vendor=${c.msg(2)?.str(2)} ver=${c.msg(2)?.str(6)}")
                c.msg(2)?.let { tvModel = it.str(1); tvVendor = it.str(2) }
                val active = if (supported != 0) FEATURES and supported else FEATURES
                activeFeatures = active
                send(PB().msg(1, PB().int(1, active).msg(2, PB().int(3, 1).str(4, "1").str(5, "atvremote").str(6, "1.0.0"))))
                everConnected = true; recoverUntil = 0
                set("connected")
                onHello?.invoke(c.msg(2)?.str(2) ?: "")
            }
            m.has(2) -> send(PB().msg(2, PB().int(1, activeFeatures)))            // remote_set_active: echo the agreed set
            m.has(8) -> send(PB().msg(9, PB().int(1, m.msg(8)?.int(1) ?: 0)))     // ping → pong
            m.has(20) -> {                                                          // ime key inject: current app + text field
                val k = m.msg(20)!!
                k.msg(1)?.str(12)?.takeIf { it.isNotEmpty() }?.let { if (it != app) { app = it; onChange() } }
            }
            m.has(21) -> { val b = m.msg(21)!!; imeCounter = b.int(1); fieldCounter = b.int(2) }
            m.has(22) -> {                                                          // TV opened its keyboard
                val txt = m.msg(22)?.msg(2)?.str(2) ?: ""
                onIme(txt)
            }
            m.has(40) -> { isOn = m.msg(40)?.bool(1) ?: true; onChange() }          // power state
            m.has(50) -> {                                                          // volume
                val v = m.msg(50)!!
                volMax = v.int(6).takeIf { it > 0 } ?: 100; volLevel = v.int(7); muted = v.bool(8); onChange()
            }
            m.has(3) -> { Log.d("google: TV sent error"); error = "TV error"; onChange() }
        }
    }

    private val NAMES = mapOf(1 to "configure", 2 to "set_active", 3 to "error", 8 to "ping", 9 to "pong", 10 to "key", 20 to "ime_key", 21 to "ime_edit",
        22 to "ime_show", 30 to "voice_begin", 40 to "start", 50 to "volume", 51 to "vol_adjust", 60 to "audio_dev", 90 to "app_link")
    private fun hex(b: ByteArray) = b.take(48).joinToString("") { "%02x".format(it) } + if (b.size > 48) "…" else ""
    private fun rx(m: Msg) { val k = m.keys().firstOrNull() ?: -1; Log.d("google ⬅ ${NAMES[k] ?: "field$k"} ${hex(m.raw)}") }
    private fun tx(b: ByteArray) { val k = Msg(b).keys().firstOrNull() ?: -1; Log.d("google ➡ ${NAMES[k] ?: "field$k"} ${hex(b)}") }

    private fun send(b: ByteArray) {
        tx(b)
        val data = PB.frame(b)
        writer.execute {
            try { out?.apply { write(data); flush() } }
            catch (e: Exception) { Log.d("google: write failed ${e.message}"); runCatching { sock?.close() } }   // reader thread notices and reconnects
        }
    }
    private fun send(p: PB) = send(p.toBytes())

    val connected get() = status == "connected"

    private val pendingKeys = java.util.concurrent.atomic.AtomicInteger(0)
    @Volatile private var lastKeyAt = 0L

    /**
     * Keys only as SHORT presses, paced (≥160 ms apart) and never piled up: a weak TV that gets a
     * "key down" without its "key up", or a flood of keys, freezes its whole input system.
     */
    /** keys this TV's remote service crashes on (learned + known), persisted by MainActivity */
    val blocked: MutableSet<Int> = java.util.Collections.synchronizedSet(mutableSetOf())
    @Volatile var onBlockedLearned: ((Int) -> Unit)? = null
    @Volatile private var lastSentKey = 0
    @Volatile private var lastSentAt = 0L
    /** the basics never get blocked — a drop right after them is something else */
    private val core = setOf(19, 20, 21, 22, 23, 4, 3, 24, 25, 164, 85, 66, 67)

    fun key(code: Int, dir: Int = SHORT) {
        if (!connected || dir != SHORT) return
        if (code in blocked) { Log.d("google: key $code is blocked on this TV (crashes its remote service)"); return }
        lastSentKey = code; lastSentAt = System.currentTimeMillis()
        if (pendingKeys.get() >= 2) { Log.d("google: key $code dropped (TV still busy)"); return }
        pendingKeys.incrementAndGet()
        val body = PB().msg(10, PB().int(1, code).int(2, SHORT)).toBytes(); tx(body)
        val data = PB.frame(body)
        writer.execute {
            try {
                val wait = 160 - (System.currentTimeMillis() - lastKeyAt)
                if (wait > 0) Thread.sleep(wait)
                out?.apply { write(data); flush() }
                lastKeyAt = System.currentTimeMillis()
            } catch (e: Exception) { runCatching { sock?.close() } }
            finally { pendingKeys.decrementAndGet() }
        }
    }

    private var lastText = ""
    fun resetText(v: String = "") { lastText = v }

    /** Android keycode for a typed character (no IME needed) */
    private fun codeOf(c: Char): Int? = when (c.lowercaseChar()) {
        in 'a'..'z' -> 29 + (c.lowercaseChar() - 'a')
        in '0'..'9' -> 7 + (c - '0')
        ' ' -> 62; '.' -> 56; ',' -> 55; '-' -> 69; '@' -> 77; '/' -> 76; '\'' -> 75; '=' -> 70; '+' -> 81; ';' -> 74
        else -> null
    }

    /** keyboard sends the whole field value → type only the difference as key presses (paced, not dropped) */
    fun text(full: String) {
        if (!connected) return
        var p = 0; while (p < full.length && p < lastText.length && full[p] == lastText[p]) p++
        val codes = List(lastText.length - p) { 67 } + full.substring(p).mapNotNull { codeOf(it) }
        lastText = full
        for (c in codes) {
            val data = PB.frame(PB().msg(10, PB().int(1, c).int(2, SHORT)).toBytes())
            writer.execute {
                try {
                    val wait = 90 - (System.currentTimeMillis() - lastKeyAt); if (wait > 0) Thread.sleep(wait)
                    out?.apply { write(data); flush() }; lastKeyAt = System.currentTimeMillis()
                } catch (_: Exception) { runCatching { sock?.close() } }
            }
        }
    }

    /** open an app: "market://launch?id=<package>" or an app link like https://www.netflix.com/title */
    fun launch(link: String) {
        // intent:/custom schemes can crash some TVs' remote service → only Play Store and web links
        if (connected && (link.startsWith("market://") || link.startsWith("https://") || link.startsWith("http://"))) send(PB().msg(90, PB().str(1, link)))
        else Log.d("google: skipped launch link $link")
    }

    // ---------------- pairing (port 6467, "polo" protocol) ----------------

    private fun polo(fill: PB.() -> Unit): ByteArray = PB().int(1, 2).int(2, 200).apply(fill).toBytes()

    private fun pairSend(b: ByteArray) {
        val data = PB.frame(b)
        writer.execute { try { pairOut?.apply { write(data); flush() } } catch (_: Exception) { runCatching { pairSock?.close() } } }
    }

    fun startPairing() {
        if (host.isBlank()) return
        closeAll(); wanted = false
        val g = synchronized(this) { gen }
        set("pairing")
        thread(name = "atv-pair") {
            try {
                val s = open(PORT_PAIR, 0)
                synchronized(this) { if (g != gen) { s.close(); return@thread }; pairSock = s; pairOut = s.outputStream }
                val inp = BufferedInputStream(s.inputStream)
                val me = "ROWA Remote · ${Build.MODEL}".take(60)
                pairSend(polo { msg(10, PB().str(1, "atvremote").str(2, me)) })
                while (g == gen) {
                    val m = Msg.read(inp)
                    if (m.int(2) != 200) { set("needpair", if (status == "code") "badcode" else "refused ${m.int(2)}"); s.close(); return@thread }
                    when {
                        m.has(11) -> pairSend(polo { msg(20, PB().msg(1, PB().int(1, 3).int(2, 6)).int(3, 1)) })     // options: hex code, 6 chars, we type it
                        m.has(20) -> pairSend(polo { msg(30, PB().msg(1, PB().int(1, 3).int(2, 6)).int(2, 1)) })     // configuration
                        m.has(31) -> set("code")                                                                     // code is on the TV now
                        m.has(41) -> {                                                                               // secret accepted 🎉
                            s.close(); synchronized(this) { pairSock = null; pairOut = null }
                            set("paired"); Thread.sleep(400)
                            if (g == gen) connect(); return@thread
                        }
                    }
                }
            } catch (e: Exception) {
                if (g == gen && status != "paired") set("needpair", if (status == "code") "closed" else (e.message ?: "unreachable"))
            }
        }
    }

    private fun unsigned(b: BigInteger): ByteArray {
        var a = b.toByteArray()
        while (a.size > 1 && a[0] == 0.toByte()) a = a.copyOfRange(1, a.size)
        return a
    }

    /** @return false if the code is wrong (checked locally before sending) */
    fun submitCode(raw: String): Boolean {
        val code = raw.trim().uppercase()
        if (code.length != 6 || !code.all { it in "0123456789ABCDEF" }) return false
        val s = pairSock ?: return false
        val client = Cert.load(ctx).second.publicKey as RSAPublicKey
        val server = (s.session.peerCertificates[0] as X509Certificate).publicKey as RSAPublicKey
        val md = MessageDigest.getInstance("SHA-256")
        md.update(unsigned(client.modulus)); md.update(unsigned(client.publicExponent))
        md.update(unsigned(server.modulus)); md.update(unsigned(server.publicExponent))
        md.update(ByteArray(2) { code.substring(2 + it * 2, 4 + it * 2).toInt(16).toByte() })
        val h = md.digest()
        if ((h[0].toInt() and 0xFF) != code.substring(0, 2).toInt(16)) return false
        pairSend(polo { msg(40, PB().bytes(1, h)) })
        return true
    }

    fun cancelPairing() { closeAll(); set("needpair") }
}
