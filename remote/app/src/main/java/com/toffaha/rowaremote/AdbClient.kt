package com.toffaha.rowaremote

import android.content.Context
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.File
import java.io.OutputStream
import java.math.BigInteger
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.interfaces.RSAPrivateCrtKey
import java.security.spec.PKCS8EncodedKeySpec
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * 🔧 Minimal ADB-over-Wi-Fi client (port 5555) — for TVs without Google's remote service,
 * and for the extras (TV app manager / debloat, screenshot). Speaks the ADB wire protocol directly.
 * First time the TV asks "Allow debugging?" → tick "Always allow".
 */
class AdbClient(private val ctx: Context, private val onChange: () -> Unit) {
    private companion object {
        const val CNXN = 0x4e584e43; const val AUTH = 0x48545541; const val OPEN = 0x4e45504f
        const val OKAY = 0x59414b4f; const val CLSE = 0x45534c43; const val WRTE = 0x45545257
    }

    @Volatile var host = ""
    @Volatile var name = ""
    /** idle · connecting · auth (waiting for "Allow" on TV) · connected · offline */
    @Volatile var status = "idle"
    @Volatile var error = ""
    @Volatile var app = ""
    @Volatile var wanted = false
    val connected get() = status == "connected"

    private var gen = 0
    private var sock: Socket? = null
    private var out: OutputStream? = null
    private var maxData = 4096
    private val ids = AtomicInteger(1)
    private val streams = ConcurrentHashMap<Int, Stream>()
    private var shell: Stream? = null
    private val shellQ = LinkedBlockingQueue<String>()
    private var lastText = ""

    private inner class Stream(val local: Int) {
        @Volatile var remote = 0
        val opened = CountDownLatch(1)
        val closed = CountDownLatch(1)
        val okay = Semaphore(0)
        val data = ByteArrayOutputStream()
    }

    private fun set(s: String, e: String = "") { if (s != status || e != error) Log.d("adb: $s${if (e.isNotEmpty()) " ($e)" else ""}"); status = s; error = e; onChange() }

