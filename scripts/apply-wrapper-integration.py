#!/usr/bin/env python3
"""One-time, checked integration; removed by the branch bootstrap after generation."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
def edit(path, before, after, count=1):
    file = root / path
    text = file.read_text()
    assert text.count(before) == count, f'Unexpected source for {path}: {before[:60]}'
    file.write_text(text.replace(before, after))

p = root / 'package.json'
pkg = json.loads(p.read_text())
pkg['dependencies'].update({'@capacitor/core': '8.5.0', '@capacitor/android': '8.5.0'})
pkg['devDependencies']['@capacitor/cli'] = '8.5.0'
pkg['scripts'].update({'android:sync': 'node scripts/build-native.mjs', 'check:wrapper': 'node scripts/check-wrapper.mjs'})
p.write_text(json.dumps(pkg, indent=2) + '\n')
edit('.gitignore', 'dist/\n', 'dist/\ndist-native/\nandroid-delivery/\nwrapper-test-output/\n')
with (root / 'mobile/android/.gitignore').open('a') as out:
    out.write('\n/app/src/main/assets/public/\n/app/src/main/assets/capacitor.config.json\n/app/src/main/assets/capacitor.plugins.json\n')
edit('eslint.config.js', "'dist/**', 'dev-dist/**'", "'dist/**', 'dist-native/**', 'mobile/android/app/src/main/assets/**', 'dev-dist/**'")
edit('vite.config.ts', 'defineConfig(() => {', 'defineConfig(({ mode }) => {')
edit('vite.config.ts', '      VitePWA({', "      ...(mode === 'native' ? [] : [VitePWA({")
edit('vite.config.ts', '      })\n    ],', '      })])\n    ],')
edit('vite.config.ts', '    build: {', "    build: {\n      outDir: mode === 'native' ? 'dist-native' : 'dist',")
edit('vite.config.ts', "'e2e/**', 'node_modules/**', 'dist/**'", "'e2e/**', 'node_modules/**', 'dist/**', 'dist-native/**', 'mobile/**'")
edit('src/main.tsx', "import './style.css';", "import './style.css';\nimport './native/native.css';")
edit('src/features/parent/ParentDashboard.tsx', 'onSaveSchedule: (items: ScheduleSetupItem[])', 'onSaveSchedule: (items: ScheduleSetupItem[], expectedVersion: string)')
edit('src/hooks/useFamilyData.test.tsx', 'state.saveSchedule([])', "state.saveSchedule([], state.data?.scheduleVersion ?? '')", 3)

app = 'src/App.tsx'
edit(app, "import { AuthScreen }", "import { isNativeAndroid } from './native/studyLock';\nimport { NativeSetupScreen } from './native/NativeSetupScreen';\nimport { NativeDevicePanel } from './native/NativeDevicePanel';\nimport { AuthScreen }")
edit(app, '  const [childPickerOpen, setChildPickerOpen] = useState(false);', '  const [childPickerOpen, setChildPickerOpen] = useState(false);\n  const [nativeSetupContext, setNativeSetupContext] = useState<FamilyContext | null>(null);')
edit(app, '  const handleSwitchToChild = async () => {\n    if (!activeContext) return;', "  const handleSwitchToChild = async () => {\n    if (!activeContext) return;\n    if (isNativeAndroid()) { setNativeSetupContext(activeContext); return; }")
edit(app, "    if (!nextContext) throw new Error('Hồ sơ của bé không hợp lệ.');\n    setModeError(null);", "    if (!nextContext) throw new Error('Hồ sơ của bé không hợp lệ.');\n    if (isNativeAndroid()) { setNativeSetupContext(nextContext); return; }\n    setModeError(null);")
edit(app, '  const handleParentAccessRequested = () => {', '''  const handleNativeSetupCompleted = async () => {
    const selected = nativeSetupContext;
    if (!selected || selected.parentProfileId !== authUserId) throw new Error('Hồ sơ thiết bị không hợp lệ.');
    const serverMode = await completeAppOnboarding('child', selected);
    if (serverMode.appMode !== 'child' || serverMode.familyId !== selected.familyId
        || serverMode.childProfileId !== selected.childProfileId) {
      throw new Error('Máy chủ chưa xác nhận đúng hồ sơ trẻ.');
    }
    handleChildSelected(selected);
    persistDeviceSetup(authUserId, 'child');
    persistMode('child');
    setRole('child');
    setEntryModeInitialStep('child');
    setOnboardingRequired(false);
    setNativeSetupContext(null);
  };

  const handleParentAccessRequested = () => {''')
edit(app, '        {content}\n      </div>', '''        {isNativeAndroid() && activeContext && !onboardingRequired && !nativeSetupContext ? (
          <NativeDevicePanel context={activeContext} role={role}
            onSetup={role === 'child' ? handleParentAccessRequested : () => setNativeSetupContext(activeContext)} />
        ) : null}
        {content}
      </div>''')
edit(app, '  if (onboardingRequired) {\n    return preserveVerifiedScreen(', '''  if (nativeSetupContext && isNativeAndroid()) {
    return preserveVerifiedScreen(<NativeSetupScreen
      context={nativeSetupContext}
      childName={accountChildren.children.find(child => child.child_profile_id === nativeSetupContext.childProfileId)?.child_name ?? 'con'}
      onComplete={handleNativeSetupCompleted}
      onBack={() => setNativeSetupContext(null)}
    />);
  }

  if (onboardingRequired) {
    return preserveVerifiedScreen(''')

edit('mobile/android/settings.gradle.kts', 'RepositoriesMode.FAIL_ON_PROJECT_REPOS', 'RepositoriesMode.PREFER_SETTINGS')
with (root / 'mobile/android/settings.gradle.kts').open('a') as out:
    out.write('\ninclude(":capacitor-android")\nproject(":capacitor-android").projectDir = file("../../node_modules/@capacitor/android/capacitor")\n')
edit('mobile/android/app/build.gradle.kts', 'JavaVersion.VERSION_17', 'JavaVersion.VERSION_21', 2)
edit('mobile/android/app/build.gradle.kts', 'implementation("androidx.activity:activity:1.10.1")', 'implementation(project(":capacitor-android"))\n    implementation("androidx.activity:activity:1.11.0")')
edit('mobile/android/app/src/main/res/values/themes.xml', 'android:style/Theme.Material.Light.NoActionBar', 'Theme.AppCompat.Light.NoActionBar')
edit('mobile/android/app/src/main/AndroidManifest.xml', '<activity android:name=".MainActivity" android:exported="true">', '''<provider android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
        </provider>
        <activity android:name=".MainActivity" android:exported="true"
            android:launchMode="singleTask" android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density">''')
edit('mobile/android/app/src/main/java/app/genaifamily/device/AppPickerActivity.java', '        super.onCreate(savedInstanceState);', '        super.onCreate(savedInstanceState);\n        if (!NativeSetupPermit.consume()) { finish(); return; }')
edit('mobile/android/app/src/main/java/app/genaifamily/device/DevicePreferences.java', '.remove(DEVICE_ID).putBoolean(LOCKED, false)', '.remove(DEVICE_ID).remove("bound_family").remove("bound_child").putBoolean(LOCKED, false)')
# Token storage must finish before a one-time pairing reports success.
edit('mobile/android/app/src/main/java/app/genaifamily/device/SecureStore.java', '''        preferences(context).edit()
                .putString(TOKEN_KEY, Base64.encodeToString(value.array(), Base64.NO_WRAP))
                .apply();''', '''        if (!preferences(context).edit()
                .putString(TOKEN_KEY, Base64.encodeToString(value.array(), Base64.NO_WRAP))
                .commit()) throw new java.io.IOException("Secure token persistence failed");''')

workflow = '.github/workflows/android-apk.yml'
edit(workflow, 'branches: [main]', 'branches: [main, feat/capacitor-unified-child-app]')
edit(workflow, "      - 'mobile/android/**'", "      - 'mobile/android/**'\n      - 'src/**'\n      - 'public/**'\n      - 'assets/**'\n      - 'index.html'\n      - 'package*.json'\n      - 'vite.config.ts'\n      - 'capacitor.config.ts'\n      - 'scripts/build-native.mjs'\n      - 'scripts/check-wrapper.mjs'", 2)
edit(workflow, '100 + GITHUB_RUN_NUMBER', '1000 + GITHUB_RUN_NUMBER')
edit(workflow, 'GENAI_VERSION_NAME=0.2.', 'GENAI_VERSION_NAME=0.3.')
edit(workflow, '      - name: Set up Java 17', '''      - name: Set up Node 22
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Build bundled web interface and validate bridge
        run: |
          npm ci
          npm run typecheck
          npm test
          npm run check:wrapper
          npm run android:sync
          node scripts/check-wrapper.mjs --assets
      - name: Set up Java 21''')
edit(workflow, "java-version: '17'", "java-version: '21'")
edit(workflow, "gradle-version: '8.13'", "gradle-version: '8.14.3'")
edit(workflow, 'cp docs/ANDROID_APK.md android-delivery/INSTALL.md', 'cp docs/CAPACITOR_WRAPPER.md android-delivery/INSTALL.md')
edit(workflow, 'Open Chẩn đoán kết nối → Kiểm tra API before entering a NEW Android pairing code.', 'A parent signs in on the child phone, selects Child, then completes the integrated device setup.')

with (root / 'docs/ANDROID_APK.md').open('a') as out:
    out.write('\n## Capacitor wrapper update\n\nThe current APK now bundles the web UI and native module into one app.\nUse docs/CAPACITOR_WRAPPER.md for setup/build instructions; the historical\nstandalone companion/code-entry steps above apply only to version 0.2.x.\n')
with (root / 'mobile/README.md').open('a') as out:
    out.write('\n## Current Android wrapper\n\nVersion 0.3.x uses Capacitor 8.5.0, Node 22, JDK 21 and Gradle 8.14.3.\nSee ../docs/CAPACITOR_WRAPPER.md. Android 0.2.x standalone setup above is historical;\niOS remains the existing separate native scaffold and is not converted in this increment.\n')
print('Wrapper integration source prepared; npm lockfile must be generated before committing.')
