package app.genaifamily.device;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputFilter;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView pairingStatus;
    private TextView permissionStatus;
    private Button pairButton;
    private boolean pairingInFlight;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(buildContent());
        requestNotificationPermission();
    }
    @Override protected void onResume() {
        super.onResume();
        if (!pairingInFlight) refreshStatus();
        if (SecureStore.readToken(this) != null) DeviceCommandService.start(this);
    }
    @Override protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private View buildContent() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(28), dp(16), dp(28));
        content.setBackgroundColor(getColor(R.color.app_background));
        content.addView(text("genAi Family Device" + (BuildConfig.DEBUG ? " · Pilot" : ""), 26, true));
        TextView subtitle = text("Study Lock chỉ chặn các ứng dụng mà gia đình lựa chọn trong giờ học.", 15, false);
        subtitle.setTextColor(getColor(R.color.app_text_muted));
        content.addView(withTopMargin(subtitle, dp(6)));
        TextView disclosure = text("Quyền Trợ năng chỉ dùng để nhận biết tên gói ứng dụng đang ở phía trước và mở màn chắn. "
                + "Ứng dụng không đọc chữ trên màn hình, không thao tác thay trẻ, không thu thập mật khẩu và không khóa điện thoại.", 14, false);
        disclosure.setPadding(dp(14), dp(14), dp(14), dp(14));
        disclosure.setBackgroundColor(getColor(R.color.app_blue_soft));
        content.addView(withTopMargin(disclosure, dp(20)));
        content.addView(withTopMargin(text("1. Trên web phụ huynh, chọn đúng bé và tạo mã Android.\n"
                + "2. Nhập mã vào app này trong 10 phút.\n3. Bật Trợ năng và chọn ứng dụng cần chặn.", 15, false), dp(18)));
        pairingStatus = text("Chưa ghép với tài khoản", 15, true);
        content.addView(withTopMargin(pairingStatus, dp(20)));
        EditText code = new EditText(this);
        code.setHint("Mã ghép 16 ký tự");
        code.setSingleLine(true);
        code.setTextSize(18);
        code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(64)});
        content.addView(withTopMargin(code, dp(10)));
        pairButton = button("Ghép thiết bị");
        pairButton.setOnClickListener(view -> pair(code.getText().toString()));
        content.addView(withTopMargin(pairButton, dp(10)));
        permissionStatus = text("Quyền Study Lock chưa bật", 15, true);
        content.addView(withTopMargin(permissionStatus, dp(24)));
        Button accessibility = button("Mở cài đặt Trợ năng");
        accessibility.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        content.addView(withTopMargin(accessibility, dp(10)));
        Button chooseApps = button("Chọn ứng dụng giải trí cần chặn");
        chooseApps.setOnClickListener(view -> startActivity(new Intent(this, AppPickerActivity.class)));
        content.addView(withTopMargin(chooseApps, dp(10)));
        Button diagnostics = button("Chẩn đoán kết nối");
        diagnostics.setOnClickListener(view -> startActivity(new Intent(this, DiagnosticsActivity.class)));
        content.addView(withTopMargin(diagnostics, dp(20)));
        TextView safety = text("Khi heartbeat quá hạn, thiết bị tự bỏ chặn. Ghép thành công không có nghĩa là đã cấp quyền Study Lock.\n"
                + BuildConfig.VERSION_NAME + " · " + BuildConfig.DEPLOYMENT_ENVIRONMENT, 13, false);
        safety.setTextColor(getColor(R.color.app_text_muted));
        content.addView(withTopMargin(safety, dp(20)));
        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private void pair(String rawCode) {
        if (pairingInFlight) return;
        // Do not overwrite a working device identity when the button is tapped twice.
        if (SecureStore.readToken(this) != null) {
            pairingStatus.setText("Máy đã có token ghép. Mở Chẩn đoán để kiểm tra xác nhận từ máy chủ.");
            return;
        }
        String code = DeviceProtocol.normalizeCode(rawCode);
        if (!DeviceProtocol.validCode(code)) {
            pairingStatus.setText("Mã ghép phải có 16 ký tự 0–9, A–F.");
            return;
        }
        pairingInFlight = true;
        pairButton.setEnabled(false);
        pairingStatus.setText("Đang ghép thiết bị…");
        executor.execute(() -> {
            String result;
            boolean paired = false;
            try {
                JSONObject response = DeviceApi.pair(code);
                String token = response.getString("device_token");
                String deviceId = response.getString("device_id");
                if (!token.matches("[A-Za-z0-9_-]{40,128}") || !deviceId.matches("[0-9a-fA-F-]{36}")) {
                    throw new DeviceApi.ApiException(201, "PROTOCOL: máy chủ trả thông tin ghép không hợp lệ.", false);
                }
                SecureStore.saveToken(getApplicationContext(), token);
                DevicePreferences.saveDeviceId(getApplicationContext(), deviceId);
                DeviceDiagnostics.paired(getApplicationContext());
                paired = true;
                result = "Đã ghép với gia đình. Hãy bật Trợ năng và chọn ứng dụng cần chặn.";
            } catch (Exception error) {
                result = DeviceApi.safeError(error);
                DeviceDiagnostics.failure(getApplicationContext(), result);
            }
            boolean success = paired;
            String message = result;
            runOnUiThread(() -> {
                pairingInFlight = false;
                if (isFinishing() || isDestroyed()) return;
                pairingStatus.setText(message);
                pairButton.setEnabled(!success && DeviceApi.configurationError() == null);
                if (success) DeviceCommandService.start(this);
            });
        });
    }

    private void refreshStatus() {
        String problem = DeviceApi.configurationError();
        boolean paired = SecureStore.readToken(this) != null;
        pairingStatus.setText(problem != null ? problem : paired
                ? "Máy đã có token ghép; xem heartbeat trong Chẩn đoán để kiểm tra kết nối."
                : "Chưa ghép với tài khoản");
        pairButton.setEnabled(problem == null && !paired);
        int count = DevicePreferences.blockedPackages(this).size();
        permissionStatus.setText(DevicePermissions.isAccessibilityEnabled(this)
                ? "Trợ năng đã bật · " + count + " ứng dụng được chọn" : "Quyền Study Lock chưa bật");
    }
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 41);
        }
    }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(getColor(R.color.app_text));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }
    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        return button;
    }
    private View withTopMargin(View view, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = margin;
        view.setLayoutParams(params);
        return view;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
