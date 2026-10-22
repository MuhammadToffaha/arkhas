package eg.arkhas.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * ✈️ Telegram group posting (official Bot API — allowed, free, fully automatic).
 * Config lives in the alerts settings: alerts.tg = {on, token, chat}.
 */
object Telegram {
    /** The "Arkhas😄" group (bot is admin there). Used unless the user explicitly picked their private chat. */
    const val DEFAULT_GROUP = "-1004425380003"

    /** Group/channel ids are negative; a positive id is a private chat with the bot. */
    fun destination(tg: org.json.JSONObject): String {
        val chat = tg.optString("chat").trim()
        return if (chat.isBlank() || (!chat.startsWith("-") && !tg.optBoolean("private"))) DEFAULT_GROUP else chat
    }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    private fun money(v: Double) = String.format(java.util.Locale.US, "EGP %,d", Math.round(v))

    fun caption(d: JSONObject): String {
        val pct = d.optInt("pct")
        val head = (if (pct > 0) "🔥 <b>-$pct%</b>" else "🟡 <b>MEGA</b>") + " · " + esc(d.optString("source"))
        val price = "💰 <b>" + money(d.optDouble("price")) + "</b>" +
            (if (d.optDouble("old_price", 0.0) > d.optDouble("price")) "  <s>" + money(d.optDouble("old_price")) + "</s>" else "")
        return "$head\n${esc(d.optString("title").take(200))}\n$price\n<a href=\"${esc(d.optString("url"))}\">🛒 افتح العرض</a>"
    }

    private fun post(token: String, method: String, params: Map<String, String>): JSONObject {
        val body = params.entries.joinToString("&") { URLEncoder.encode(it.key, "UTF-8") + "=" + URLEncoder.encode(it.value, "UTF-8") }
        val c = URL("https://api.telegram.org/bot$token/$method").openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true
        c.connectTimeout = 10_000; c.readTimeout = 15_000
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        c.outputStream.use { it.write(body.toByteArray()) }
        val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
        return JSONObject(stream.bufferedReader().readText())
    }

    /** Posts each deal (photo + caption when there is a picture). Returns how many were sent, or throws on a bad token/chat. */
    fun send(token: String, chat: String, deals: List<JSONObject>, onSent: (JSONObject) -> Unit = {}): Int {
        var sent = 0
        // up to 15 per run, biggest discount first; the rest stay "new" and go out next run
        for (d in deals.sortedByDescending { it.optInt("pct") }.take(15)) {
            val img = d.optString("image")
            var r = if (img.startsWith("http"))
                post(token, "sendPhoto", mapOf("chat_id" to chat, "photo" to img, "caption" to caption(d), "parse_mode" to "HTML"))
            else JSONObject().put("ok", false)
            if (!r.optBoolean("ok"))   // no picture, or Telegram couldn't fetch it -> plain message
                r = post(token, "sendMessage", mapOf("chat_id" to chat, "text" to caption(d), "parse_mode" to "HTML",
                    "disable_web_page_preview" to "false"))
            if (r.optBoolean("ok")) { sent++; onSent(d) }
            else if (sent == 0) throw Exception(r.optString("description", "telegram error"))
            Thread.sleep(1200)   // stay well under Telegram's group rate limit
        }
        return sent
    }
}
