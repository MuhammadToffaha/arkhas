package com.toffaha.rowaremote

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * ⚡ Wake-on-LAN: a "magic packet" (6×FF + the TV's MAC ×16) by UDP broadcast.
 * Wakes a TV whose Android is in standby/Doze (ping answers, Google services firewalled).
 * MAC candidates: the one the user typed (from the router), else the Bluetooth MAC the TV
 * announces over mDNS ("bt") and its neighbours — Wi-Fi and BT MACs are usually 1–2 apart.
 */
object Wol {
    fun norm(mac: String): String? {
        val h = mac.filter { it.isLetterOrDigit() }.uppercase()
        if (h.length != 12 || !h.all { it in "0123456789ABCDEF" }) return null
        return h.chunked(2).joinToString(":")
    }

    /** the MAC plus neighbours (last byte ±range) */
    fun around(mac: String, range: Int = 2): List<String> {
        val n = norm(mac) ?: return emptyList()
        val v = n.replace(":", "").toLong(16)
        return (-range..range).map { d -> "%012X".format((v + d) and 0xFFFFFFFFFFFFL).chunked(2).joinToString(":") }
    }

    fun send(macs: Collection<String>, host: String) {
        val list = macs.mapNotNull { norm(it) }.distinct()
        if (list.isEmpty()) return
        val targets = listOf("255.255.255.255", host.substringBeforeLast('.') + ".255", host)
        runCatching {
            DatagramSocket().use { s ->
                s.broadcast = true
                repeat(3) {
                    for (m in list) {
                        val mb = m.split(":").map { it.toInt(16).toByte() }.toByteArray()
                        val pkt = ByteArray(6) { 0xFF.toByte() } + ByteArray(96) { mb[it % 6] }
                        for (t in targets) for (port in intArrayOf(9, 7)) runCatching {
                            s.send(DatagramPacket(pkt, pkt.size, InetAddress.getByName(t), port))
                        }
                    }
                    Thread.sleep(120)
                }
            }
            Log.d("wol: magic packets → ${list.joinToString(",")}")
        }.onFailure { Log.d("wol: failed ${it.message}") }
    }
}
