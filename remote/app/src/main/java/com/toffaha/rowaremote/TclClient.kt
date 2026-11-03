package com.toffaha.rowaremote

import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.Executors
import kotlin.concurrent.thread

/**
 * 📺 TCL's own remote channel (MagiConnect / T-Cast "TV Services", TCP 4123) — what TCL's phone app uses.
 * Completely separate from Google's Android TV Remote Service, which freezes on TCL-platform sets like ROWA.
 * Plain XML, no pairing:
 *   <root><action name="setKey" eventAction="TR_DOWN" keyCode="TR_KEY_OK" /></root>
 * Refs: github.com/featherbear/tcl-link (probes), github.com/popeen/Home-Assistant-Custom-Component-TCL-Remote
 */
class TclClient(private val onChange: () -> Unit) {
    companion object {
        const val PORT = 4123

        /** Android keycode → TCL key name */
        val KEYS: Map<Int, String> = mapOf(
            19 to "UP", 20 to "DOWN", 21 to "LEFT", 22 to "RIGHT", 23 to "OK", 66 to "OK",
            4 to "BACK", 111 to "EXIT", 3 to "HOME", 82 to "OPTION", 26 to "POWER", 224 to "POWER",
            24 to "VOL_UP", 25 to "VOL_DOWN", 164 to "MUTE", 166 to "CH_UP", 167 to "CH_DOWN",
            85 to "PLAYPAUSE", 126 to "PLAY", 127 to "PAUSE", 86 to "PAUSE", 87 to "NEXT", 88 to "PREVIOUS",
            89 to "REW", 90 to "FF", 130 to "REC",
            178 to "SOURCE", 243 to "SOURCE", 244 to "SOURCE", 245 to "SOURCE", 246 to "SOURCE", 242 to "TV", 170 to "TV",
            176 to "MAINMENU", 84 to "SEARCH", 284 to "ALLAPP", 172 to "EPG", 165 to "INFOWINDOW", 175 to "SUBTITLE",
            222 to "LANG", 229 to "PRE_CH", 223 to "SLEEP_DOWN", 255 to "ZOOM_UP",
            183 to "RED", 184 to "GREEN", 185 to "YELLOW", 186 to "BLUE",
            7 to "0", 8 to "1", 9 to "2", 10 to "3", 11 to "4", 12 to "5", 13 to "6", 14 to "7", 15 to "8", 16 to "9",
        )
    }

    @Volatile var host = ""
    @Volatile var name = ""
    /** idle · connecting · connected · offline */
    @Volatile var status = "idle"
    @Volatile var error = ""
    @Volatile var wanted = false
    val connected get() = status == "connected"

    private var gen = 0
    private var sock: Socket? = null
    private var out: OutputStream? = null
    private val writer = Executors.newSingleThreadExecutor()
    @Volatile private var lastAt = 0L
    private val pending = java.util.concurrent.atomic.AtomicInteger(0)

    private fun set(s: String, e: String = "") { if (s != status || e != error) Log.d("tcl: $s${if (e.isNotEmpty()) " ($e)" else ""}"); status = s; error = e; onChange() }

    private fun xml(action: String) = "<?xml version=\"1.0\" encoding=\"utf-8\"?><root>$action</root>".toByteArray()
    private fun cmd(name: String, value: String) = xml("<action name=\"sendCommand\" commandName=\"$name\" commandValue=\"$value\" extra=\"\" />")
    private fun keyXml(k: String, ev: String) = xml("<action name=\"setKey\" eventAction=\"$ev\" keyCode=\"TR_KEY_$k\" />")

    @Synchronized private fun closeSock() {
        gen++
        val o = out
        if (o != null) runCatching { o.write(cmd("CMD_SEND_DISCONNECT", "")); o.flush() }
        runCatching { sock?.close() }; sock = null; out = null
    }

    fun disconnect() { wanted = false; closeSock(); set("idle") }

    fun connect(h: String = host, n: String = name) {
        if (h.isBlank()) return
        closeSock()
        host = h; name = n; wanted = true
        val g = synchronized(this) { gen }
        set("connecting")
        thread(name = "tcl") { run(g, 0) }
    }

    private fun run(g: Int, attempt: Int) {
        try {
            val s = Socket().apply { connect(InetSocketAddress(host, PORT), 6000); tcpNoDelay = true; keepAlive = true; soTimeout = 0 }
            synchronized(this) { if (g != gen) { s.close(); return }; sock = s; out = s.getOutputStream() }
            // say hello like TCL's app does (name shows on the TV)
            out?.apply { write(cmd("CMD_SEND_RMC_NAME", "ROWA Remote")); flush() }
            set("connected")
            val inp = s.getInputStream(); val buf = ByteArray(4096)
            while (g == gen) {
                val n = inp.read(buf); if (n < 0) throw java.io.EOFException("TV closed")
                if (n > 0) Log.d("tcl ⬅ " + String(buf, 0, minOf(n, 160)).replace("\n", " "))
            }
        } catch (e: Exception) {
            if (g != gen) return
            synchronized(this) { sock = null; out = null }
            Log.d("tcl: link ended ${e.javaClass.simpleName}: ${e.message}")
            if (wanted && attempt < 30) {
                set("offline", "reconnecting")
                Thread.sleep(if (attempt < 3) 2000L else 8000L)
                if (g == gen && wanted) { set("connecting"); run(g, attempt + 1) }
            } else { wanted = false; set("offline", e.message ?: "unreachable") }
        }
    }

    fun supports(code: Int) = code in KEYS

    /** one press = DOWN then UP (never leave a key "held"), paced, never piled up */
    fun key(code: Int) {
        val k = KEYS[code] ?: run { Log.d("tcl: key $code has no TCL equivalent"); return }
        if (!connected) return
        if (pending.get() >= 3) { Log.d("tcl: key $k dropped (TV busy)"); return }
        pending.incrementAndGet()
        Log.d("tcl ➡ $k")
        writer.execute {
            try {
                val wait = 140 - (System.currentTimeMillis() - lastAt); if (wait > 0) Thread.sleep(wait)
                val o = out ?: return@execute
                o.write(keyXml(k, "TR_DOWN")); o.flush()
                Thread.sleep(60)
                o.write(keyXml(k, "TR_UP")); o.flush()
                lastAt = System.currentTimeMillis()
            } catch (e: Exception) { Log.d("tcl: write failed ${e.message}"); runCatching { sock?.close() } }
            finally { pending.decrementAndGet() }
        }
    }
}
