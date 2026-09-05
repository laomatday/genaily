package app.genaifamily.device;

import java.net.URI;
import java.util.Locale;

/** Pure-Java, testable protocol rules. Never return credentials in an error. */
final class DeviceProtocol {
    static final String INVALID_PAIRING = "Mã ghép không hợp lệ hoặc đã hết hạn.";
    static final String DEVICE_UNAUTHORIZED = "Thiết bị chưa được ghép hoặc đã bị thu hồi.";

    private DeviceProtocol() {}

    static String normalizeCode(String raw) {
        if (raw == null) return "";
        StringBuilder value = new StringBuilder();
        raw.codePoints().filter(c -> c != '-' && !Character.isWhitespace(c)
                && !Character.isSpaceChar(c)).forEach(value::appendCodePoint);
        return value.toString().toUpperCase(Locale.ROOT);
    }

    static boolean validCode(String code) {
        return code != null && code.matches("[0-9A-F]{16}");
    }

    static String configurationError(String url, String key, String projectRef) {
        if (projectRef == null || !projectRef.matches("[a-z]{20}")) {
            return "CONFIG_PROJECT: project Supabase không hợp lệ.";
        }
        try {
            URI uri = URI.create(url == null ? "" : url);
            if (!"https".equals(uri.getScheme())
                    || !(projectRef + ".supabase.co").equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || !"/functions/v1/device-agent".equals(uri.getRawPath())) {
                return "CONFIG_URL: APK không trỏ đúng device-agent production.";
            }
        } catch (IllegalArgumentException error) {
            return "CONFIG_URL: địa chỉ máy chủ không hợp lệ.";
        }
        if (key == null || !key.matches("sb_publishable_[A-Za-z0-9_-]{20,160}")
                || key.contains("REPLACE") || key.contains("PLACEHOLDER")) {
            return "CONFIG_KEY: cần publishable key; không dùng khóa quản trị hoặc JWT.";
        }
        return null;
    }

    static boolean isRevokedResponse(int status, String message) {
        return status == 401 && DEVICE_UNAUTHORIZED.equals(message);
    }

    static String httpError(int status, String message) {
        if (isRevokedResponse(status, message)) return "DEVICE_AUTH: " + DEVICE_UNAUTHORIZED;
        if (status == 401 || status == 403) {
            return "API_AUTH: kiểm tra publishable key và verify_jwt=false của device-agent.";
        }
        if ((status == 400 || status == 404) && INVALID_PAIRING.equals(message)) {
            return "PAIRING_CODE: tạo mã mới trên web phụ huynh rồi nhập trong 10 phút.";
        }
        if (status == 404) return "ENDPOINT: chưa tìm thấy device-agent trên project này.";
        if (status == 409) return "PAIRING_CONFLICT: mã đã dùng hoặc chọn sai nền tảng; tạo mã Android mới.";
        if (status == 429) return "RATE_LIMIT: quá nhiều yêu cầu; hãy thử lại sau.";
        if (status >= 500) return "SERVER: máy chủ thiết bị tạm thời lỗi; chưa xác nhận ghép nối.";
        return "HTTP_" + status + ": máy chủ từ chối yêu cầu thiết bị.";
    }
}
