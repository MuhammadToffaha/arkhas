package com.toffaha.rowaremote

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentLinkedQueue

/** 🔍 Finds Android TVs on the Wi-Fi (they announce "_androidtvremote2._tcp"). */
class Finder(ctx: Context, private val onFound: (name: String, host: String) -> Unit, private val onDone: () -> Unit) {
    private val nsd = ctx.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var lock: WifiManager.MulticastLock? = null
    private val queue = ConcurrentLinkedQueue<NsdServiceInfo>()
    @Volatile private var resolving = false
    @Volatile var running = false
        private set
    private val main = Handler(Looper.getMainLooper())

    private var listener: NsdManager.DiscoveryListener? = null
    private fun newListener() = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(t: String) {}
        override fun onDiscoveryStopped(t: String) {}
        override fun onStartDiscoveryFailed(t: String, e: Int) { finish() }
        override fun onStopDiscoveryFailed(t: String, e: Int) {}
        override fun onServiceFound(s: NsdServiceInfo) { queue.add(s); next() }
        override fun onServiceLost(s: NsdServiceInfo) {}
    }

    @Suppress("DEPRECATION")
    private fun next() {
        if (resolving) return
        val s = queue.poll() ?: return
        resolving = true
        nsd.resolveService(s, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, e: Int) { resolving = false; next() }
            override fun onServiceResolved(i: NsdServiceInfo) {
                resolving = false
                i.host?.hostAddress?.takeIf { !it.contains(':') }?.let { onFound(i.serviceName, it) }
                next()
            }
        })
    }

    fun start(seconds: Long = 12) {
        if (running) return
        running = true
        runCatching { lock = wifi.createMulticastLock("rowa-remote").apply { setReferenceCounted(false); acquire() } }
        val l = newListener(); listener = l
        runCatching { nsd.discoverServices("_androidtvremote2._tcp", NsdManager.PROTOCOL_DNS_SD, l) }.onFailure { finish(); return }
        main.postDelayed({ finish() }, seconds * 1000)
    }

    fun finish() {
        if (!running) return
        running = false
        listener?.let { l -> runCatching { nsd.stopServiceDiscovery(l) } }; listener = null
        runCatching { lock?.release() }
        onDone()
    }
}
