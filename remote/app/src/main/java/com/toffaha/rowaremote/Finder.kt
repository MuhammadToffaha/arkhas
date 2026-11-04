package com.toffaha.rowaremote

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * 🔍 mDNS: Android TVs announce "_androidtvremote2._tcp" (current remote service).
 * "_androidtvremote._tcp" = old service (needs an update on the TV), "_googlecast._tcp" = Chromecast built-in.
 */
class Finder(ctx: Context, private val onFound: (name: String, host: String, kind: String, txt: Map<String, String>) -> Unit, private val onDone: () -> Unit) {
    private val nsd = ctx.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var lock: WifiManager.MulticastLock? = null
    private val queue = ConcurrentLinkedQueue<Pair<NsdServiceInfo, String>>()
    @Volatile private var resolving = false
    @Volatile var running = false
        private set
    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableListOf<NsdManager.DiscoveryListener>()
    private var token = 0

    private val types = mapOf("_androidtvremote2._tcp" to "atv", "_androidtvremote._tcp" to "old", "_googlecast._tcp" to "cast")

    private fun newListener(kind: String) = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(t: String) {}
        override fun onDiscoveryStopped(t: String) {}
        override fun onStartDiscoveryFailed(t: String, e: Int) {}
        override fun onStopDiscoveryFailed(t: String, e: Int) {}
        override fun onServiceFound(s: NsdServiceInfo) { queue.add(s to kind); next() }
        override fun onServiceLost(s: NsdServiceInfo) {}
    }

    @Suppress("DEPRECATION")
    private fun next() {
        if (resolving) return
        val (s, kind) = queue.poll() ?: return
        resolving = true
        runCatching {
            nsd.resolveService(s, object : NsdManager.ResolveListener {
                override fun onResolveFailed(i: NsdServiceInfo, e: Int) { resolving = false; main.postDelayed({ next() }, 150) }
                override fun onServiceResolved(i: NsdServiceInfo) {
                    resolving = false
                    val name = if (kind == "cast") (i.attributes["fn"]?.toString(Charsets.UTF_8) ?: i.serviceName) else i.serviceName
                    val txt = runCatching { i.attributes.mapValues { (_, v) -> v?.toString(Charsets.UTF_8) ?: "" } }.getOrDefault(emptyMap())
                    i.host?.hostAddress?.takeIf { !it.contains(':') }?.let { onFound(name, it, kind, txt) }
                    next()
                }
            })
        }.onFailure { resolving = false }
    }

    fun start(seconds: Long = 12) {
        if (running) return
        running = true
        val my = ++token
        runCatching { lock = wifi.createMulticastLock("rowa-remote").apply { setReferenceCounted(false); acquire() } }
        for ((type, kind) in types) {
            val l = newListener(kind)
            if (runCatching { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l) }.isSuccess) listeners.add(l)
        }
        main.postDelayed({ if (token == my) finish() }, seconds * 1000)
    }

    fun finish() {
        if (!running) return
        running = false
        listeners.forEach { l -> runCatching { nsd.stopServiceDiscovery(l) } }; listeners.clear()
        runCatching { lock?.release() }
        onDone()
    }
}
