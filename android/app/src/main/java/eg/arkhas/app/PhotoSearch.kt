package eg.arkhas.app

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * 📷 Search by photo — everything runs on the phone (Google ML Kit via Play services, no server, no key):
 *  barcode → product name lookup (in the page), printed text (brand / model number), and what the picture shows.
 * The page turns that into search words. "Google Lens" hands the same photo to the Lens app.
 */
class PhotoSearch(private val act: MainActivity, private val done: (JSONObject) -> Unit) {
    private var last: Uri? = null
    private var camUri: Uri? = null

    private val takePicture = act.registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val u = camUri
        if (ok && u != null) analyze(u) else done(JSONObject().put("ok", false).put("cancel", true))
    }
    private val pick = act.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { u ->
        if (u != null) analyze(u) else done(JSONObject().put("ok", false).put("cancel", true))
    }

    fun camera() {
        val dir = File(act.cacheDir, "photos").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
        val f = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        camUri = FileProvider.getUriForFile(act, "${act.packageName}.files", f)
        runCatching { takePicture.launch(camUri!!) }.onFailure { done(JSONObject().put("ok", false).put("error", "no camera app")) }
    }

    fun gallery() {
        runCatching { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            .onFailure { done(JSONObject().put("ok", false).put("error", it.message ?: "picker")) }
    }

    /** Open the last photo in Google Lens (or any app that takes an image). */
    fun lens(): Boolean {
        val u = last ?: return false
        val base = Intent(Intent.ACTION_SEND).setType("image/*").putExtra(Intent.EXTRA_STREAM, u)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        for (pkg in listOf("com.google.ar.lens", "com.google.android.googlequicksearchbox")) {
            if (runCatching { act.startActivity(Intent(base).setPackage(pkg)); true }.getOrDefault(false)) return true
        }
        return runCatching { act.startActivity(Intent.createChooser(base, "Google Lens")); true }.getOrDefault(false)
    }

    private fun analyze(uri: Uri) {
        last = uri
        val image = try { InputImage.fromFilePath(act, uri) } catch (e: Exception) {
            done(JSONObject().put("ok", false).put("error", e.message ?: "image")); return
        }
        val bar = BarcodeScanning.getClient().process(image)
        val txt = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image)
        val lab = ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS).process(image)
        Tasks.whenAllComplete(bar, txt, lab).addOnCompleteListener {
            val out = JSONObject().put("ok", true)
            val codes = JSONArray()
            if (bar.isSuccessful) bar.result.mapNotNull { it.rawValue }.distinct().forEach { codes.put(it) }
            val lines = JSONArray()
            if (txt.isSuccessful) {
                // biggest text first: brand / model names are usually printed large
                txt.result.textBlocks.flatMap { it.lines }
                    .sortedByDescending { (it.boundingBox?.height() ?: 0) }
                    .map { it.text.trim() }.filter { it.length in 2..60 }.distinct().take(25)
                    .forEach { lines.put(it) }
            }
            val labels = JSONArray()
            if (lab.isSuccessful) lab.result.sortedByDescending { it.confidence }.take(6)
                .forEach { labels.put(JSONObject().put("text", it.text).put("conf", it.confidence.toDouble())) }
            out.put("barcodes", codes).put("lines", lines).put("labels", labels)
            val errs = listOf(bar, txt, lab).mapNotNull { t -> t.exception?.message }
            if (errs.isNotEmpty()) out.put("warn", errs.joinToString(" | ").take(200))
            Thread { out.put("thumb", thumb(uri) ?: ""); done(out) }.start()
        }
    }

    /**
     * 🔎 Real visual search: upload the photo to Google Lens (same request the Lens website makes) and return the
     * results URL. Its cookies go into the app's cookie jar so the hidden browser / the Lens sheet can open it.
     */
    fun lensUpload(): JSONObject {
        val u = last ?: return JSONObject().put("ok", false).put("error", "no photo")
        return try {
            val jpg = jpeg(u, 1000) ?: throw Exception("image")
            val b = "----arkhas" + System.currentTimeMillis()
            val head = "--$b\r\nContent-Disposition: form-data; name=\"encoded_image\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"
            val body = head.toByteArray() + jpg + "\r\n--$b--\r\n".toByteArray()
            val c = java.net.URL("https://lens.google.com/v3/upload?hl=en&gl=EG&re=df&stcs=${System.currentTimeMillis()}&ep=gsbubb")
                .openConnection() as java.net.HttpURLConnection
            c.instanceFollowRedirects = false
            c.requestMethod = "POST"; c.doOutput = true
            c.connectTimeout = 15000; c.readTimeout = 30000
            c.setRequestProperty("User-Agent", Net.DESKTOP_UA)
            c.setRequestProperty("Accept-Language", "en-US,en;q=0.9,ar;q=0.8")
            c.setRequestProperty("Referer", "https://lens.google.com/")
            c.setRequestProperty("Origin", "https://lens.google.com")
            c.setRequestProperty("Content-Type", "multipart/form-data; boundary=$b")
            c.outputStream.use { it.write(body) }
            val code = c.responseCode
            val cm = android.webkit.CookieManager.getInstance()
            c.headerFields.filterKeys { it != null && it.equals("Set-Cookie", true) }.values.flatten().forEach { ck ->
                cm.setCookie("https://www.google.com", ck); cm.setCookie("https://lens.google.com", ck)
            }
            cm.flush()
            var loc = c.getHeaderField("Location")
            if (loc == null && code == 200) {
                val html = c.inputStream.bufferedReader().use { it.readText() }
                loc = Regex("https://www\\.google\\.com/search\\?[^\"'<> ]+").find(html)?.value?.replace("&amp;", "&")
            }
            c.disconnect()
            if (loc.isNullOrBlank()) JSONObject().put("ok", false).put("error", "Lens HTTP $code")
            else JSONObject().put("ok", true).put("url", java.net.URL(java.net.URL("https://lens.google.com/"), loc).toString())
        } catch (e: Exception) { JSONObject().put("ok", false).put("error", e.message ?: "lens") }
    }

    private fun jpeg(uri: Uri, max: Int): ByteArray? = runCatching {
        val bmp: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(act.contentResolver, uri)) { d, info, _ ->
                val sc = maxOf(info.size.width, info.size.height).toFloat() / max
                if (sc > 1) d.setTargetSize((info.size.width / sc).toInt(), (info.size.height / sc).toInt())
                d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val o = BitmapFactory.Options().apply { inSampleSize = 4 }
            act.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, o)!! }
        }
        val bo = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bo)
        bo.toByteArray()
    }.getOrNull()

    /** small JPEG preview for the page */
    private fun thumb(uri: Uri): String? = runCatching {
        val bmp: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(act.contentResolver, uri)) { d, info, _ ->
                val s = maxOf(info.size.width, info.size.height) / 320
                if (s > 1) d.setTargetSize(info.size.width / s, info.size.height / s)
                d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val o = BitmapFactory.Options().apply { inSampleSize = 8 }
            act.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, o)!! }
        }
        val bo = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 72, bo)
        "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP)
    }.getOrNull()
}
