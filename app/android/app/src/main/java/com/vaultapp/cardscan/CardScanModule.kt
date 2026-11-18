package com.vaultapp.cardscan

import android.app.Activity
import android.content.Intent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * JS: CardScan.scan(prompt) → null (cancelled) or { number?, lines } from [CardScanActivity].
 * Rejects with E_PERMISSION when the camera is refused, E_CAMERA when it can't start.
 */
class CardScanModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pending: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "CardScan"

  @ReactMethod
  fun scan(prompt: String?, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null || pending != null) {
      promise.reject("E_BUSY", "The scanner is not available right now.")
      return
    }
    pending = promise
    try {
      val intent = Intent(activity, CardScanActivity::class.java)
      if (prompt != null) intent.putExtra(CardScanActivity.EXTRA_PROMPT, prompt)
      activity.startActivityForResult(intent, REQ_SCAN)
    } catch (e: Exception) {
      pending = null
      promise.reject("E_CAMERA", e.message ?: "Could not open the camera.", e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_SCAN) return
    val promise = pending ?: return
    pending = null
    if (resultCode == Activity.RESULT_OK && data != null) {
      val map = Arguments.createMap()
      data.getStringExtra(CardScanActivity.EXTRA_NUMBER)?.let { map.putString("number", it) }
      val lines = Arguments.createArray()
      data.getStringArrayListExtra(CardScanActivity.EXTRA_LINES)?.forEach { lines.pushString(it) }
      map.putArray("lines", lines)
      promise.resolve(map)
      return
    }
    when (data?.getStringExtra(CardScanActivity.EXTRA_ERROR)) {
      CardScanActivity.ERROR_PERMISSION ->
        promise.reject("E_PERMISSION", "Vault needs the camera to scan a card. Allow it in Android settings, or type the details.")
      CardScanActivity.ERROR_CAMERA -> promise.reject("E_CAMERA", "The camera couldn't start. Type the details instead.")
      else -> promise.resolve(null)
    }
  }

  override fun onNewIntent(intent: Intent) {}

  companion object {
    private const val REQ_SCAN = 0x5C1
  }
}

class CardScanPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(CardScanModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
