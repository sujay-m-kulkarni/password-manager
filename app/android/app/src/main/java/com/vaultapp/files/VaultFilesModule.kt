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
      val resolver = reactContext.contentResolver
      val tree = Uri.parse(treeUri)
      val folder = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
      val file = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", fileName)
        ?: throw IllegalStateException("Could not create the backup file.")
      resolver.openOutputStream(file, "wt")!!.use { it.write(text.toByteArray(Charsets.UTF_8)) }

      // Prune: newest first by name (names carry the date and time).
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
          val name = c.getString(1) ?: continue
          if (name.startsWith(prefix)) ours.add(name to c.getString(0))
        }
      }
      ours.sortedByDescending { it.first }.drop(maxOf(1, keep)).forEach { (_, id) ->
        try {
          DocumentsContract.deleteDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, id))
        } catch (_: Exception) {
          // an old copy that can't be deleted is harmless
        }
      }
      val result = Arguments.createMap()
      result.putString("name", displayName(file) ?: fileName)
      promise.resolve(result)
    } catch (e: SecurityException) {
      promise.reject("E_NO_ACCESS", "Vault can no longer write to the backup folder. Choose it again in Settings.", e)
    } catch (e: Exception) {
      promise.reject("E_FILE", e.message ?: "Could not save the automatic backup.", e)
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
    if (requestCode != REQ_SAVE && requestCode != REQ_OPEN && requestCode != REQ_FOLDER) return
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
    private const val MAX_BYTES = 50 * 1024 * 1024
  }
}
