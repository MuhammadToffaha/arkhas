package com.toffaha.rowaremote

import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.Socket
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.Principal
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager

/**
 * 🔐 The phone's identity for the TV: one RSA key + self-signed certificate, made once and kept in app storage.
 * The TV remembers this certificate after pairing — same cert = no pairing again.
 */
object Cert {
    private fun files(ctx: Context) = File(ctx.filesDir, "atv.key") to File(ctx.filesDir, "atv.crt")

    fun reset(ctx: Context) { val (k, c) = files(ctx); k.delete(); c.delete() }

    fun load(ctx: Context): Pair<PrivateKey, X509Certificate> {
        val (kf, cf) = files(ctx)
        if (!kf.exists() || !cf.exists()) generate(kf, cf)
        val key = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(kf.readBytes()))
        val cert = cf.inputStream().use { CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate }
        return key to cert
    }

    // ---- minimal DER encoder (no BouncyCastle needed) ----
    private fun der(tag: Int, vararg parts: ByteArray): ByteArray {
        val body = ByteArrayOutputStream().apply { parts.forEach { write(it) } }.toByteArray()
        val o = ByteArrayOutputStream(); o.write(tag)
        val n = body.size
        when {
            n < 0x80 -> o.write(n)
            n < 0x100 -> { o.write(0x81); o.write(n) }
            n < 0x10000 -> { o.write(0x82); o.write(n shr 8); o.write(n and 0xFF) }
            else -> { o.write(0x83); o.write(n shr 16); o.write((n shr 8) and 0xFF); o.write(n and 0xFF) }
        }
        o.write(body); return o.toByteArray()
    }

    private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun generate(kf: File, cf: File) {
        val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val algo = der(0x30, hex("06092A864886F70D01010B"), hex("0500"))            // sha256WithRSAEncryption
        val name = der(0x30, der(0x31, der(0x30, hex("0603550403"), der(0x0C, "atvremote".toByteArray()))))  // CN=atvremote
        val serial = der(0x02, byteArrayOf(1) + ByteArray(8).also { SecureRandom().nextBytes(it) })
        val utc = SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val validity = der(0x30,
            der(0x17, utc.format(Date(System.currentTimeMillis() - 86_400_000L)).toByteArray()),
            der(0x17, "491231235959Z".toByteArray()))
        val tbs = der(0x30, der(0xA0, der(0x02, byteArrayOf(2))), serial, algo, name, validity, name, kp.public.encoded)
        val sig = Signature.getInstance("SHA256withRSA").apply { initSign(kp.private); update(tbs) }.sign()
        val cert = der(0x30, tbs, algo, der(0x03, byteArrayOf(0) + sig))
        kf.writeBytes(kp.private.encoded)
        cf.writeBytes(cert)
    }

    /** TLS context: present our cert, accept the TV's self-signed one (it's on the local network, pinned by pairing). */
    fun ssl(ctx: Context): SSLContext {
        val (key, cert) = load(ctx)
        val km = object : X509ExtendedKeyManager() {
            override fun getClientAliases(t: String?, i: Array<out Principal>?) = arrayOf("atv")
            override fun chooseClientAlias(t: Array<out String>?, i: Array<out Principal>?, s: Socket?) = "atv"
            override fun chooseEngineClientAlias(t: Array<out String>?, i: Array<out Principal>?, e: SSLEngine?) = "atv"
            override fun getServerAliases(t: String?, i: Array<out Principal>?): Array<String>? = null
            override fun chooseServerAlias(t: String?, i: Array<out Principal>?, s: Socket?): String? = null
            override fun getCertificateChain(a: String?) = arrayOf(cert)
            override fun getPrivateKey(a: String?) = key
        }
        val tm = object : X509TrustManager {
            override fun checkClientTrusted(c: Array<out X509Certificate>?, a: String?) {}
            override fun checkServerTrusted(c: Array<out X509Certificate>?, a: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        return SSLContext.getInstance("TLS").apply { init(arrayOf(km), arrayOf(tm), SecureRandom()) }
    }
}
