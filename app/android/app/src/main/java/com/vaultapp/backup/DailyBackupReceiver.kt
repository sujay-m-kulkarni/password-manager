package com.vaultapp.backup

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Runs the daily backup when its alarm goes off, and puts the alarm back after the phone restarts
 * or Vault is updated (Android forgets alarms then). Does no work on any other broadcast.
 */
class DailyBackupReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    when (intent.action) {
      DailyBackup.ACTION_RUN -> {
        val pending = goAsync()
        Thread {
          try {
            DailyBackup.run(app)
          } finally {
            try {
              DailyBackup.schedule(app)
            } finally {
              pending.finish()
            }
          }
        }.start()
      }
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> DailyBackup.schedule(app)
    }
  }
}
