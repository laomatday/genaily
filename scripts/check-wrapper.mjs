import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const config = read('capacitor.config.ts');
assert.ok(!/\burl\s*:/.test(config), 'Do not ship server.url');
assert.match(config, /webDir: 'dist-native'/);
assert.match(config, /allowNavigation: \[\]/);
const plugin = read('mobile/android/app/src/main/java/app/genaifamily/device/StudyLockPlugin.java');
const methods = [...plugin.matchAll(/@PluginMethod public void (\w+)/g)].map(match => match[1]);
assert.deepEqual(methods.sort(), ['diagnose', 'getStatus', 'openAccessibilitySettings', 'openAppPicker', 'provisionChild', 'requestNotifications'].sort());
assert.ok(!plugin.includes('result.put("device_token"'), 'Device tokens must stay native');
assert.match(plugin, /ParentDeviceApi\.verifyDeviceOwner/);
assert.match(read('mobile/android/app/src/main/java/app/genaifamily/device/AppPickerActivity.java'), /NativeSetupPermit\.consume/);
assert.match(read('mobile/android/app/src/main/java/app/genaifamily/device/MainActivity.java'), /extends BridgeActivity/);
const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.match(manifest, /android:configChanges=/);
if (process.argv.includes('--assets')) {
  assert.ok(existsSync('mobile/android/app/src/main/assets/public/index.html'));
  const html = read('mobile/android/app/src/main/assets/public/index.html');
  assert.ok(!/registerSW|serviceWorker\.register/.test(html));
  const nativeConfig = JSON.parse(read('mobile/android/app/src/main/assets/capacitor.config.json'));
  assert.equal(nativeConfig.server.url, undefined);
  assert.equal(nativeConfig.server.hostname, 'localhost');
  assert.equal(nativeConfig.server.androidScheme, 'https');
}
console.log('PASS: wrapper source and native bridge boundaries' + (process.argv.includes('--assets') ? '; packaged offline UI' : ''));
