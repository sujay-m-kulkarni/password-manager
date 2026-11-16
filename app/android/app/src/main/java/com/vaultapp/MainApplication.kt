package com.vaultapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.vaultapp.crashreport.CrashReportModule
import com.vaultapp.crashreport.CrashReportPackage
import com.vaultapp.files.VaultFilesPackage
import com.vaultapp.secureclipboard.SecureClipboardPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(SecureClipboardPackage())
          add(CrashReportPackage())
          add(VaultFilesPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    CrashReportModule.install(this)
    loadReactNative(this)
  }
}
