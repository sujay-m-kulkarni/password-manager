package com.vaultapp.files

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Saves and opens backup files through Android's own file picker (Storage Access Framework):
 * the user chooses where (Google Drive, Downloads, a USB stick…). Vault needs no storage
 * permission and never sees other files. Only text is handled: a backup is JSON text.
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
    if (requestCode != REQ_SAVE && requestCode != REQ_OPEN) return
    val promise = pending ?: return
    val text = pendingText
    clear()
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null)
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
    private const val MAX_BYTES = 50 * 1024 * 1024
  }
}
