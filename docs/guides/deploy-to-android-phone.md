# Deploy To An Android Phone

This guide covers the normal Windows workflow for building, installing, launching, updating, and debugging Pixel Formula Roller directly on a USB-connected Android phone.

The intended loop is:

1. Build on the development machine.
2. Install directly to the phone over ADB.
3. Re-run the same command to update the existing app in place.

Do not export an APK manually, copy it to the phone, and tap an installer unless you are explicitly testing a release artifact.

## Requirements

- Node.js 20+
- npm 10+
- Android Studio
- Android SDK installed locally
- Android SDK Platform Tools (`adb`)
- JDK 21
- A USB data cable
- An Android phone with Developer Options enabled

## Verified Local Android Versions

The current repo is configured with:

- `minSdkVersion = 24`
- `compileSdkVersion = 36`
- `targetSdkVersion = 36`

These values come from [android/variables.gradle](d:/Git/Pixel-Formula-Roller/android/variables.gradle).

## One-Time Phone Setup

On the phone:

1. Open Android Settings.
2. Enable Developer Options.
3. Enable USB debugging.
4. Connect the phone with a USB data cable.
5. Accept the `Allow USB debugging` trust prompt when it appears.
6. Keep the phone unlocked during the first connection.

## One-Time Machine Setup

Install and verify these tools:

1. Android Studio
2. Android SDK
3. Platform Tools so `adb` is available
4. JDK 21

If `adb` is not already on `PATH`, use the full path or add Platform Tools to `PATH`.

If Java is not already configured for Android builds, set `JAVA_HOME` to a JDK 21 installation.

## PowerShell Environment Example

The repo was verified with a Windows PowerShell setup like this:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:ANDROID_HOME='C:\AndroidSdk'
$env:ANDROID_SDK_ROOT='C:\AndroidSdk'
```

If your tools are already configured globally, you do not need to set these variables each time.

## Verify The Phone Connection

Run:

```powershell
adb devices -l
```

Expected result:

- The phone appears in the list.
- The state is `device`.

If it shows `unauthorized`, unlock the phone and accept the USB debugging prompt.

## Standard Deploy Workflow

From the repo root:

```powershell
npm install
npm run build
npx cap sync android
adb devices -l
npx cap run android --target <device-id>
```

What this does:

- builds the web assets
- syncs them into the Capacitor Android project
- builds the Android app
- installs it directly on the connected phone
- launches it immediately

Re-running the same command updates the already-installed app in place.

## Fast Fallback Workflow

If `npx cap run android` is not the quickest route for a specific debugging cycle, use Gradle directly from the Android folder:

```powershell
Set-Location 'D:\Git\Pixel-Formula-Roller\android'
.\gradlew.bat app:installDebug
```

This builds and installs the debug APK on the connected phone.

Use this when:

- the Capacitor project is already synced
- you are iterating on native Android code
- you want the most direct reinstall path

## Android Studio Workflow

From the repo root:

```powershell
npx cap open android
```

Then in Android Studio:

1. Wait for Gradle sync to finish.
2. Select the connected physical device.
3. Press Run.

This is a valid normal workflow for development.

## Optional Live Reload Workflow

For UI-focused iteration:

```powershell
npm run dev -- --host 0.0.0.0
npx cap run android --target <device-id> -l --external
```

Requirements:

- phone and dev machine are on the same network
- the dev server is reachable from the phone
- native BLE still runs through the Android shell

Use this for React UI work. For native Android BLE changes, prefer a full reinstall.

## Useful Debug Commands

List devices:

```powershell
adb devices -l
```

Clear logcat:

```powershell
adb logcat -c
```

Watch the native BLE plugin logs:

```powershell
adb logcat -s PixelsBle *:S
```

Check that the app is installed:

```powershell
adb shell pm list packages | findstr pixelformularoller
```

## Common Problems

### `adb` shows no devices

Check:

1. The phone is unlocked.
2. The cable supports data, not only charging.
3. USB debugging is enabled.
4. The trust prompt was accepted.
5. `adb devices -l` shows `device`, not `unauthorized`.

If needed:

```powershell
adb kill-server
adb start-server
adb devices -l
```

### Android build fails because of Java

Use JDK 21, not Java 25.

Example:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

### Android build fails because the SDK is missing

Set:

```powershell
$env:ANDROID_HOME='C:\AndroidSdk'
$env:ANDROID_SDK_ROOT='C:\AndroidSdk'
```

Then retry the build.

### The app installs but does not reflect the latest web changes

Run the full sync path again:

```powershell
npm run build
npx cap sync android
npx cap run android --target <device-id>
```

### Native BLE changes are not taking effect

Native Android changes require a rebuilt Android app. Do not rely on Vite live reload for plugin changes.

Use:

```powershell
Set-Location 'D:\Git\Pixel-Formula-Roller\android'
.\gradlew.bat app:installDebug
```

### You need a clean log for one test run

```powershell
adb logcat -c
adb logcat -s PixelsBle *:S
```

The first command clears the buffer and exits. The second starts the live stream.

## Recommended Daily Loop

For normal repo work:

```powershell
npm run build
npx cap sync android
adb devices -l
npx cap run android --target <device-id>
```

For native BLE iteration:

```powershell
Set-Location 'D:\Git\Pixel-Formula-Roller\android'
.\gradlew.bat app:installDebug
```

For BLE debugging:

```powershell
adb logcat -c
adb logcat -s PixelsBle *:S
```

## Repo Surfaces Involved

- [package.json](d:/Git/Pixel-Formula-Roller/package.json) for build and Capacitor scripts
- [android/variables.gradle](d:/Git/Pixel-Formula-Roller/android/variables.gradle) for SDK targets
- [android/app/src/main/java/com/youri/pixelformularoller/PixelsBlePlugin.java](d:/Git/Pixel-Formula-Roller/android/app/src/main/java/com/youri/pixelformularoller/PixelsBlePlugin.java) for native BLE logging and bridge behavior
- [README.md](d:/Git/Pixel-Formula-Roller/README.md) for the short setup overview
