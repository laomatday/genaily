package app.genaifamily.device;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.DateFormat;
import java.util.Date;

/** Local technical status only; no raw tokens, keys, pairing codes or child data. */
final class DeviceDiagnostics {
    private DeviceDiagnostics() {}
    private static SharedPreferences store(Context context) {
        return context.getSharedPreferences("device_diagnostics", Context.MODE_PRIVATE);
    }
    static void heartbeat(Context context, int timeoutSeconds) {
        store(context).edit().putLong("heartbeat", System.currentTimeMillis())
                .putInt("timeout_seconds", timeoutSeconds).remove("error").apply();
    }
    static void failure(Context context, String safeMessage) {
        store(context).edit().putString("error", safeMessage)
                .putLong("error_at", System.currentTimeMillis()).apply();
    }
    static void paired(Context context) {
        store(context).edit().remove("heartbeat").remove("error").apply();
    }
    private static String time(long millis) {
        return millis == 0 ? "Chưa có" : DateFormat.getDateTimeInstance().format(new Date(millis));
    }
    static String report(Context context) {
        SharedPreferences status = store(context);
        long heartbeat = status.getLong("heartbeat", 0);
        long age = System.currentTimeMillis() - heartbeat;
        long timeout = status.getInt("timeout_seconds", 180) * 1000L;
        boolean tokenPresent = SecureStore.readToken(context) != null;
        boolean recentlyVerified = tokenPresent && heartbeat > 0 && age >= 0 && age <= timeout;
        String config = DeviceApi.configurationError();
        return "genAi Family Device — " + (BuildConfig.DEBUG ? "PILOT" : "RELEASE")
                + "\nPhiên bản: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"
                + "\nCommit: " + BuildConfig.BUILD_SHA
                + "\nMôi trường: " + BuildConfig.DEPLOYMENT_ENVIRONMENT
                + "\nProject: " + BuildConfig.SUPABASE_PROJECT_REF
                + "\nCấu hình: " + (config == null ? "Đúng project production" : config)
                + "\nToken trên máy: " + (tokenPresent ? "Có (không hiển thị)" : "Chưa có")
                + "\nMáy chủ xác nhận: " + (recentlyVerified ? "Có heartbeat gần đây" : "Chưa xác nhận gần đây")
                + "\nHeartbeat cuối: " + time(heartbeat)
                + "\nQuyền Trợ năng: " + (DevicePermissions.isAccessibilityEnabled(context) ? "Đã bật" : "Chưa bật")
                + "\nỨng dụng đã chọn: " + DevicePreferences.blockedPackages(context).size()
                + "\nStudy Lock: " + (DevicePreferences.isLockActive(context) ? "Đang bật" : "Đang tắt")
                + "\nLỗi gần nhất: " + status.getString("error", "Không có lỗi đang ghi nhận")
                + (status.contains("error") ? "\nThời điểm lỗi: " + time(status.getLong("error_at", 0)) : "");
    }
}
