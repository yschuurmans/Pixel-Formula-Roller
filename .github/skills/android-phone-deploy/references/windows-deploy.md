# Windows Android Phone Deploy Reference

Use this reference for the concrete Windows deployment steps that were verified in this repo.

## Environment

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:ANDROID_HOME='C:\AndroidSdk'
$env:ANDROID_SDK_ROOT='C:\AndroidSdk'
```

## Check The Device

```powershell
adb devices -l
```

## Full Deploy

From the repo root:

```powershell
npm run build
npx cap sync android
npx cap run android --target <device-id>
```

## Fast Native Reinstall

```powershell
Set-Location 'D:\Git\Pixel-Formula-Roller\android'
.\gradlew.bat app:installDebug
```

## BLE Debugging

```powershell
adb logcat -c
adb logcat -s PixelsBle *:S
```

## Install Check

```powershell
adb shell pm list packages | findstr pixelformularoller
```

## Full Guide

See [docs/guides/deploy-to-android-phone.md](../../../../docs/guides/deploy-to-android-phone.md) for prerequisites, troubleshooting, Android Studio workflow, and live reload notes.