package com.toffaha.zakaa

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Result of a self-update session. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (Prefs.inForeground) runCatching { ctx.startActivity(confirm) }
                else Notify.show(ctx, 2, "🎁 تحديث ذكاء جاهز", "اضغط للتثبيت. التحديثات الجاية هتتثبت لوحدها.", confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> MainActivity.instance?.installMsg("⚠️ فشل التحديث: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""))
        }
    }
}

class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        Notify.show(ctx, 1, "✅ ذكاء اتحدّث", "النسخة " + BuildConfig.VERSION_NAME, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
        UpdateWorker.schedule(ctx)
    }
}

object Notify {
    private const val CHANNEL = "zakaa"
    fun show(ctx: Context, id: Int, title: String, text: String, open: Intent?) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ctx.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "ذكاء", NotificationManager.IMPORTANCE_DEFAULT))
        val pi = open?.let { PendingIntent.getActivity(ctx, id, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title).setContentText(text)
            .setAutoCancel(true).setContentIntent(pi).build()
        runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
    }
}
