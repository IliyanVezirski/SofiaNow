package com.sofia

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
            Log.w(TAG, "SEND_SMS permission not granted for scheduled SMS $scheduleId")
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
            Log.i(TAG, "Scheduled parking SMS sent: $scheduleId -> $destination")

            // Store completed ID so JS can consume it
            ParkingSmsAutomationModule.addCompletedId(context, scheduleId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send scheduled parking SMS $scheduleId", e)
        }
    }
}
