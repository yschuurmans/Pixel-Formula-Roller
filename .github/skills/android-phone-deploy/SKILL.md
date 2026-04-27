---
name: android-phone-deploy
description: 'Deploy Pixel Formula Roller to a connected Android phone. Use for USB debugging setup, adb device checks, npx cap run android, gradlew app:installDebug, logcat, Android SDK/JDK environment setup, and direct on-device update workflows.'
argument-hint: 'Describe what you need, for example: deploy to phone, fix adb device detection, install debug build, or capture PixelsBle logcat'
user-invocable: true
---

# Android Phone Deploy

Use this skill when working on Pixel Formula Roller deployment or debugging on a physical Android device.

## Use When

- You want to deploy the app to a USB-connected phone
- `adb devices` is empty or shows `unauthorized`
- You need the exact PowerShell commands for `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`
- You want to run `npx cap run android --target <device-id>`
- You want to use `android/.\gradlew.bat app:installDebug`
- You need clean `logcat` steps for the native `PixelsBle` bridge

## Procedure

1. Verify the machine environment with the steps in [Windows deploy reference](./references/windows-deploy.md).
2. Confirm the phone is visible with `adb devices -l`.
3. For a manual repo-local entry point, run `scripts/android-phone-deploy.ps1` from VS Code tasks or directly in PowerShell.
4. Choose the deploy path:
   - `npx cap run android --target <device-id>` for full build/install/launch
   - `android/.\gradlew.bat app:installDebug` for faster native iteration
5. If troubleshooting BLE, clear the buffer and run filtered logcat:
   - `adb logcat -c`
   - `adb logcat -s PixelsBle *:S`
6. If the user needs the full written guide, point them to [the repo deployment guide](../../../docs/guides/deploy-to-android-phone.md).

## Manual VS Code Entry Points

- Task: `Android: Check connected phone`
- Task: `Android: Full deploy to phone`
- Task: `Android: Install debug to phone`
- Task: `Android: PixelsBle logcat`
- Script: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\android-phone-deploy.ps1 -Mode <check-device|full-deploy|install-debug|logcat>`

## Outcome

The app should build, install, and launch directly on the phone without manual APK transfer, and native BLE diagnostics should be available through `logcat`.
