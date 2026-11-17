package com.vaultapp.crashreport

import android.annotation.TargetApi
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * "Vault closed unexpectedly" report, shown on the next launch after a crash, so a crash can be
 * diagnosed without USB debugging. Two sources:
 *
 *  1. Java/Kotlin crashes and fatal JavaScript errors (React Native rethrows those as a Java
 *     exception): caught by [install] and written to a small file before the process dies.
 *  2. Everything else, including native crashes: Android's own record of why the app last
 *     closed (ApplicationExitInfo, Android 11+). On Android 12+ a native crash comes with the
 *     tombstone, from which the readable lines (abort message, function names) are kept.
 *
 * Nothing leaves the phone: the report is only shown, and shared only if the user taps Share.
 * Stack traces hold code locations, not vault contents (the vault is encrypted and not logged).
 */
class CrashReportModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CrashReport"

  /** { name: "1.2.0", code: 1000021 } of the installed app, for the Settings footer. */
  @ReactMethod
  fun getAppVersion(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      val map = Arguments.createMap()
      map.putString("name", info.versionName ?: "?")
      @Suppress("DEPRECATION")
      val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
      map.putDouble("code", code.toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  /** Keeps a JavaScript error report (from the in-app error screen) until it is dismissed. */
  @ReactMethod
  fun saveReport(reason: String, details: String) {
    try {
      reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(KEY_PENDING_REASON, reason)
        .putLong(KEY_PENDING_WHEN, System.currentTimeMillis())
        .putString(KEY_PENDING_DETAILS, details.take(MAX_CHARS))
        .commit()
    } catch (_: Exception) {
    }
  }

  /** Called when the user closes the report: it won't be shown again. */
  @ReactMethod
  fun dismissCrash() {
    try {
      reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .remove(KEY_PENDING_REASON).remove(KEY_PENDING_WHEN).remove(KEY_PENDING_DETAILS).commit()
    } catch (_: Exception) {
    }
  }

  /**
   * Resolves to null, or { reason, when, details } for the last crash. A report stays pending
   * (shown on every launch) until [dismissCrash], so a crash that repeats can still be shared.
   */
  @ReactMethod
  fun takeLastCrash(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val lastSeen = prefs.getLong(KEY_LAST_SEEN, 0L)
      var reason: String? = null
      var whenMs = 0L
      val details = StringBuilder()

      val saved = File(ctx.filesDir, CRASH_FILE)
      if (saved.exists()) {
        reason = "App error"
        whenMs = saved.lastModified()
        details.append(saved.readText().take(MAX_CHARS))
        saved.delete()
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val exit = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 1).firstOrNull()
        if (exit != null && exit.timestamp > lastSeen && isAbnormal(exit.reason)) {
          if (reason == null) {
            reason = reasonName(exit.reason)
            whenMs = exit.timestamp
          }
          details.append("\n\nAndroid: ").append(reasonName(exit.reason))
          exit.description?.let { details.append(" — ").append(it) }
          details.append("\nImportance: ").append(exit.importance)
            .append(" · memory (PSS) ").append(exit.pss / 1024).append(" MB")
          if (exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
            exit.reason == ApplicationExitInfo.REASON_ANR
          ) {
            readableTrace(exit)?.let { details.append("\n\n").append(it) }
          }
        }
        if (exit != null) {
          prefs.edit().putLong(KEY_LAST_SEEN, maxOf(lastSeen, exit.timestamp)).apply()
        }
      }

      if (reason != null) {
        // A new crash replaces any older pending report.
        prefs.edit()
          .putString(KEY_PENDING_REASON, reason)
          .putLong(KEY_PENDING_WHEN, whenMs)
          .putString(KEY_PENDING_DETAILS, details.toString().trim().take(MAX_CHARS))
          .commit()
      }
      reason = prefs.getString(KEY_PENDING_REASON, null)
      if (reason == null) {
        promise.resolve(null)
        return
      }
      whenMs = prefs.getLong(KEY_PENDING_WHEN, 0L)
      details.setLength(0)
      details.append(prefs.getString(KEY_PENDING_DETAILS, "") ?: "")
      val map = Arguments.createMap()
      map.putString("reason", reason)
      map.putDouble("when", whenMs.toDouble())
      map.putString("details", details.toString().trim().take(MAX_CHARS))
      map.putString(
        "appVersion",
        try {
          ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "?"
        } catch (_: Exception) {
          "?"
        },
      )
      map.putString(
        "device",
        "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · ${Build.SUPPORTED_ABIS.firstOrNull()}",
      )
      promise.resolve(map)
    } catch (e: Exception) {
      promise.resolve(null) // a broken report must never stop the app from opening
    }
  }

  @TargetApi(Build.VERSION_CODES.R)
  private fun isAbnormal(reason: Int): Boolean =
    reason == ApplicationExitInfo.REASON_CRASH ||
      reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
      reason == ApplicationExitInfo.REASON_ANR ||
      reason == ApplicationExitInfo.REASON_LOW_MEMORY ||
      reason == ApplicationExitInfo.REASON_SIGNALED ||
      reason == ApplicationExitInfo.REASON_INITIALIZATION_FAILURE ||
      reason == ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE

  @TargetApi(Build.VERSION_CODES.R)
  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "Crash (Java/JavaScript)"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "Crash (native code)"
    ApplicationExitInfo.REASON_ANR -> "Not responding (ANR)"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "Closed by Android: low memory"
    ApplicationExitInfo.REASON_SIGNALED -> "Killed by a signal"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "Failed to start"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Closed by Android: excessive resource use"
    else -> "Exit reason $reason"
  }

  /** Readable lines from the tombstone (native crash) or ANR trace: printable runs of text. */
  @TargetApi(Build.VERSION_CODES.R)
  private fun readableTrace(exit: ApplicationExitInfo): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && exit.reason == ApplicationExitInfo.REASON_CRASH_NATIVE) {
      return null // tombstones are only attached from Android 12
    }
    val bytes = exit.traceInputStream?.use { it.readBytes() } ?: return null
    val lines = mutableListOf<String>()
    val run = StringBuilder()
    for (b in bytes) {
      val c = b.toInt() and 0xff
      if (c in 0x20..0x7e) {
        run.append(c.toChar())
      } else {
        if (run.length >= 6) {
          lines.add(run.toString())
        }
        run.setLength(0)
      }
    }
    if (run.length >= 6) lines.add(run.toString())
    // Keep what helps: the abort message, signal, and lines naming our libraries or functions.
    val useful = lines.filter {
      it.contains("Abort", true) || it.contains("signal", true) || it.contains(".so") ||
        it.contains("::") || it.contains("Exception") || it.contains("assert", true) ||
        it.contains("com.vaultapp") || it.contains("terminat", true)
    }.distinct()
    return (if (useful.isNotEmpty()) useful else lines).take(80).joinToString("\n")
  }

  companion object {
    private const val PREFS = "crash_report"
    private const val KEY_LAST_SEEN = "last_seen_exit"
    private const val KEY_PENDING_REASON = "pending_reason"
    private const val KEY_PENDING_WHEN = "pending_when"
    private const val KEY_PENDING_DETAILS = "pending_details"
    private const val CRASH_FILE = "last-crash.txt"
    private const val MAX_CHARS = 12000

    /** Call once from Application.onCreate: records Java and fatal JavaScript errors. */
    fun install(context: Context) {
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try {
          val sw = StringWriter()
          error.printStackTrace(PrintWriter(sw))
          File(context.filesDir, CRASH_FILE).writeText(
            "Thread: ${thread.name}\n${sw.toString().take(MAX_CHARS)}",
          )
        } catch (_: Throwable) {
          // nothing more we can do while crashing
        }
        previous?.uncaughtException(thread, error)
      }
    }
  }
}
