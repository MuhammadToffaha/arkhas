package com.toffaha.zakaa

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

object Prefs {
    @Volatile var inForeground = false
    fun p(ctx: Context) = ctx.getSharedPreferences("prefs", Context.MODE_PRIVATE)
    fun get(ctx: Context, k: String, d: String): String = p(ctx).getString(k, d) ?: d
    fun set(ctx: Context, k: String, v: String) {
        p(ctx).edit().putString(k, v).apply()
        if (k == "auto" || k == "wifi") UpdateWorker.schedule(ctx)
    }
    fun auto(ctx: Context) = get(ctx, "auto", "true") == "true"
    fun wifi(ctx: Context) = get(ctx, "wifi", "true") == "true"
}

/** 🤫 Once a day: silent self-update (never while a kid is playing). */
class UpdateWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Prefs.auto(ctx)) return Result.success()
        val rel = try { withContext(Dispatchers.IO) { Updater.latest() } } catch (e: Exception) { return Result.retry() }
            ?: return Result.success()
        if (rel.code <= BuildConfig.VERSION_CODE || Prefs.inForeground) return Result.success()
        if (!Updater.canInstall(ctx)) {
            Notify.show(ctx, 3, "🎁 تحديث جديد لذكاء", "افتح التطبيق للسماح بالتحديث التلقائي", ctx.packageManager.getLaunchIntentForPackage(ctx.packageName))
            return Result.success()
        }
        return try {
            val f = withContext(Dispatchers.IO) { Updater.download(ctx, rel.url) {} }
            if (Prefs.inForeground) return Result.success()
            withContext(Dispatchers.IO) { Updater.install(ctx, f) }
            Result.success()
        } catch (e: Exception) { Result.retry() }
    }

    companion object {
        private const val PERIODIC = "zakaa-daily"
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<UpdateWorker>(24, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(if (Prefs.wifi(ctx)) NetworkType.UNMETERED else NetworkType.CONNECTED)
                    .setRequiresBatteryNotLow(true).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
        }
    }
}
