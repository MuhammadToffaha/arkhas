package eg.arkhas.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/** 🤫 Result of a silent install + "app was updated" after the new version starts. */
class UpdateReceiver : BroadcastReceiver() {
    companion object {
        const val STATUS = "eg.arkhas.app.UPDATE_STATUS"
        private const val CH = "updates"
        private const val NID = 7101

        fun notify(ctx: Context, title: String, text: String, tap: Intent?) {
            if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CH, "تحديثات التطبيق · App updates", NotificationManager.IMPORTANCE_LOW))
            val b = NotificationCompat.Builder(ctx, CH).setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(title).setContentText(text).setAutoCancel(true)
            if (tap != null) b.setContentIntent(PendingIntent.getActivity(ctx, NID, tap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            nm.notify(NID, b.build())
        }
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        val prefs = ctx.getSharedPreferences("arkhas", Context.MODE_PRIVATE)
        when (intent.action) {
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                notify(ctx, "✅ أرخص اتحدّث · Arkhas updated", "النسخة ${BuildConfig.VERSION_NAME} جاهزة · version ${BuildConfig.VERSION_NAME}",
                    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
                AutoUpdate.schedule(ctx)
            }
            STATUS -> when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    // first in-app update (or Android < 12): Android needs one tap to confirm
                    @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                    if (intent.getBooleanExtra("bg", false))
                        notify(ctx, "🔄 تحديث جديد جاهز · Update ready", "اضغط للتثبيت · Tap to install", confirm)
                    else runCatching { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        .onFailure { notify(ctx, "🔄 تحديث جديد جاهز · Update ready", "اضغط للتثبيت · Tap to install", confirm) }
                }
                PackageInstaller.STATUS_SUCCESS -> prefs.edit().putString("updErr", "").apply()
                else -> prefs.edit().putString("updErr", "$st ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""}").apply()
            }
        }
    }
}

/** 🤫 Background auto-update: every 6 h, if a newer GitHub release exists, download + install it silently. */
object AutoUpdate {
    private const val WORK = "arkhas-auto-update"
    fun enabled(ctx: Context) = ctx.getSharedPreferences("arkhas", Context.MODE_PRIVATE).getString("p_autoUpd", "1") != "0"
    fun schedule(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        if (!enabled(ctx)) { wm.cancelUniqueWork(WORK); return }
        val req = PeriodicWorkRequestBuilder<AutoUpdateWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).setRequiresBatteryNotLow(true).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
    }
}

class AutoUpdateWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!AutoUpdate.enabled(applicationContext)) return@withContext Result.success()
        runCatching {
            val info = Updater.check(applicationContext, true)
            if (info.optBoolean("available")) {
                val apk = Updater.download(applicationContext, info.getString("url")) {}
                if (Build.VERSION.SDK_INT < 26 || applicationContext.packageManager.canRequestPackageInstalls())
                    Updater.installSilent(applicationContext, apk, fromBackground = true)
            }
        }
        Result.success()
    }
}
