package com.toffaha.rowaremote

import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** 🌐 Port checks, Wi-Fi subnet scan (finds the TV even when mDNS is blocked) and the connection doctor. */
object Net {
    const val ATV = 6466; const val ATV_PAIR = 6467; const val ADB = 5555; const val CAST = 8009

    fun open(host: String, port: Int, timeout: Int = 900): Boolean = state(host, port, timeout) == "open"

    /** open · refused (TV answered: nothing listens) · timeout (no answer at all) */
    fun state(host: String, port: Int, timeout: Int): String = try {
        Socket().use { it.connect(InetSocketAddress(host, port), timeout) }; "open"
    } catch (e: java.net.SocketTimeoutException) { "timeout" } catch (e: java.net.ConnectException) { "refused" } catch (e: Exception) { "timeout" }

    /**
     * Google remote ports get a real TLS handshake + clean close, never a bare TCP open/close:
     * some TVs' remote service jams after a few half-open connections and then stops answering at all.
     */
    fun tls(ctx: android.content.Context, host: String, port: Int, timeout: Int): String {
        val plain = Socket()
        return try {
            plain.connect(InetSocketAddress(host, port), timeout)
            try {
                (Cert.ssl(ctx).socketFactory.createSocket(plain, host, port, true) as javax.net.ssl.SSLSocket).use {
                    it.soTimeout = 6000; it.startHandshake()
                }
            } catch (_: Exception) { runCatching { plain.close() } }
            "open"
        } catch (e: java.net.SocketTimeoutException) { runCatching { plain.close() }; "timeout" }
        catch (e: java.net.ConnectException) { runCatching { plain.close() }; "refused" }
        catch (e: Exception) { runCatching { plain.close() }; "timeout" }
    }

    /** phone's own Wi-Fi IPv4 */
    fun localIp(): String? = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .sortedBy { if (it.name.startsWith("wlan")) 0 else if (it.name.startsWith("eth")) 1 else 2 }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is Inet4Address && it.isSiteLocalAddress }?.hostAddress
    }.getOrNull()

    data class Hit(val host: String, val atv: Boolean, val adb: Boolean, val cast: Boolean)

    /** probe every address of the /24 for the remote (6466), ADB (5555) and Cast (8009) ports */
    fun scan(ctx: android.content.Context, onHit: (Hit) -> Unit, onProgress: (Int) -> Unit) {
        val me = localIp() ?: return
        val base = me.substringBeforeLast('.')
        val pool = Executors.newFixedThreadPool(48)
        val done = AtomicInteger()
        for (i in 1..254) {
            val h = "$base.$i"
            if (h == me) { done.incrementAndGet(); continue }
            pool.execute {
                val adb = open(h, ADB, 450)
                // only knock on 6466 (with TLS) if the address is alive at all
                val alive = adb || runCatching { InetAddress.getByName(h).isReachable(350) }.getOrDefault(false)
                val atv = alive && tls(ctx, h, ATV, 600) == "open"
                val cast = if (atv || adb) open(h, CAST, 450) else false
                if (atv || adb) onHit(Hit(h, atv, adb, cast))
                val d = done.incrementAndGet(); if (d % 16 == 0) onProgress(d * 100 / 254)
            }
        }
        pool.shutdown(); pool.awaitTermination(40, TimeUnit.SECONDS); onProgress(100)
    }

    /**
     * 🔎 Which TV-control services does this set run? Plain TCP knock on known vendor ports
     * (never 6466/6467 — Google's remote service is fragile). open = listening, refused = not there.
     */
    val VENDOR_PORTS = linkedMapOf(
        4123 to "TCL nScreen", 4124 to "TCL", 5978 to "TCL", 6550 to "TCL", 6553 to "TCL", 9999 to "TCL/misc", 10002 to "TCL",
        56789 to "TCL/UPnP", 56790 to "UPnP desc", 49152 to "UPnP/DLNA", 8008 to "Cast HTTP", 8009 to "Cast", 8443 to "Cast TLS",
        5555 to "ADB", 1925 to "Philips", 1926 to "Philips", 8001 to "Samsung", 8002 to "Samsung", 3000 to "LG", 3001 to "LG",
        36669 to "Hisense", 7345 to "MagiConnect", 8080 to "HTTP alt", 80 to "HTTP", 9080 to "Sony/HTTP", 1900 to "SSDP",
        5000 to "AirPlay/misc", 7000 to "AirPlay", 8060 to "Roku", 9197 to "DIAL", 55000 to "Samsung legacy")
    fun portScan(host: String): Map<Int, String> {
        val pool = Executors.newFixedThreadPool(16)
        val res = java.util.concurrent.ConcurrentHashMap<Int, String>()
        for (p in VENDOR_PORTS.keys) pool.execute { res[p] = state(host, p, 1500) }
        pool.shutdown(); pool.awaitTermination(15, TimeUnit.SECONDS)
        val open = res.filterValues { it == "open" }.keys.sorted()
        val silent = res.filterValues { it == "timeout" }.keys.sorted()
        Log.d("ports $host open=${open.joinToString(",") { "$it(${VENDOR_PORTS[it]})" }.ifEmpty { "none" }} silent=${silent.joinToString(",").ifEmpty { "none" }}")
        return res
    }

    /** 🩺 what works and what doesn't between this phone and the TV */
    fun doctor(ctx: android.content.Context, host: String): Map<String, Any> {
        val me = localIp() ?: ""
        val sameNet = me.isNotEmpty() && host.substringBeforeLast('.') == me.substringBeforeLast('.')
        val ping = runCatching { InetAddress.getByName(host).isReachable(2500) }.getOrDefault(false)
        val a = tls(ctx, host, ATV, 4000); val p = tls(ctx, host, ATV_PAIR, 4000)
        val d = state(host, ADB, 4000); val c = state(host, CAST, 3000)
        val answered = ping || listOf(a, p, d, c).any { it != "timeout" }
        return mapOf("phone" to me, "host" to host, "sameNet" to sameNet, "ping" to answered,
            "atv" to (a == "open"), "pair" to (p == "open"), "adb" to (d == "open"), "cast" to (c == "open"),
            "atvState" to a, "adbState" to d).also { Log.d("doctor $host: ping=$ping 6466=$a 6467=$p 5555=$d 8009=$c phone=$me") }
    }
}
