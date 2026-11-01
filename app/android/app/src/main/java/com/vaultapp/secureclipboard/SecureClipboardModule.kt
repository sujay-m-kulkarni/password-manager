package com.vaultapp.secureclipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Minimal clipboard module so the app doesn't need a third-party clipboard package.
 *
 * - copySensitive(text, clearAfterMs): copies, marks the clip sensitive (Android 13+
 *   hides it from previews and keyboard suggestions) and schedules a native clear.
 *   The native timer keeps running after the user switches to another app to paste,
 *   unlike JS timers.
 * - clearIfOurs(): clears now, but only if the clipboard still holds our clip, so we
 *   never wipe something the user copied from another app afterwards.
 */
class SecureClipboardModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val handler = Handler(Looper.getMainLooper())
  private var lastClipToken: String? = null
  private val clearTask = Runnable { clearInternal() }

  override fun getName(): String = "SecureClipboard"

  private fun clipboard(): ClipboardManager =
    reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  @ReactMethod
  fun copySensitive(text: String, clearAfterMs: Double, promise: Promise) {
    handler.post {
      try {
        val clip = ClipData.newPlainText("vault", text)
        val token = java.util.UUID.randomUUID().toString()
        val extras = PersistableBundle()
        extras.putString(TOKEN_KEY, token)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
        } else {
          extras.putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
        clip.description.extras = extras
        clipboard().setPrimaryClip(clip)
        lastClipToken = token
        handler.removeCallbacks(clearTask)
        handler.postDelayed(clearTask, clearAfterMs.toLong())
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_COPY", e.message, e)
      }
    }
  }

  @ReactMethod
  fun clearIfOurs(promise: Promise) {
    handler.post {
      try {
        handler.removeCallbacks(clearTask)
        clearInternal()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_CLEAR", e.message, e)
      }
    }
  }

  private fun clearInternal() {
    val token = lastClipToken ?: return
    val cm = clipboard()
    // From the background Android 10+ may not let us read the clipboard. If we can't
    // read it, assume the clip is still ours and clear; if we can read it and it's
    // someone else's, leave it alone.
    val desc = try { cm.primaryClipDescription } catch (_: Exception) { null }
    val current = desc?.extras?.getString(TOKEN_KEY)
    if (desc == null || current == token) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          cm.clearPrimaryClip()
        } else {
          cm.setPrimaryClip(ClipData.newPlainText("", ""))
        }
      } catch (_: Exception) {
        // best effort
      }
    }
    lastClipToken = null
  }

  override fun invalidate() {
    // App process is going away: don't leave a password behind.
    handler.removeCallbacks(clearTask)
    clearInternal()
    super.invalidate()
  }

  companion object {
    private const val TOKEN_KEY = "com.vaultapp.clipToken"
  }
}
