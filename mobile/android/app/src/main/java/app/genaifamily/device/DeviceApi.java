package app.genaifamily.device;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.SSLException;

final class DeviceApi {
    private static final int TIMEOUT_MS = 15_000;
    private static final int MAX_RESPONSE_BYTES = 256 * 1024;

    static final class ApiException extends Exception {
        final int status;
        final boolean deviceUnauthorized;
        ApiException(int status, String message, boolean deviceUnauthorized) {
            super(message);
            this.status = status;
            this.deviceUnauthorized = deviceUnauthorized;
        }
    }

    private DeviceApi() {}

    static String configurationError() {
        return DeviceProtocol.configurationError(BuildConfig.DEVICE_AGENT_URL,
                BuildConfig.SUPABASE_PUBLISHABLE_KEY, BuildConfig.SUPABASE_PROJECT_REF);
    }

    static JSONObject pair(String code) throws Exception {
        String normalized = DeviceProtocol.normalizeCode(code);
        if (!DeviceProtocol.validCode(normalized)) throw new IllegalArgumentException("Mã ghép phải có 16 ký tự 0–9, A–F.");
        return request(BuildConfig.DEVICE_AGENT_URL, new JSONObject().put("action", "pair")
                .put("pairing_code", normalized).put("platform", "android"), null);
    }

    static JSONObject poll(String token) throws Exception {
        return request(BuildConfig.DEVICE_AGENT_URL, new JSONObject().put("action", "poll"), token);
    }

    static void acknowledge(String token, String commandId, boolean applied, String error) throws Exception {
        JSONObject body = new JSONObject().put("action", "ack").put("command_id", commandId)
                .put("status", applied ? "acknowledged" : "failed");
        if (error != null && !error.trim().isEmpty()) body.put("error_message", error);
        request(BuildConfig.DEVICE_AGENT_URL, body, token);
    }

    /** Read-only probe: validates the public key, then sends an impossible pairing code.
     * Never consumes a real pairing code, polls commands, or creates a device. */
    static String diagnose() throws Exception {
        String base = "https://" + BuildConfig.SUPABASE_PROJECT_REF + ".supabase.co";
        request(base + "/auth/v1/settings", null, null);
        try {
            request(BuildConfig.DEVICE_AGENT_URL, new JSONObject().put("action", "pair")
                    .put("pairing_code", "").put("platform", "android"), null);
        } catch (ApiException error) {
            if (error.status == 400 && error.getMessage().startsWith("PAIRING_CODE:")) {
                return "API tới được; publishable key hợp lệ. Chưa kiểm tra ghép nối/database.";
            }
            throw error;
        }
        throw new ApiException(0, "PROTOCOL: device-agent trả kết quả không đúng hợp đồng API.", false);
    }

    static String safeError(Exception error) {
        if (error instanceof ApiException) return error.getMessage();
        if (error instanceof SocketTimeoutException) return "TIMEOUT: máy chủ chưa phản hồi; kiểm tra mạng rồi thử lại.";
        if (error instanceof UnknownHostException) return "DNS: không tìm thấy máy chủ; kiểm tra Wi-Fi hoặc dữ liệu di động.";
        if (error instanceof SSLException) return "TLS: không xác minh được HTTPS; kiểm tra ngày giờ trên máy.";
        if (error instanceof java.io.IOException) return "NETWORK: kết nối bị gián đoạn; hãy thử lại.";
        // Do not display raw exception/response bodies: they can contain tokens or URLs.
        return "DEVICE: không hoàn tất được thao tác; mở Chẩn đoán kết nối để kiểm tra.";
    }

    private static JSONObject request(String endpoint, JSONObject body, String token) throws Exception {
        String problem = configurationError();
        if (problem != null) throw new ApiException(0, problem, false);
        HttpURLConnection connection = (HttpURLConnection) URI.create(endpoint).toURL().openConnection();
        connection.setInstanceFollowRedirects(false); // Never forward credentials to a redirect target.
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setRequestMethod(body == null ? "GET" : "POST");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY);
        if (token != null) connection.setRequestProperty("Authorization", "Device " + token);
        try {
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(encoded.length);
                try (OutputStream stream = connection.getOutputStream()) { stream.write(encoded); }
            }
            int status = connection.getResponseCode();
            InputStream source = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String text = "";
            if (source != null) {
                try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (output.size() + count > MAX_RESPONSE_BYTES) {
                            throw new ApiException(status, "PROTOCOL: phản hồi máy chủ vượt giới hạn.", false);
                        }
                        output.write(buffer, 0, count);
                    }
                    text = output.toString(StandardCharsets.UTF_8.name());
                }
            }
            JSONObject result;
            try { result = new JSONObject(text); }
            catch (org.json.JSONException error) {
                if (status < 200 || status >= 300) {
                    throw new ApiException(status, DeviceProtocol.httpError(status, ""), false);
                }
                throw new ApiException(status, "PROTOCOL: máy chủ không trả JSON hợp lệ.", false);
            }
            if (status < 200 || status >= 300) {
                String message = result.optString("error", result.optString("message", ""));
                throw new ApiException(status, DeviceProtocol.httpError(status, message),
                        DeviceProtocol.isRevokedResponse(status, message));
            }
            return result;
        } finally {
            connection.disconnect();
        }
    }
}
