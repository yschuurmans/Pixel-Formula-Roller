# STORY-008: Android Packaging & Direct Device-Run Workflow

## Goal
Package the app as an Android application and make the normal developer workflow build, install, and launch directly on a connected phone without manually transferring APK files.

## Approach
- **React UI**: Continue using the existing React/Vite app for UI development
- **Android shell**: Capacitor Android project opened in Android Studio
- **Device workflow**: `npx cap run android --target <device-id>` or Android Studio Run button installs and launches directly on the phone
- **Optional fast loop**: Live reload from the dev server via Capacitor without manual APK export

## Acceptance Criteria

### Capacitor Android project
- [ ] Capacitor is configured for Android builds
- [ ] `npx cap sync android` completes without errors
- [ ] `npx cap open android` opens the Android project in Android Studio
- [ ] Running from Android Studio builds, installs, and launches directly on a connected device

### Direct device install workflow
- [ ] `adb devices` shows a connected Android phone after USB debugging is enabled
- [ ] `npx cap run android --target <device-id>` builds, installs, and launches the app on that phone
- [ ] Re-running the same command updates the existing installed app in place
- [ ] No required workflow step depends on exporting an APK, copying it to the phone, or manually tapping an installer

### Optional live reload
- [ ] `npm run dev -- --host 0.0.0.0` works for UI iteration
- [ ] `npx cap run android --target <device-id> -l --external` launches the app against the dev server when phone and dev machine share a network

### Developer documentation
- [ ] README or setup docs include:
  - enabling Android Developer Options
  - enabling USB debugging
  - verifying the phone with `adb devices`
  - direct run command via `npx cap run android --target <device-id>`
  - optional Android Studio Run workflow
  - optional wireless debugging workflow using `adb pair` / `adb connect`
- [ ] The docs explicitly say the normal workflow does **not** involve manual APK transfer

### Release packaging
- [ ] Android Studio / Gradle can produce a debug APK for QA when needed
- [ ] Android Studio / Gradle can produce a release AAB/APK for distribution later

## Notes
- The preferred dev loop is direct install/run to a phone, not emulator-only and not manual APK sideload.
- Depends on STORY-001.
