package app.genaifamily.device;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/** Only parent-scoped setup endpoints. Credentials live in memory for this request, not preferences. */
final class ParentDeviceApi {
    private ParentDeviceApi() {}
    static void requireUuid(String value) {
        if (value == null || !value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            throw new IllegalArgumentException("INVALID_PROFILE");
        }
    }
    static void requireParent(String accessToken) throws Exception {
        Object response = request("/rest/v1/rpc/get_app_mode", new JSONObject(), accessToken);
        JSONArray modes = response instanceof JSONArray ? (JSONArray) response : new JSONArray();
        if (modes.length() != 1 || !"parent".equals(modes.getJSONObject(0).optString("app_mode"))) {
            throw new DeviceApi.ApiException(403, "PARENT_REQUIRED: cần ba/mẹ xác nhận lại mật khẩu trước khi thiết lập.", false);
        }
    }
    static JSONObject createPairing(String accessToken, String familyId, String childId) throws Exception {
        requireUuid(familyId); requireUuid(childId); requireParent(accessToken);
        JSONObject body = new JSONObject().put("p_family_id", familyId).put("p_child_profile_id", childId)
                .put("p_display_name", "genaily · Android").put("p_platform", "android").put("p_policy", JSONObject.NULL);
        Object result = request("/rest/v1/rpc/create_device_pairing", body, accessToken);
        if (!(result instanceof JSONArray) || ((JSONArray) result).length() != 1) {
            throw new DeviceApi.ApiException(0, "PAIRING: máy chủ chưa tạo được mã ghép.", false);
        }
        return ((JSONArray) result).getJSONObject(0);
    }
    static JSONObject verifyDeviceOwner(String accessToken, String deviceId) throws Exception {
        requireUuid(deviceId); requireParent(accessToken);
        Object result = request("/rest/v1/managed_devices?id=eq." + deviceId
                + "&select=id,family_id,child_profile_id,status", null, accessToken);
        if (!(result instanceof JSONArray) || ((JSONArray) result).length() != 1) {
            throw new DeviceApi.ApiException(403, "PARENT_REQUIRED: tài khoản không quản lý thiết bị này.", false);
        }
        JSONObject row = ((JSONArray) result).getJSONObject(0);
        if (!"active".equals(row.optString("status"))) {
            throw new DeviceApi.ApiException(409, "DEVICE_REVOKED: thiết bị đã bị thu hồi; mở lại ứng dụng để đồng bộ.", false);
        }
        return row;
    }
    private static Object request(String path, JSONObject body, String token) throws Exception {
        if (token == null || !token.matches("[A-Za-z0-9_.-]{40,8192}")) {
            throw new DeviceApi.ApiException(401, "PARENT_REQUIRED: phiên ba/mẹ không hợp lệ.", false);
        }
        String configError = DeviceApi.configurationError();
        if (configError != null) throw new DeviceApi.ApiException(0, configError, false);
        HttpURLConnection connection = (HttpURLConnection) URI.create("https://"
                + BuildConfig.SUPABASE_PROJECT_REF + ".supabase.co" + path).toURL().openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
        connection.setRequestMethod(body == null ? "GET" : "POST");
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int code = connection.getResponseCode();
            // Never surface raw server response bodies or parent credentials to diagnostics.
            if (code < 200 || code >= 300) {
                throw new DeviceApi.ApiException(code, code == 401 || code == 403
                        ? "PARENT_REQUIRED: ba/mẹ cần đăng nhập lại hoặc kiểm tra quyền quản lý."
                        : "SETUP_API: máy chủ chưa hoàn tất thiết lập (HTTP " + code + ").", false);
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 65536) throw new IllegalStateException("RESPONSE_TOO_LARGE");
                    output.write(buffer, 0, count);
                }
                return new JSONTokener(output.toString(StandardCharsets.UTF_8.name())).nextValue();
            }
        } finally { connection.disconnect(); }
    }
}
