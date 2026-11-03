package com.toffaha.rowaremote

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 📋 Connection log (last 400 lines) — shown in Settings, copy/share it to diagnose a TV. */
object Log {
    private val buf = ArrayDeque<String>()
    private var file: java.io.File? = null
    /** keep the log on disk so it survives closing the app / a crash */
    @Synchronized fun init(ctx: android.content.Context) {
        if (file != null) return
        file = java.io.File(ctx.filesDir, "connection.log")
        runCatching { file!!.readLines().takeLast(300).forEach { buf.addLast(it) } }
        buf.addLast("──────── app start ────────")
    }
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    @Synchronized fun d(msg: String) {
        buf.addLast("${fmt.format(Date())}  $msg")
        while (buf.size > 400) buf.removeFirst()
        file?.let { f -> runCatching { if (f.length() > 200_000) f.writeText(buf.joinToString("\n") + "\n") else f.appendText(buf.last() + "\n") } }
        android.util.Log.d("RowaRemote", msg)
    }
    @Synchronized fun text(): String = buf.joinToString("\n")
    @Synchronized fun clear() { buf.clear(); runCatching { file?.writeText("") } }
}
