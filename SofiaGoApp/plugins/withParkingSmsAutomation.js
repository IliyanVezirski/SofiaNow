const { withAndroidManifest, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_DIR = 'com/iliyanvezirski/sofiagoapp';

const MODULE_KT = `package com.iliyanvezirski.SofiaGoApp

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
            val scheduleId = "parking_sms_\${System.currentTimeMillis()}_\${(Math.random() * 100000).toInt()}"

            val intent = Intent(reactContext, ParkingSmsAlarmReceiver::class.java).apply {
                action = "com.iliyanvezirski.SofiaGoApp.SEND_PARKING_SMS"
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
                action = "com.iliyanvezirski.SofiaGoApp.SEND_PARKING_SMS"
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
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    internal fun emitScheduledSmsSent(scheduleId: String) {
        val params = Arguments.createMap().apply {
            putString("id", scheduleId)
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("parkingSmsScheduledSent", params)
    }
}
`;

const PACKAGE_KT = `package com.iliyanvezirski.SofiaGoApp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ParkingSmsAutomationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ParkingSmsAutomationModule(reactContext))
    }

    @Suppress("DEPRECATION_ERROR")
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

const RECEIVER_KT = `package com.iliyanvezirski.SofiaGoApp

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat

class ParkingSmsAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ParkingSmsAlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val scheduleId = intent.getStringExtra("scheduleId") ?: return
        val destination = intent.getStringExtra("destination") ?: return
        val body = intent.getStringExtra("body") ?: return

        val hasPermission = ContextCompat.checkSelfPermission(
            context, Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            Log.w(TAG, "SEND_SMS permission not granted for scheduled SMS \$scheduleId")
            return
        }

        try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            smsManager.sendTextMessage(destination, null, body, null, null)
            Log.i(TAG, "Scheduled parking SMS sent: \$scheduleId -> \$destination")

            ParkingSmsAutomationModule.addCompletedId(context, scheduleId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send scheduled parking SMS \$scheduleId", e)
        }
    }
}
`;

/** Write the three Kotlin source files into the android project. */
function withParkingSmsKotlinFiles(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...PACKAGE_DIR.split('/'),
      );

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'ParkingSmsAutomationModule.kt'), MODULE_KT);
      fs.writeFileSync(path.join(targetDir, 'ParkingSmsAutomationPackage.kt'), PACKAGE_KT);
      fs.writeFileSync(path.join(targetDir, 'ParkingSmsAlarmReceiver.kt'), RECEIVER_KT);

      return cfg;
    },
  ]);
}

/** Add SEND_SMS + SCHEDULE_EXACT_ALARM permissions and the BroadcastReceiver to AndroidManifest. */
function withParkingSmsManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // --- permissions ---
    const perms = manifest.manifest['uses-permission'] || [];
    const existing = new Set(perms.map((p) => p.$?.['android:name']));

    for (const perm of [
      'android.permission.SEND_SMS',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ]) {
      if (!existing.has(perm)) {
        perms.push({ $: { 'android:name': perm } });
      }
    }
    manifest.manifest['uses-permission'] = perms;

    // --- receiver ---
    const app = manifest.manifest.application?.[0];
    if (app) {
      const receivers = app.receiver || [];
      const hasReceiver = receivers.some(
        (r) => r.$?.['android:name'] === '.ParkingSmsAlarmReceiver',
      );
      if (!hasReceiver) {
        receivers.push({
          $: {
            'android:name': '.ParkingSmsAlarmReceiver',
            'android:exported': 'false',
          },
        });
        app.receiver = receivers;
      }
    }

    return cfg;
  });
}

/** Register ParkingSmsAutomationPackage() in MainApplication. */
function withParkingSmsMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('ParkingSmsAutomationPackage')) {
      contents = contents.replace(
        '// add(MyReactNativePackage())',
        'add(ParkingSmsAutomationPackage())',
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

/** Expo config plugin entry point. */
function withParkingSmsAutomation(config) {
  config = withParkingSmsKotlinFiles(config);
  config = withParkingSmsManifest(config);
  config = withParkingSmsMainApplication(config);
  return config;
}

module.exports = withParkingSmsAutomation;
