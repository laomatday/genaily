# genaily Android wrapper — pilot integration

## What ships

The existing React interface is bundled into one Android app using Capacitor 8.5.0.
Parents can continue using the PWA. On the child's Android device there is ONE
launcher, with the web learning interface and native Study Lock in the same APK.
The old standalone companion screen is replaced, not installed as another app.

This increment integrates the existing selected-application protection. It does
NOT implement whole-device Family Link-equivalent supervision, Device Owner,
uninstall prevention, offline scheduled enforcement, or an iOS wrapper. Do not
market this pilot as full-phone locking. The existing heartbeat safety timeout
still releases a lock when the device cannot confirm server state; this remains
a gap against the final product requirement of waiting for parent approval.

## Parent-assisted setup

1. Install the wrapper pilot on the child's Android device. A parent signs in
   once with the existing account, then selects Child and the correct profile.
2. The integrated setup screen creates and consumes an Android pairing code
   automatically. No API URL, key, 16-character code or second app is needed.
3. Read and accept the Accessibility disclosure; enable genaily Study Lock.
4. Choose applications to restrict, keeping learning and emergency contact apps.
5. Finish setup. The server locks this login session into child mode.
6. During normal use the child sees the existing schedule, learning session,
   submission and approval interface. Study Lock status is expandable in-app.

This increment uses the existing parent-assisted auth/session model, NOT a new
QR-only child login. The parent must type the password; do not share it with the
child. A future QR-only flow requires a separately scoped child session API.
Opening settings again from child mode requires parent password verification.
Native code independently verifies parent mode and device ownership on server.
Another child/account cannot silently rebind an already active device.

Pilot installs use app.genaifamily.device.pilot and a debug signature. Reinstall
may be necessary if the previous pilot uses a different signing certificate;
this loses local pairing/settings. Revoke the old device and disable its
Accessibility service first. Keep only one controlling app enabled per device.

## Security boundary

- Only packaged https://localhost pages may call the StudyLock plugin.
- No server.url, remote navigation allowlist, cleartext HTTP or generic HTTP plugin.
- Device tokens stay in Android Keystore. Parent access tokens are transient
  request arguments; never persisted in native logs, preferences or artifacts.
- The bridge has no unlock, setLock, clearPairing, arbitrary URL or setPolicy method.
- App-picker access requires server authorization plus a 30-second single-use
  native permit; the activity is not exported.
- Child completion does not call native unlock; the existing backend approval
  workflow remains authoritative, with the existing safety-timeout exceptions.
- Web/PWA cannot claim native capabilities: native onboarding renders only when
  Capacitor reports the Android platform.

## Build and test

Use Node 22, JDK 21, Gradle 8.14.3, Android SDK 36. Capacitor versions and npm
lockfile are pinned. No globally installed Capacitor CLI is required.

```sh
npm ci
npm run typecheck
npm test
npm run check:wrapper
npm run android:sync
cd mobile/android
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

android:sync builds dist-native using the same checked production config as
native code, disables the PWA service worker, then copies the bundled UI.
PWA builds continue using npm run build and retain their service worker.
Changes to web source also trigger Android APK CI now. CI validates bundled
assets, bridge allowlist, unit tests, lint, signature and APK SHA-256.

Release requires the same four signing secrets as docs/ANDROID_APK.md. Do not
substitute a debug key for release, and do not upload this pilot to the stores.

## Acceptance still required on physical devices

Test install → parent setup → child mode → parent web lock → blocked app shield
→ submit → waiting for parent → approve → device confirmation. Also test app
switching, process death, restart, notification denial, permission revocation,
network loss, sibling mismatch, evidence upload, and parent reauthentication.
An APK build or an emulator launch is not proof of anti-bypass protection.
