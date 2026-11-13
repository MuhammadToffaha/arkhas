package com.toffaha.machich

import android.Manifest
import android.app.AlarmManager
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
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Result of a self-update session. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (Prefs.inForeground) runCatching { ctx.startActivity(confirm) }
                else Notify.show(ctx, 2, "🎁 Mach ich! update ready", "Tap to install. Next updates install by themselves.", confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> MainActivity.instance?.installMsg("⚠️ Update failed: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""))
        }
    }
}

class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        Notify.show(ctx, 1, "✅ Mach ich! updated", "Version " + BuildConfig.VERSION_NAME, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
        UpdateWorker.schedule(ctx)
        Reminder.schedule(ctx)
    }
}

/** ⏰ Daily study reminder — only fires if today's lesson isn't done yet. Rescheduled after reboot. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) { Reminder.schedule(ctx); return }
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        if (Prefs.get(ctx, "studied", "") != today && !Prefs.inForeground) {
            val streak = Prefs.get(ctx, "streak", "0")
            val txt = if (streak != "0") "🔥 $streak-day streak — keep it alive! 10 minutes is enough." else "Your 10-minute German session is waiting. Los geht's!"
            Notify.show(ctx, 5, "🇩🇪 Zeit für Deutsch!", txt, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
        }
        Reminder.schedule(ctx)
    }
}

object Reminder {
    fun schedule(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(ctx, 77, Intent(ctx, ReminderReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        val hm = Prefs.get(ctx, "remind", "19:00")
        if (hm == "off") return
        val (h, m) = hm.split(":").map { it.toIntOrNull() ?: 0 }
        val c = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0)
            if (timeInMillis <= System.currentTimeMillis() + 60_000) add(Calendar.DAY_OF_YEAR, 1)
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.timeInMillis, pi)
    }
}

object Notify {
    private const val CHANNEL = "machich"
    fun show(ctx: Context, id: Int, title: String, text: String, open: Intent?) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ctx.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "Mach ich!", NotificationManager.IMPORTANCE_DEFAULT))
        val pi = open?.let { PendingIntent.getActivity(ctx, id, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title).setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true).setContentIntent(pi).build()
        runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
    }
}
