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

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView pairingStatus;
    private TextView permissionStatus;
    private Button pairButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildContent());
        requestNotificationPermission();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
        if (SecureStore.readToken(this) != null) DeviceCommandService.start(this);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private View buildContent() {
        int spacing = dp(16);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(spacing, dp(28), spacing, dp(28));
        content.setBackgroundColor(getColor(R.color.app_background));

        TextView title = text("genAi Family Device", 26, true);
        content.addView(title);
        TextView subtitle = text("Study Lock chỉ chặn các ứng dụng mà gia đình lựa chọn trong giờ học.", 15, false);
        subtitle.setTextColor(getColor(R.color.app_text_muted));
        content.addView(withTopMargin(subtitle, dp(6)));

        TextView disclosure = text(
                "Quyền Trợ năng chỉ được dùng để nhận biết tên gói ứng dụng đang ở phía trước và mở màn chắn. " +
                        "Ứng dụng không đọc chữ trên màn hình, không thao tác thay trẻ, không thu thập mật khẩu và không khóa điện thoại.",
                14,
                false
        );
        disclosure.setPadding(dp(14), dp(14), dp(14), dp(14));
        disclosure.setBackgroundColor(getColor(R.color.app_blue_soft));
        content.addView(withTopMargin(disclosure, dp(20)));

        pairingStatus = text("Chưa ghép với tài khoản", 15, true);
        content.addView(withTopMargin(pairingStatus, dp(22)));

        EditText code = new EditText(this);
        code.setHint("Mã ghép 16 ký tự");
        code.setSingleLine(true);
        code.setTextSize(18);
        code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(19)});
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

        TextView safety = text(
                "An toàn khi mất mạng: lệnh chặn chỉ còn hiệu lực trong thời gian heartbeat do máy chủ cấp. " +
                        "Khi quá hạn, thiết bị tự bỏ chặn các ứng dụng.",
                13,
                false
        );
        safety.setTextColor(getColor(R.color.app_text_muted));
        content.addView(withTopMargin(safety, dp(22)));

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private void pair(String rawCode) {
        String code = rawCode.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        if (!code.matches("[0-9A-F]{16}")) {
            pairingStatus.setText("Mã ghép phải có 16 ký tự.");
            return;
        }
        pairButton.setEnabled(false);
        pairingStatus.setText("Đang ghép thiết bị…");
        executor.execute(() -> {
            try {
                JSONObject response = DeviceApi.pair(code);
                SecureStore.saveToken(this, response.getString("device_token"));
                DevicePreferences.saveDeviceId(this, response.getString("device_id"));
                runOnUiThread(() -> {
                    pairingStatus.setText("Đã ghép an toàn với gia đình.");
                    pairButton.setEnabled(true);
                    DeviceCommandService.start(this);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    pairingStatus.setText(error.getMessage());
                    pairButton.setEnabled(true);
                });
            }
        });
    }

    private void refreshStatus() {
        boolean paired = SecureStore.readToken(this) != null;
        pairingStatus.setText(paired ? "Đã ghép an toàn với gia đình." : "Chưa ghép với tài khoản");
        boolean accessibility = DevicePermissions.isAccessibilityEnabled(this);
        int selectedCount = DevicePreferences.blockedPackages(this).size();
        permissionStatus.setText(accessibility
                ? "Study Lock đã bật · " + selectedCount + " ứng dụng được chọn"
                : "Quyền Study Lock chưa bật");
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
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
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = margin;
        view.setLayoutParams(params);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
