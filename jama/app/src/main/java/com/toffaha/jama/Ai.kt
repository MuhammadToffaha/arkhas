package com.toffaha.jama

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 🤖 AI hub — JAMA keeps ONE FreeLLMAPI connection (URL + unified key + model) for all of Muhammad's apps.
 * The server runs on the phone in Termux (http://127.0.0.1:3001/v1). Other apps read the settings from [AiProvider].
 */
object Ai {
    const val DEFAULT_URL = "http://127.0.0.1:3001/v1"
    const val DEFAULT_MODEL = "auto"
    const val DASHBOARD = "http://127.0.0.1:5173"
    const val TERMUX = "com.termux"
    const val TERMUX_PERM = "com.termux.permission.RUN_COMMAND"
    private const val START_SCRIPT = "/data/data/com.termux/files/home/freellmapi-start.sh"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jama_ai", Context.MODE_PRIVATE)
    fun url(ctx: Context) = (prefs(ctx).getString("url", null) ?: DEFAULT_URL).trimEnd('/')
    fun key(ctx: Context) = prefs(ctx).getString("key", "") ?: ""
    fun model(ctx: Context) = prefs(ctx).getString("model", null)?.ifBlank { null } ?: DEFAULT_MODEL

    fun save(ctx: Context, url: String, key: String, model: String) {
        val u = url.trim().trimEnd('/').ifBlank { DEFAULT_URL }
        require(u.startsWith("http://") || u.startsWith("https://")) { "URL must start with http:// or https://" }
        prefs(ctx).edit().putString("url", u).putString("key", key.trim()).putString("model", model.trim().ifBlank { DEFAULT_MODEL }).apply()
    }

    /** settings for the page — the key itself never goes back to the page, only whether one is set */
    fun settings(ctx: Context): JSONObject = JSONObject()
        .put("url", url(ctx)).put("model", model(ctx)).put("hasKey", key(ctx).isNotEmpty())
        .put("termux", termuxInstalled(ctx)).put("termuxPerm", termuxPermission(ctx))

    private fun call(ctx: Context, path: String, body: JSONObject?, readTimeout: Int): JSONObject {
        val c = URL(url(ctx) + path).openConnection() as HttpURLConnection
        c.connectTimeout = 5_000; c.readTimeout = readTimeout
        c.setRequestProperty("Authorization", "Bearer ${key(ctx)}")
        c.setRequestProperty("Accept", "application/json")
        if (body != null) {
            c.requestMethod = "POST"; c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val code = c.responseCode
        val txt = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        val j = runCatching { JSONObject(txt) }.getOrNull()
        if (code !in 200..299) throw Exception(j?.optJSONObject("error")?.optString("message")?.ifBlank { null } ?: "HTTP $code")
        return j ?: throw Exception("bad response")
    }

    /** 🔌 is the server up and is the key good? → {ok, models} or {ok:false, error} */
    fun test(ctx: Context): JSONObject = try {
        if (key(ctx).isEmpty()) throw Exception("no key")
        val n = call(ctx, "/models", null, 10_000).optJSONArray("data")?.length() ?: 0
        JSONObject().put("ok", true).put("models", n)
    } catch (e: java.net.ConnectException) {
        JSONObject().put("ok", false).put("down", true).put("error", "server not running")
    } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "error")
    }

    /** 💬 messages = [{role, content}, …] → {ok, text, model} */
    fun chat(ctx: Context, messages: JSONArray): JSONObject = try {
        val r = call(ctx, "/chat/completions", JSONObject().put("model", model(ctx)).put("messages", messages), 120_000)
        val ch = r.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
        JSONObject().put("ok", true).put("text", ch?.optString("content") ?: "").put("model", r.optString("model"))
    } catch (e: java.net.ConnectException) {
        JSONObject().put("ok", false).put("down", true).put("error", "server not running")
    } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "error")
    }

    fun termuxInstalled(ctx: Context) = runCatching { ctx.packageManager.getPackageInfo(TERMUX, 0); true }.getOrDefault(false)
    fun termuxPermission(ctx: Context) = ctx.checkSelfPermission(TERMUX_PERM) == android.content.pm.PackageManager.PERMISSION_GRANTED

    /** ▶️ ask Termux to run ~/freellmapi-start.sh in the background (made by the one-time setup command) */
    fun startServer(ctx: Context) {
        val i = Intent().setClassName(TERMUX, "com.termux.app.RunCommandService").setAction("com.termux.RUN_COMMAND")
            .putExtra("com.termux.RUN_COMMAND_PATH", START_SCRIPT)
            .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }

    /** 📋 one-time Termux setup: install, local-only .env, start script, allow JAMA to start it */
    val SETUP = """
pkg update -y && pkg install -y nodejs-lts git curl termux-api
git clone --depth 1 https://github.com/tashfeenahmed/freellmapi.git ~/freellmapi
cd ~/freellmapi && npm install --no-audit --no-fund
[ -f .env ] || printf "ENCRYPTION_KEY=%s\nPORT=3001\nHOST=127.0.0.1\n" "${'$'}(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" > .env
mkdir -p ~/.termux && (grep -q '^allow-external-apps' ~/.termux/termux.properties 2>/dev/null || echo 'allow-external-apps=true' >> ~/.termux/termux.properties) && termux-reload-settings
cat > ~/freellmapi-start.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
curl -s -o /dev/null http://127.0.0.1:3001/ && exit 0
termux-wake-lock
cd ~/freellmapi && nohup npm run dev > ~/freellmapi.log 2>&1 &
EOF
chmod +x ~/freellmapi-start.sh && ~/freellmapi-start.sh
""".trim()
}

/**
 * 🔗 Shares the AI settings with Muhammad's other apps (same signing key only — signature permission).
 * In another app: add <uses-permission android:name="com.toffaha.jama.permission.AI"/> and
 * <queries><package android:name="com.toffaha.jama"/></queries>, then query content://com.toffaha.jama.ai/settings
 * → one row: url, key, model.
 */
class AiProvider : ContentProvider() {
    override fun onCreate() = true
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val ctx = context!!
        return MatrixCursor(arrayOf("url", "key", "model")).apply { addRow(arrayOf(Ai.url(ctx), Ai.key(ctx), Ai.model(ctx))) }
    }
    override fun getType(uri: Uri) = "vnd.android.cursor.item/vnd.com.toffaha.jama.ai"
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
}
