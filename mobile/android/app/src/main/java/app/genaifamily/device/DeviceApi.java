package app.genaifamily.device;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

final class DeviceApi {
    private static final int TIMEOUT_MS = 15_000;

    private DeviceApi() {}

    static JSONObject pair(String pairingCode) throws Exception {
        JSONObject body = new JSONObject()
                .put("action", "pair")
                .put("pairing_code", pairingCode)
                .put("platform", "android");
        return request(body, null);
    }

    static JSONObject poll(String token) throws Exception {
        return request(new JSONObject().put("action", "poll"), token);
    }

    static void acknowledge(String token, String commandId, boolean applied, String error) throws Exception {
        JSONObject body = new JSONObject()
                .put("action", "ack")
                .put("command_id", commandId)
                .put("status", applied ? "acknowledged" : "failed");
        if (error != null && !error.trim().isEmpty()) body.put("error_message", error);
        request(body, token);
    }

    private static JSONObject request(JSONObject body, String token) throws Exception {
        if (BuildConfig.DEVICE_AGENT_URL.trim().isEmpty() || BuildConfig.SUPABASE_PUBLISHABLE_KEY.trim().isEmpty()) {
            throw new IllegalStateException("Companion app chưa có cấu hình Supabase trong local.properties.");
        }
        URI uri = URI.create(BuildConfig.DEVICE_AGENT_URL);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalStateException("Device agent bắt buộc sử dụng HTTPS.");
        }
        HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY);
        if (token != null) connection.setRequestProperty("Authorization", "Device " + token);
        byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(encoded.length);
        try (OutputStream stream = connection.getOutputStream()) {
            stream.write(encoded);
        }
        int status = connection.getResponseCode();
        InputStream source = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        StringBuilder response = new StringBuilder();
        if (source != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(source, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
        }
        connection.disconnect();
        JSONObject result = response.length() == 0 ? new JSONObject() : new JSONObject(response.toString());
        if (status < 200 || status >= 300) {
            throw new IllegalStateException(result.optString("error", "Máy chủ thiết bị trả lỗi " + status));
        }
        return result;
    }
}
