package com.vaultapp.backup

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Daily backup (1.9.0): once a day, at the time the person chose, copy the latest backup to the
 * backup folder on the phone and overwrite the backup file kept off the phone (e.g. Google Drive).
 *
 * The vault is usually locked at that time, so this never opens it. Instead, whenever the vault is
 * unlocked and changes, the app writes an up-to-date backup (already encrypted: it opens only with
 * the master password or recovery key) to Vault's private storage — the "snapshot". This job only
 * copies that file. Vault itself still has no internet permission: the Drive app uploads the file.
 *
 * Settings live in SharedPreferences (the encrypted database is unreadable while locked); the app
 * mirrors them here every time it unlocks.
 */
object DailyBackup {
  const val ACTION_RUN = "com.vaultapp.backup.DAILY_RUN"
  const val PREFIX = "vault-auto-"
  const val KEEP = 7

  private const val PREFS = "vault_daily_backup"
  private const val SNAPSHOT = "latest.vaultbackup"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun snapshotFile(c: Context): File = File(File(c.filesDir, "backup").apply { mkdirs() }, SNAPSHOT)

  /** Written by the app while unlocked: replace atomically so a half-written file is never copied. */
  fun saveSnapshot(c: Context, text: String) {
    val target = snapshotFile(c)
    val tmp = File(target.parentFile, "$SNAPSHOT.tmp")
    tmp.writeText(text, Charsets.UTF_8)
    if (!tmp.renameTo(target)) {
      target.writeText(text, Charsets.UTF_8)
      tmp.delete()
    }
    prefs(c).edit().putLong("snapshotAt", System.currentTimeMillis()).apply()
  }

  fun configure(c: Context, folderUri: String?, driveUri: String?, hour: Int, minute: Int) {
    prefs(c).edit()
      .putString("folderUri", folderUri)
      .putString("driveUri", driveUri)
      .putInt("hour", hour.coerceIn(0, 23))
      .putInt("minute", minute.coerceIn(0, 59))
      .apply()
    schedule(c)
  }

  fun status(c: Context): Map<String, Any?> {
    val p = prefs(c)
    return mapOf(
      "lastRunAt" to p.getLong("lastRunAt", 0L).toDouble(),
      "folderOkAt" to p.getLong("folderOkAt", 0L).toDouble(),
      "driveOkAt" to p.getLong("driveOkAt", 0L).toDouble(),
      "snapshotAt" to p.getLong("snapshotAt", 0L).toDouble(),
      "nextAt" to p.getLong("nextAt", 0L).toDouble(),
      "error" to p.getString("error", null),
    )
  }

  /** Next time at hour:minute (local), strictly in the future. */
  fun nextRun(nowMs: Long, hour: Int, minute: Int): Long {
    val cal = Calendar.getInstance().apply {
      timeInMillis = nowMs
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    if (cal.timeInMillis <= nowMs) cal.add(Calendar.DAY_OF_YEAR, 1)
    return cal.timeInMillis
  }

  /** (Re)sets the alarm. Safe to call often: there is only ever one. */
  fun schedule(c: Context) {
    val p = prefs(c)
    val alarm = c.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = PendingIntent.getBroadcast(
      c,
      1,
      Intent(c, DailyBackupReceiver::class.java).setAction(ACTION_RUN),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    if (p.getString("folderUri", null) == null && p.getString("driveUri", null) == null) {
      alarm.cancel(pi)
      p.edit().putLong("nextAt", 0L).apply()
      return
    }
    val at = nextRun(System.currentTimeMillis(), p.getInt("hour", 21), p.getInt("minute", 0))
    // Inexact on purpose: no "exact alarm" permission needed. Android may run it a few minutes late
    // to save battery, even in Doze.
    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    p.edit().putLong("nextAt", at).apply()
  }

  /** Copies the snapshot to the folder and the off-phone file. Records what worked. Never throws. */
  fun run(c: Context) {
    val p = prefs(c)
    val now = System.currentTimeMillis()
    val edit = p.edit().putLong("lastRunAt", now)
    val errors = mutableListOf<String>()
    val snap = snapshotFile(c)
    if (!snap.exists()) {
      edit.putString("error", "No backup to copy yet. Open Vault once to prepare it.").apply()
      return
    }
    val bytes = try {
      snap.readBytes()
    } catch (e: Exception) {
      edit.putString("error", "Could not read the prepared backup.").apply()
      return
    }
    p.getString("folderUri", null)?.let { folder ->
      try {
        writeToFolder(c.contentResolver, folder, fileName(Date(now)), bytes, PREFIX, KEEP)
        edit.putLong("folderOkAt", now)
      } catch (e: SecurityException) {
        errors.add("Vault can no longer write to the backup folder. Choose it again in Settings.")
      } catch (e: Exception) {
        errors.add("The backup folder could not be written: ${e.message ?: "unknown error"}.")
      }
    }
    p.getString("driveUri", null)?.let { drive ->
      try {
        overwrite(c.contentResolver, Uri.parse(drive), bytes)
        edit.putLong("driveOkAt", now)
      } catch (e: SecurityException) {
        errors.add("Vault can no longer update the copy off this phone. Save it again in Settings.")
      } catch (e: Exception) {
        errors.add("The copy off this phone could not be updated: ${e.message ?: "unknown error"}.")
      }
    }
    edit.putString("error", if (errors.isEmpty()) null else errors.joinToString("\n")).apply()
  }

  fun fileName(d: Date): String = PREFIX + SimpleDateFormat("yyyy-MM-dd-HHmmss", Locale.US).format(d) + ".vaultbackup"

  /** Replaces the whole content of a file the person picked (and Vault kept access to). */
  fun overwrite(resolver: ContentResolver, uri: Uri, bytes: ByteArray) {
    val out = try {
      resolver.openOutputStream(uri, "wt")
    } catch (e: SecurityException) {
      throw e
    } catch (e: Exception) {
      null // some providers don't know "wt"; for them "w" replaces the file
    } ?: resolver.openOutputStream(uri, "w") ?: throw IllegalStateException("The file can't be opened for writing.")
    out.use { it.write(bytes) }
  }

  /**
   * Writes a new file in the picked folder, then deletes the oldest files starting with `prefix`
   * so that `keep` remain. Other files in the folder are never touched. Returns the new file's uri.
   */
  fun writeToFolder(resolver: ContentResolver, treeUri: String, name: String, bytes: ByteArray, prefix: String, keep: Int): Uri {
    val tree = Uri.parse(treeUri)
    val folder = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    val file = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", name)
      ?: throw IllegalStateException("Could not create the backup file.")
    resolver.openOutputStream(file, "wt")!!.use { it.write(bytes) }

    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(folder))
    val ours = mutableListOf<Pair<String, String>>() // name, documentId
    resolver.query(
      children,
      arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME),
      null,
      null,
      null,
    )?.use { c ->
      while (c.moveToNext()) {
        val n = c.getString(1) ?: continue
        if (n.startsWith(prefix)) ours.add(n to c.getString(0))
      }
    }
    // Names carry the date and time, so sorting by name is sorting by age.
    ours.sortedByDescending { it.first }.drop(maxOf(1, keep)).forEach { (_, id) ->
      try {
        DocumentsContract.deleteDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, id))
      } catch (_: Exception) {
        // an old copy that can't be deleted is harmless
      }
    }
    return file
  }
}
