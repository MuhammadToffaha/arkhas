package com.toffaha.jama

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

/** Result of an install session (+ "JAMA was updated"). */
class InstallReceiver : BroadcastReceiver() {
    companion object {
        const val STATUS = "com.toffaha.jama.INSTALL_STATUS"
        private const val CH = "jama-updates"
        /** set by MainActivity so a finished install refreshes the page */
        @Volatile var onDone: (() -> Unit)? = null
        @Volatile var foreground = false

        fun notify(ctx: Context, id: Int, title: String, text: String, tap: Intent?) {
            if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CH, "تحديثات التطبيقات · App updates", NotificationManager.IMPORTANCE_DEFAULT))
            val b = NotificationCompat.Builder(ctx, CH).setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(title).setContentText(text).setAutoCancel(true)
            if (tap != null) b.setContentIntent(PendingIntent.getActivity(ctx, id, tap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            nm.notify(id, b.build())
        }
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            notify(ctx, 900, "✅ JAMA اتحدّث · JAMA updated", "النسخة ${BuildConfig.VERSION_NAME} · version ${BuildConfig.VERSION_NAME}",
                ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
            AutoUpdate.schedule(ctx)
            return
        }
        if (intent.action != STATUS) return
        val id = intent.getStringExtra("app") ?: return
        val app = runCatching { Store.app(id) }.getOrNull() ?: return
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                Store.status[id] = "confirm"
                if (foreground && !intent.getBooleanExtra("bg", false))
                    runCatching { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        .onFailure { notify(ctx, 100 + Store.APPS.indexOf(app), "🔄 ${app.nameAr} · ${app.nameEn}", "اضغط للتثبيت · Tap to install", confirm) }
                else notify(ctx, 100 + Store.APPS.indexOf(app), "🔄 تحديث ${app.nameAr} جاهز · ${app.nameEn} update ready", "اضغط للتثبيت · Tap to install", confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> { Store.status[id] = "idle"; Store.error.remove(id) }
            else -> {
                Store.status[id] = "error"
                Store.error[id] = (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed ($st)").take(160)
            }
        }
        onDone?.invoke()
    }
}

/** 🤫 once a day (Wi-Fi, battery OK): update every installed app that has a newer release, JAMA itself last. */
object AutoUpdate {
    private const val WORK = "jama-daily-update"
    fun enabled(ctx: Context) = ctx.getSharedPreferences("jama", Context.MODE_PRIVATE).getBoolean("auto", true)
    fun set(ctx: Context, on: Boolean) { ctx.getSharedPreferences("jama", Context.MODE_PRIVATE).edit().putBoolean("auto", on).apply(); schedule(ctx) }
    fun schedule(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        if (!enabled(ctx)) { wm.cancelUniqueWork(WORK); return }
        val req = PeriodicWorkRequestBuilder<DailyWorker>(24, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).setRequiresBatteryNotLow(true).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }
}

class DailyWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        if (!AutoUpdate.enabled(ctx)) return@withContext Result.success()
        if (!Store.check()) return@withContext Result.retry()
        if (!Store.canInstall(ctx)) return@withContext Result.success()
        val todo = Store.APPS.filter { Store.hasUpdate(ctx, it) }.sortedBy { if (it.id == "jama") 1 else 0 }
        for (a in todo) runCatching { Store.downloadAndInstall(ctx, a, fromBackground = true) {} ; Thread.sleep(8000) }
        Result.success()
    }
}
