package com.toffaha.rowaremote

import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.InputStream

/** Tiny protobuf writer — just what the Android TV Remote v2 protocol needs (varints + length-delimited). */
class PB {
    private val o = ByteArrayOutputStream()

    private fun raw(v: Long) {
        var x = v
        while (true) {
            if (x and 0x7FL.inv() == 0L) { o.write(x.toInt()); return }
            o.write(((x and 0x7F) or 0x80).toInt()); x = x ushr 7
        }
    }

    fun int(f: Int, v: Long): PB { raw((f shl 3).toLong()); raw(v); return this }
    fun int(f: Int, v: Int): PB = int(f, v.toLong())
    fun bytes(f: Int, b: ByteArray): PB { raw(((f shl 3) or 2).toLong()); raw(b.size.toLong()); o.write(b); return this }
    fun str(f: Int, s: String): PB = bytes(f, s.toByteArray(Charsets.UTF_8))
    fun msg(f: Int, m: PB): PB = bytes(f, m.toBytes())
    fun toBytes(): ByteArray = o.toByteArray()

    companion object {
        /** varint length prefix + message — how every message travels on the wire */
        fun frame(body: ByteArray): ByteArray = PB().also { it.raw(body.size.toLong()) }.toBytes() + body
    }
}

/** Tiny protobuf reader: field number -> values (Long for varints, ByteArray for length-delimited). */
class Msg(b: ByteArray) {
    private val f = HashMap<Int, MutableList<Any>>()

    init {
        var i = 0
        fun v(): Long {
            var r = 0L; var s = 0
            while (true) {
                val c = b[i++].toInt() and 0xFF
                r = r or ((c and 0x7F).toLong() shl s)
                if (c and 0x80 == 0) return r
                s += 7
            }
        }
        try {
            while (i < b.size) {
                val key = v(); val num = (key ushr 3).toInt()
                when ((key and 7).toInt()) {
                    0 -> f.getOrPut(num) { mutableListOf() }.add(v())
                    2 -> { val n = v().toInt(); f.getOrPut(num) { mutableListOf() }.add(b.copyOfRange(i, i + n)); i += n }
                    1 -> i += 8
                    5 -> i += 4
                    else -> break
                }
            }
        } catch (_: Exception) { /* keep what was parsed */ }
    }

    fun has(n: Int) = f.containsKey(n)
    fun long(n: Int): Long = f[n]?.firstOrNull() as? Long ?: 0L
    fun int(n: Int): Int = long(n).toInt()
    fun bool(n: Int): Boolean = long(n) != 0L
    fun str(n: Int): String = (f[n]?.firstOrNull() as? ByteArray)?.toString(Charsets.UTF_8) ?: ""
    fun msg(n: Int): Msg? = (f[n]?.firstOrNull() as? ByteArray)?.let { Msg(it) }

    companion object {
        /** read one varint-length-prefixed message */
        fun read(inp: InputStream): Msg {
            var len = 0; var s = 0
            while (true) {
                val c = inp.read(); if (c < 0) throw EOFException("closed")
                len = len or ((c and 0x7F) shl s)
                if (c and 0x80 == 0) break
                s += 7
            }
            val buf = ByteArray(len); var got = 0
            while (got < len) { val n = inp.read(buf, got, len - got); if (n < 0) throw EOFException("closed"); got += n }
            return Msg(buf)
        }
    }
}
