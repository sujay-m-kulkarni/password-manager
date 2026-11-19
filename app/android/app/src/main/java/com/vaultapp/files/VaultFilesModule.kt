package com.vaultapp.files

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.vaultapp.backup.DailyBackup

/**
 * Saves and opens backup files through Android's own file picker (Storage Access Framework):
 * the user chooses where (Google Drive, Downloads, a USB stick…). Vault needs no storage
 * permission and never sees other files. Only text is handled: a backup is JSON text.
 *
 * Automatic backup: the user picks one folder once (ACTION_OPEN_DOCUMENT_TREE); Android keeps
 * that permission across restarts, so later backups are written there without a picker. Files in
 * that folder are not app data, so they survive uninstalling Vault.
 */
class VaultFilesModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pending: Promise? = null
  private var pendingText: String? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "VaultFiles"

  /** Resolves to { name } once saved, or null if the user cancelled. */
  @ReactMethod
  fun saveText(fileName: String, text: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || pending != null) {
      promise.reject("E_BUSY", "The file picker is not available right now.")
      return
    }
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("application/octet-stream")
      .putExtra(Intent.EXTRA_TITLE, fileName)
    pending = promise
    pendingText = text
    try {
      activity.startActivityForResult(intent, REQ_SAVE)
    } catch (e: Exception) {
      clear()
      promise.reject("E_PICKER", e.message, e)
    }
  }

  /** Resolves to { uri, name } of the folder picked for automatic backups, or null if cancelled. */
  @ReactMethod
  fun pickFolder(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || pending != null) {
      promise.reject("E_BUSY", "The folder picker is not available right now.")
      return
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
      .addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
      )
    pending = promise
    try {
      activity.startActivityForResult(intent, REQ_FOLDER)
    } catch (e: Exception) {
      clear()
      promise.reject("E_PICKER", e.message, e)
    }
  }

  /** True while Vault still has write access to the folder (the user can revoke it in Android). */
  @ReactMethod
  fun canWriteFolder(treeUri: String, promise: Promise) {
    promise.resolve(
      reactContext.contentResolver.persistedUriPermissions.any {
        it.uri.toString() == treeUri && it.isWritePermission
      },
    )
  }

  /** Gives up access to the folder (automatic backup turned off). Files already there stay. */
  @ReactMethod
  fun releaseFolder(treeUri: String, promise: Promise) {
    try {
      reactContext.contentResolver.releasePersistableUriPermission(
        Uri.parse(treeUri),
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (_: Exception) {
      // already gone
    }
    promise.resolve(null)
  }

  /**
   * Writes `text` as a new file `fileName` in the folder, then deletes the oldest files whose
   * names start with `prefix` so that `keep` remain. Other files in the folder are never touched.
   * Resolves to { name }; rejects with E_NO_ACCESS when the folder can't be written any more.
   */
  @ReactMethod
  fun writeToFolder(treeUri: String, fileName: String, text: String, prefix: String, keep: Int, promise: Promise) {
    try {
      val file = DailyBackup.writeToFolder(reactContext.contentResolver, treeUri, fileName, text.toByteArray(Charsets.UTF_8), prefix, keep)
      val result = Arguments.createMap()
      result.putString("name", displayName(file) ?: fileName)
      promise.resolve(result)
    } catch (e: SecurityException) {
      promise.reject("E_NO_ACCESS", "Vault can no longer write to the backup folder. Choose it again in Settings.", e)
    } catch (e: Exception) {
      promise.reject("E_FILE", e.message ?: "Could not save the automatic backup.", e)
    }
  }

  /**
   * 1.9.0: saves a backup somewhere the person picks (meant for off the phone, e.g. Google Drive)
   * and asks to keep access, so the daily backup can overwrite that same file later. Resolves to
   * { uri, name, authority, persisted } or null if cancelled. `authority` tells where it went
   * (Drive, phone storage…); `persisted` is false when that place won't let Vault update it later.
   */
  @ReactMethod
  fun saveOffPhone(fileName: String, text: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || pending != null) {
      promise.reject("E_BUSY", "The file picker is not available right now.")
      return
    }
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("application/octet-stream")
      .putExtra(Intent.EXTRA_TITLE, fileName)
      .addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
      )
    pending = promise
    pendingText = text
    try {
      activity.startActivityForResult(intent, REQ_SAVE_KEEP)
    } catch (e: Exception) {
      clear()
      promise.reject("E_PICKER", e.message, e)
    }
  }

  /** Lets go of a file kept for the daily backup (it is replaced by another). The file stays. */
  @ReactMethod
  fun releaseFile(uri: String, promise: Promise) {
    try {
      reactContext.contentResolver.releasePersistableUriPermission(
        Uri.parse(uri),
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (_: Exception) {
      // nothing held
    }
    promise.resolve(null)
  }

  /** The latest encrypted backup, kept in Vault's own storage for the daily copy. */
  @ReactMethod
  fun saveSnapshot(text: String, promise: Promise) {
    try {
      DailyBackup.saveSnapshot(reactContext, text)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_FILE", e.message ?: "Could not prepare the daily backup.", e)
    }
  }

  /** Where and when the daily backup goes; sets the alarm. Empty uri = not used. */
  @ReactMethod
  fun configureDaily(folderUri: String, driveUri: String, hour: Int, minute: Int, promise: Promise) {
    try {
      DailyBackup.configure(reactContext, folderUri.ifEmpty { null }, driveUri.ifEmpty { null }, hour, minute)
      promise.resolve(statusMap())
    } catch (e: Exception) {
      promise.reject("E_SCHEDULE", e.message ?: "Could not set the daily backup.", e)
    }
  }

  @ReactMethod
  fun dailyStatus(promise: Promise) {
    promise.resolve(statusMap())
  }

  /** Back up now: the same copy the daily alarm makes, off the UI thread. */
  @ReactMethod
  fun runDailyNow(promise: Promise) {
    Thread {
      try {
        DailyBackup.run(reactContext)
        promise.resolve(statusMap())
      } catch (e: Exception) {
        promise.reject("E_FILE", e.message ?: "Could not back up.", e)
      }
    }.start()
  }

  private fun statusMap() = Arguments.createMap().apply {
    for ((k, v) in DailyBackup.status(reactContext)) {
      when (v) {
        is Double -> putDouble(k, v)
        is String -> putString(k, v)
        null -> putNull(k)
      }
    }
  }

  /** Resolves to { name, text } for the picked file, or null if the user cancelled. */
  @ReactMethod
  fun openText(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || pending != null) {
      promise.reject("E_BUSY", "The file picker is not available right now.")
      return
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("*/*")
    pending = promise
    try {
      activity.startActivityForResult(intent, REQ_OPEN)
    } catch (e: Exception) {
      clear()
      promise.reject("E_PICKER", e.message, e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_SAVE && requestCode != REQ_OPEN && requestCode != REQ_FOLDER && requestCode != REQ_SAVE_KEEP) return
    val promise = pending ?: return
    val text = pendingText
    clear()
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null)
      return
    }
    if (requestCode == REQ_FOLDER) {
      try {
        reactContext.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
        )
        val folder = DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri))
        val result = Arguments.createMap()
        result.putString("uri", uri.toString())
        result.putString("name", displayName(folder) ?: "Chosen folder")
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("E_FOLDER", e.message ?: "Could not use that folder.", e)
      }
      return
    }
    if (requestCode == REQ_SAVE_KEEP) {
      try {
        reactContext.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text!!.toByteArray(Charsets.UTF_8)) }
        val persisted = try {
          reactContext.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
          )
          true
        } catch (_: Exception) {
          false
        }
        val result = Arguments.createMap()
        result.putString("uri", uri.toString())
        result.putString("name", displayName(uri))
        result.putString("authority", uri.authority ?: "")
        result.putBoolean("persisted", persisted)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("E_FILE", e.message ?: "Could not save the backup there.", e)
      }
      return
    }
    try {
      val result = Arguments.createMap()
      result.putString("name", displayName(uri))
      if (requestCode == REQ_SAVE) {
        reactContext.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text!!.toByteArray(Charsets.UTF_8)) }
      } else {
        val bytes = reactContext.contentResolver.openInputStream(uri)!!.use { input ->
          val out = java.io.ByteArrayOutputStream()
          val buf = ByteArray(64 * 1024)
          var total = 0
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            total += n
            if (total > MAX_BYTES) throw IllegalStateException("This file is too large to be a Vault backup.")
            out.write(buf, 0, n)
          }
          out.toByteArray()
        }
        result.putString("text", String(bytes, Charsets.UTF_8))
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("E_FILE", e.message ?: "Could not use that file.", e)
    }
  }

  override fun onNewIntent(intent: Intent) {}

  private fun displayName(uri: Uri): String? =
    try {
      reactContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
        if (it.moveToFirst()) it.getString(0) else null
      }
    } catch (_: Exception) {
      null
    }

  private fun clear() {
    pending = null
    pendingText = null
  }

  companion object {
    private const val REQ_SAVE = 0x5A1
    private const val REQ_OPEN = 0x5A2
    private const val REQ_FOLDER = 0x5A3
    private const val REQ_SAVE_KEEP = 0x5A4
    private const val MAX_BYTES = 50 * 1024 * 1024
  }
}
