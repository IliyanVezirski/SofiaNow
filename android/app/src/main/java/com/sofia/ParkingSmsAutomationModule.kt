package com.sofia

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ParkingSmsAutomationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ParkingSmsAutomation"
        private const val PREFS_NAME = "ParkingSmsAutomationPrefs"
        private const val KEY_COMPLETED_IDS = "completedScheduledIds"

        internal fun addCompletedId(context: Context, id: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val existing = prefs.getStringSet(KEY_COMPLETED_IDS, mutableSetOf()) ?: mutableSetOf()
            val updated = existing.toMutableSet()
            updated.add(id)
            prefs.edit().putStringSet(KEY_COMPLETED_IDS, updated).apply()
        }
    }

    override fun getName(): String = NAME

    private fun requireSmsPermission() {
        val granted = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            throw RuntimeException("SEND_SMS permission not granted")
        }
    }

    @ReactMethod
    fun sendParkingSms(destination: String, body: String, promise: Promise) {
        try {
            requireSmsPermission()
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                reactContext.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            smsManager.sendTextMessage(destination, null, body, null, null)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SEND_SMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun scheduleParkingSms(destination: String, body: String, triggerAtMillis: Double, promise: Promise) {
        try {
            requireSmsPermission()

            val triggerAt = triggerAtMillis.toLong()
            val scheduleId = "parking_sms_${System.currentTimeMillis()}_${(Math.random() * 100000).toInt()}"

            val intent = Intent(reactContext, ParkingSmsAlarmReceiver::class.java).apply {
                action = "com.sofia.SEND_PARKING_SMS"
                putExtra("scheduleId", scheduleId)
                putExtra("destination", destination)
                putExtra("body", body)
            }

            val pendingIntent = PendingIntent.getBroadcast(
                reactContext,
                scheduleId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            var exactAlarmGranted = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                exactAlarmGranted = alarmManager.canScheduleExactAlarms()
            }

            if (exactAlarmGranted) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent
                )
            } else {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent
                )
            }

            val result = Arguments.createMap().apply {
                putString("id", scheduleId)
                putBoolean("exactAlarmGranted", exactAlarmGranted)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_SMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelScheduledParkingSms(id: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, ParkingSmsAlarmReceiver::class.java).apply {
                action = "com.sofia.SEND_PARKING_SMS"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                reactContext,
                id.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_SMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun consumeCompletedScheduledParkingSmsIds(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val ids = prefs.getStringSet(KEY_COMPLETED_IDS, mutableSetOf()) ?: mutableSetOf()
            val result = Arguments.createArray()
            ids.forEach { result.pushString(it) }
            prefs.edit().remove(KEY_COMPLETED_IDS).apply()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CONSUME_IDS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                promise.resolve(alarmManager.canScheduleExactAlarms())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("EXACT_ALARM_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OPEN_SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // Required for RN event emitter
    }

    internal fun emitScheduledSmsSent(scheduleId: String) {
        val params = Arguments.createMap().apply {
            putString("id", scheduleId)
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("parkingSmsScheduledSent", params)
    }
}