    // ---------- key (made once, kept) ----------
    private val key: RSAPrivateCrtKey by lazy {
        val f = File(ctx.filesDir, "adb.key")
        if (!f.exists()) f.writeBytes(KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().private.encoded)
        KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(f.readBytes())) as RSAPrivateCrtKey
    }

    private fun fixed(b: BigInteger, n: Int): ByteArray {
        val a = b.toByteArray(); val r = ByteArray(n)
        val src = if (a.size > n) a.copyOfRange(a.size - n, a.size) else a
        System.arraycopy(src, 0, r, n - src.size, src.size); return r
    }

    /** PKCS#1 v1.5 SHA-1 signature of the 20-byte token (adb treats the token as the digest) */
    private fun sign(token: ByteArray): ByteArray {
        val prefix = byteArrayOf(0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2B, 0x0E, 0x03, 0x02, 0x1A, 0x05, 0x00, 0x04, 0x14)
        val k = 256
        val em = ByteArray(k); em[1] = 1
        val ps = k - 3 - prefix.size - token.size
        for (i in 0 until ps) em[2 + i] = 0xFF.toByte()
        System.arraycopy(prefix, 0, em, 3 + ps, prefix.size)
        System.arraycopy(token, 0, em, 3 + ps + prefix.size, token.size)
        return fixed(BigInteger(1, em).modPow(key.privateExponent, key.modulus), k)
    }

    /** Android's adb public key format: base64(struct{len,n0inv,n[64],rr[64],e}) + " name\0" */
    private fun pubKey(): ByteArray {
        val n = key.modulus; val r32 = BigInteger.ONE.shiftLeft(32)
        val n0inv = r32.subtract(n.mod(r32).modInverse(r32)).mod(r32)
        val rr = BigInteger.ONE.shiftLeft(4096).mod(n)
        val b = ByteBuffer.allocate(524).order(ByteOrder.LITTLE_ENDIAN)
        b.putInt(64); b.putInt(n0inv.toLong().toInt())
        b.put(fixed(n, 256).reversedArray()); b.put(fixed(rr, 256).reversedArray())
        b.putInt(key.publicExponent.toInt())
        val s = android.util.Base64.encodeToString(b.array(), android.util.Base64.NO_WRAP) + " rowa-remote@" + android.os.Build.MODEL.replace(' ', '_')
        return s.toByteArray() + byteArrayOf(0)
    }

    // ---------- wire ----------
    @Synchronized private fun send(cmd: Int, a0: Int, a1: Int, data: ByteArray = ByteArray(0)) {
        val h = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN)
        var sum = 0; for (x in data) sum += x.toInt() and 0xFF
        h.putInt(cmd); h.putInt(a0); h.putInt(a1); h.putInt(data.size); h.putInt(sum); h.putInt(cmd xor -1)
        val o = out ?: throw Exception("not connected")
        o.write(h.array()); if (data.isNotEmpty()) o.write(data); o.flush()
    }

    fun connect(h: String = host, n: String = name) {
        if (h.isBlank()) return
        close()
        host = h; name = n; wanted = true
        val g = synchronized(this) { gen }
        set("connecting")
        thread(name = "adb") { run(g, 0) }
    }

    @Synchronized private fun close() {
        gen++
        runCatching { sock?.close() }; sock = null; out = null
        streams.values.forEach { it.opened.countDown(); it.closed.countDown(); it.okay.release(99) }
        streams.clear(); shell = null
    }

    fun disconnect() { wanted = false; close(); set("idle") }

    private fun run(g: Int, attempt: Int) {
        var ok = false
        try {
            val s = Socket().apply { connect(InetSocketAddress(host, 5555), 5000); tcpNoDelay = true; soTimeout = 0 }
            synchronized(this) { if (g != gen) { s.close(); return }; sock = s; out = s.getOutputStream() }
            val inp = DataInputStream(BufferedInputStream(s.getInputStream()))
            send(CNXN, 0x01000000, 4096, "host::\u0000".toByteArray())
            var signed = false
            val hdr = ByteArray(24)
            while (g == gen) {
                inp.readFully(hdr)
                val b = ByteBuffer.wrap(hdr).order(ByteOrder.LITTLE_ENDIAN)
                val cmd = b.int; val a0 = b.int; val a1 = b.int; val len = b.int
                val data = ByteArray(len); if (len > 0) inp.readFully(data)
                when (cmd) {
                    AUTH -> if (a0 == 1) {
                        if (!signed) { signed = true; send(AUTH, 2, 0, sign(data)) }
                        else { set("auth"); send(AUTH, 3, 0, pubKey()) }   // TV shows "Allow debugging?"
                    }
                    CNXN -> {
                        maxData = maxOf(1024, minOf(a1, 256 * 1024)); ok = true
                        set("connected"); startShell(g)
                    }
                    OKAY -> streams[a1]?.let { st -> st.remote = a0; st.opened.countDown(); st.okay.release() }
                    WRTE -> { runCatching { send(OKAY, a1, a0) }; streams[a1]?.data?.write(data) }
                    CLSE -> streams.remove(a1)?.let { st -> st.opened.countDown(); st.closed.countDown(); st.okay.release(99)
                        if (st === shell) { shell = null; if (g == gen) thread { startShell(g) } } }
                }
            }
        } catch (e: Exception) {
            if (g != gen) return
            synchronized(this) { sock = null; out = null }
            if (wanted && ok) {
                set("offline", "reconnecting")
                Thread.sleep(minOf(10_000L, 1500L * (attempt + 1)))
                if (g == gen && wanted) { set("connecting"); run(g, attempt + 1) }
            } else set("offline", if (status == "auth") "denied" else (e.message ?: "unreachable"))
        }
    }

    private fun open(dest: String): Stream? {
        val st = Stream(ids.getAndIncrement()); streams[st.local] = st
        runCatching { send(OPEN, st.local, 0, (dest + "\u0000").toByteArray()) }.onFailure { streams.remove(st.local); return null }
        if (!st.opened.await(5, TimeUnit.SECONDS) || st.remote == 0) { streams.remove(st.local); return null }
        st.okay.drainPermits()
        return st
    }

    /** one persistent shell; commands queue on the TV, so keys feel fast */
    private fun startShell(g: Int) {
        thread(name = "adb-shell") {
            val st = open("shell:") ?: return@thread
            shell = st
            while (g == gen && shell === st) {
                val cmd = shellQ.poll(30, TimeUnit.SECONDS) ?: continue
                try {
                    send(WRTE, st.local, st.remote, (cmd + "\n").toByteArray())
                    st.okay.tryAcquire(3, TimeUnit.SECONDS)
                    synchronized(st.data) { if (st.data.size() > 65536) st.data.reset() }
                } catch (_: Exception) { break }
            }
        }
    }

    private fun sh(cmd: String) { if (connected) shellQ.offer(cmd) }

    /** run a command, return its output (exec: = raw, no terminal) */
    fun exec(cmd: String, timeoutSec: Long = 20): ByteArray? {
        if (!connected) return null
        val st = open("exec:$cmd") ?: open("shell:$cmd") ?: return null
        st.closed.await(timeoutSec, TimeUnit.SECONDS)
        streams.remove(st.local)
        return st.data.toByteArray()
    }
    fun capture(cmd: String) = exec(cmd)?.toString(Charsets.UTF_8) ?: ""

    // ---------- remote actions ----------
    fun key(code: Int, long: Boolean = false) = sh(if (long) "input keyevent --longpress $code" else "input keyevent $code")
    fun keys(code: Int, times: Int) { if (times > 0) sh("input keyevent " + List(times) { code }.joinToString(" ")) }

    private fun q(s: String) = "'" + s.replace("'", "'\\''") + "'"

    /** keyboard sends the whole field; adb can only append → type the difference */
    fun text(full: String) {
        var p = 0; while (p < full.length && p < lastText.length && full[p] == lastText[p]) p++
        keys(67, lastText.length - p)
        val add = full.substring(p).filter { it.code in 32..126 }
        if (add.isNotEmpty()) sh("input text " + q(add.replace(" ", "%s")))
        lastText = full
    }
    fun resetText(v: String = "") { lastText = v }

    fun launch(link: String) {
        val pkg = when {
            link.startsWith("market://launch?id=") -> link.substringAfter("id=")
            !link.contains("://") -> link
            else -> null
        }
        if (pkg != null) sh("monkey -p $pkg -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 || monkey -p $pkg 1 >/dev/null 2>&1")
        else sh("am start -a android.intent.action.VIEW -d ${q(link)} >/dev/null 2>&1")
    }

    fun currentApp(): String {
        val s = capture("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'")
        return Regex("([a-zA-Z][\\w.]+)/[\\w.$]+").find(s)?.groupValues?.get(1) ?: ""
    }

    fun screenshot(): ByteArray? = exec("screencap -p", 30)?.takeIf { it.size > 100 && it[1] == 'P'.code.toByte() }

    /** all packages: name, system?, disabled? */
    fun packages(): List<Triple<String, Boolean, Boolean>> {
        fun list(f: String) = capture("pm list packages $f").lines().mapNotNull { it.substringAfter("package:", "").trim().takeIf { p -> p.isNotEmpty() } }.toSet()
        val sys = list("-s"); val dis = list("-d"); val all = list("")
        return all.map { Triple(it, it in sys, it in dis) }.sortedWith(compareBy({ it.second }, { it.first }))
    }
    fun disable(p: String) = capture("pm disable-user --user 0 $p")
    fun enable(p: String) = capture("pm enable $p")
    fun uninstall(p: String) = capture("pm uninstall $p")
}
