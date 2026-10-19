package eg.arkhas.app

import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset
import java.util.concurrent.Executors

/** Plain HTTP from the phone itself — no server, no CORS. Uses a desktop UA so store pages match the selectors. */
object Net {
    const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"

    val pool = Executors.newFixedThreadPool(12)

    fun get(url: String, lang: String, json: Boolean): String {
        var target = url
        repeat(5) {  // follow redirects, including http<->https
            val c = URL(target).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 7_000; c.readTimeout = 10_000
            c.setRequestProperty("User-Agent", DESKTOP_UA)
            c.setRequestProperty("Accept", if (json) "application/json" else "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            c.setRequestProperty("Accept-Encoding", "gzip")
            c.setRequestProperty("Accept-Language", if (lang == "ar") "ar-EG,ar;q=0.9,en;q=0.8" else "en-US,en;q=0.9,ar;q=0.7")
            val code = c.responseCode
            if (code in 300..399) {
                target = URL(URL(target), c.getHeaderField("Location") ?: throw Exception("bad redirect")).toString()
                c.disconnect(); return@repeat
            }
            if (code !in 200..299) { c.disconnect(); throw Exception("HTTP $code") }
            val cs = Regex("charset=([\\w-]+)").find(c.contentType ?: "")?.groupValues?.get(1) ?: "UTF-8"
            val charset = runCatching { Charset.forName(cs) }.getOrDefault(Charsets.UTF_8)
            val raw = if (c.contentEncoding.equals("gzip", true)) java.util.zip.GZIPInputStream(c.inputStream) else c.inputStream
            return raw.use { String(it.readBytes(), charset) }
        }
        throw Exception("too many redirects")
    }
}
