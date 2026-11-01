package com.toffaha.rowaremote

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 📋 Connection log (last 400 lines) — shown in Settings, copy/share it to diagnose a TV. */
object Log {
    private val buf = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    @Synchronized fun d(msg: String) {
        buf.addLast("${fmt.format(Date())}  $msg")
        while (buf.size > 400) buf.removeFirst()
        android.util.Log.d("RowaRemote", msg)
    }
    @Synchronized fun text(): String = buf.joinToString("\n")
    @Synchronized fun clear() = buf.clear()
}
