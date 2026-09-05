package app.genaifamily.device;

import android.Manifest;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "StudyLock", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class StudyLockPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private interface Work { void run() throws Exception; }

    private void trusted(PluginCall call, Work work) {
        getActivity().runOnUiThread(() -> {
            try {
                URI url = URI.create(getBridge().getWebView().getUrl());
                if (!"https".equals(url.getScheme()) || !"localhost".equals(url.getHost())
                        || url.getPort() != -1 || url.getUserInfo() != null) {
                    call.reject("NATIVE_ORIGIN: chỉ giao diện đóng gói được dùng quyền thiết bị."); return;
                }
                io.execute(() -> {
                    try { work.run(); }
                    catch (Exception error) {
                        String safe = DeviceApi.safeError(error);
                        DeviceDiagnostics.failure(getContext(), safe);
                        call.reject(safe);
                    }
                });
            } catch (RuntimeException error) { call.reject("NATIVE_BRIDGE: giao diện chưa sẵn sàng."); }
        });
    }
    private SharedPreferences binding() {
        return getContext().getSharedPreferences("device_preferences", Context.MODE_PRIVATE);
    }
    private JSObject status() {
        SharedPreferences diagnostics = getContext().getSharedPreferences("device_diagnostics", Context.MODE_PRIVATE);
        long heartbeat = diagnostics.getLong("heartbeat", 0);
        long age = System.currentTimeMillis() - heartbeat;
        boolean paired = SecureStore.readToken(getContext()) != null;
        JSObject result = new JSObject();
        result.put("paired", paired);
        result.put("familyId", paired ? binding().getString("bound_family", null) : JSONObject.NULL);
        result.put("childProfileId", paired ? binding().getString("bound_child", null) : JSONObject.NULL);
        result.put("accessibilityEnabled", DevicePermissions.isAccessibilityEnabled(getContext()));
        result.put("selectedAppCount", DevicePreferences.blockedPackages(getContext()).size());
        result.put("lockActive", DevicePreferences.isLockActive(getContext()));
        result.put("lastHeartbeat", heartbeat);
        result.put("serverVerified", paired && heartbeat > 0 && age >= 0
                && age <= diagnostics.getInt("timeout_seconds", 180) * 1000L);
        result.put("protectionLevel", "selected_apps");
        result.put("error", diagnostics.getString("error", null));
        result.put("version", BuildConfig.VERSION_NAME);
        return result;
    }
    @PluginMethod public void getStatus(PluginCall call) { trusted(call, () -> call.resolve(status())); }

    @PluginMethod public void provisionChild(PluginCall call) {
        trusted(call, () -> {
            String family = call.getString("familyId");
            String child = call.getString("childProfileId");
            String parentToken = call.getString("accessToken");
            ParentDeviceApi.requireUuid(family); ParentDeviceApi.requireUuid(child);
            String existing = SecureStore.readToken(getContext());
            if (existing != null) {
                JSONObject row = ParentDeviceApi.verifyDeviceOwner(parentToken, DevicePreferences.deviceId(getContext()));
                if (!family.equals(row.optString("family_id")) || !child.equals(row.optString("child_profile_id"))) {
                    throw new DeviceApi.ApiException(409, "PROFILE_MISMATCH: máy đang gắn với hồ sơ khác. Ba/mẹ phải thu hồi thiết bị cũ trước.", false);
                }
            } else {
                JSONObject pairing = ParentDeviceApi.createPairing(parentToken, family, child);
                JSONObject paired = DeviceApi.pair(pairing.getString("pairing_code"));
                if (!pairing.getString("device_id").equals(paired.getString("device_id"))) {
                    throw new DeviceApi.ApiException(0, "PAIRING: phản hồi không khớp thiết bị vừa tạo.", false);
                }
                // Device token and pairing code NEVER cross back into JavaScript.
                SecureStore.saveToken(getContext(), paired.getString("device_token"));
                DevicePreferences.saveDeviceId(getContext(), paired.getString("device_id"));
                DeviceDiagnostics.paired(getContext());
            }
            if (!binding().edit().putString("bound_family", family).putString("bound_child", child).commit()) {
                throw new DeviceApi.ApiException(0, "STORAGE: không lưu được hồ sơ thiết bị.", false);
            }
            getActivity().runOnUiThread(() -> DeviceCommandService.start(getContext()));
            call.resolve(status());
        });
    }
    @PluginMethod public void openAppPicker(PluginCall call) {
        trusted(call, () -> {
            ParentDeviceApi.verifyDeviceOwner(call.getString("accessToken"), DevicePreferences.deviceId(getContext()));
            getActivity().runOnUiThread(() -> {
                NativeSetupPermit.grant();
                getActivity().startActivity(new Intent(getContext(), AppPickerActivity.class));
                call.resolve();
            });
        });
    }
    @PluginMethod public void openAccessibilitySettings(PluginCall call) {
        trusted(call, () -> getActivity().runOnUiThread(() -> {
            getActivity().startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            call.resolve();
        }));
    }
    @PluginMethod public void requestNotifications(PluginCall call) {
        trusted(call, () -> getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
                call.resolve();
            } else { requestPermissionForAlias("notifications", call, "notificationResult"); }
        }));
    }
    @PermissionCallback private void notificationResult(PluginCall call) { call.resolve(); }
    @PluginMethod public void diagnose(PluginCall call) {
        trusted(call, () -> { JSObject result = new JSObject(); result.put("message", DeviceApi.diagnose()); call.resolve(result); });
    }
    @Override protected void handleOnDestroy() {
        // Finish a pending pairing so its token is not lost after a consumed one-time code.
        io.shutdown();
    }
}
