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

    fun open(host: String, port: Int, timeout: Int = 900): Boolean = try {
        Socket().use { it.connect(InetSocketAddress(host, port), timeout) }; true
    } catch (_: Exception) { false }

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
    fun scan(onHit: (Hit) -> Unit, onProgress: (Int) -> Unit) {
        val me = localIp() ?: return
        val base = me.substringBeforeLast('.')
        val pool = Executors.newFixedThreadPool(48)
        val done = AtomicInteger()
        for (i in 1..254) {
            val h = "$base.$i"
            if (h == me) { done.incrementAndGet(); continue }
            pool.execute {
                val atv = open(h, ATV, 450); val adb = open(h, ADB, 450)
                val cast = if (atv || adb) open(h, CAST, 450) else false
                if (atv || adb) onHit(Hit(h, atv, adb, cast))
                val d = done.incrementAndGet(); if (d % 16 == 0) onProgress(d * 100 / 254)
            }
        }
        pool.shutdown(); pool.awaitTermination(40, TimeUnit.SECONDS); onProgress(100)
    }

    /** 🩺 what works and what doesn't between this phone and the TV */
    fun doctor(host: String): Map<String, Any> {
        val me = localIp() ?: ""
        val sameNet = me.isNotEmpty() && host.substringBeforeLast('.') == me.substringBeforeLast('.')
        val ping = runCatching { InetAddress.getByName(host).isReachable(1500) }.getOrDefault(false)
        val atv = open(host, ATV, 1500); val pair = open(host, ATV_PAIR, 1500)
        val adb = open(host, ADB, 1500); val cast = open(host, CAST, 1500)
        return mapOf("phone" to me, "host" to host, "sameNet" to sameNet, "ping" to (ping || atv || adb || cast),
            "atv" to atv, "pair" to pair, "adb" to adb, "cast" to cast)
    }
}
