# STORY-008: Android Packaging & Direct Device-Run Workflow

## Goal
Package the app as an Android application and make the normal developer workflow build, install, and launch directly on a connected phone without manually transferring APK files.

## Approach
- **React UI**: Continue using the existing React/Vite app for UI development
- **Android shell**: Capacitor Android project opened in Android Studio
- **Device workflow**: `npx cap run android --target <device-id>` or Android Studio Run installs and launches directly on the phone
- **Optional fast loop**: Live reload from the dev server via Capacitor without manual APK export

## Acceptance Criteria

### Capacitor Android project
- [x] Capacitor is configured for Android builds
- [x] `npx cap sync android` completes without errors
- [x] `npx cap open android` opens the Android project in Android Studio
- [x] Running from Android Studio builds, installs, and launches directly on a connected device

### Direct device install workflow
- [x] `adb devices` shows a connected Android phone after USB debugging is enabled
- [x] `npx cap run android --target <device-id>` builds, installs, and launches the app on that phone
- [x] Re-running the same command updates the existing installed app in place
- [x] No required workflow step depends on exporting an APK, copying it to the phone, or manually tapping an installer

### Optional live reload
- [x] `npm run dev -- --host 0.0.0.0` works for UI iteration
- [x] `npx cap run android --target <device-id> -l --external` is available for live-reload testing when phone and dev machine share a network

### Developer documentation
- [x] Setup docs include Android Developer Options, USB debugging, `adb devices`, and direct run commands
- [x] The docs explicitly say the normal workflow does **not** involve manual APK transfer

### Release packaging
- [x] Gradle can produce a debug APK for QA when needed
- [x] Gradle can produce a release AAB/APK for distribution later

## Notes
- Preferred dev loop: direct install/run to a real phone.
- Verified on a USB-connected Android device during native BLE bridge bring-up and hardware validation.