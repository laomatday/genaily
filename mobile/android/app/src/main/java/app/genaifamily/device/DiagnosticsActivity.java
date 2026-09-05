package app.genaifamily.device;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class DiagnosticsActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView report;
    private TextView probe;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            report.setText(DeviceDiagnostics.report(DiagnosticsActivity.this));
            handler.postDelayed(this, 2_000L);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        int gap = Math.round(20 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(gap, gap * 2, gap, gap);
        TextView title = new TextView(this);
        title.setText("Chẩn đoán kết nối");
        title.setTextSize(24);
        content.addView(title);
        report = new TextView(this);
        report.setTextSize(15);
        report.setPadding(0, gap, 0, gap);
        report.setTextIsSelectable(true);
        content.addView(report);
        probe = new TextView(this);
        probe.setText("Kiểm tra API không dùng mã ghép, không gửi dữ liệu của trẻ.");
        content.addView(probe);
        Button check = new Button(this);
        check.setText("Kiểm tra API");
        check.setAllCaps(false);
        check.setOnClickListener(view -> {
            check.setEnabled(false);
            probe.setText("Đang kiểm tra kết nối…");
            executor.execute(() -> {
                String result;
                try { result = DeviceApi.diagnose(); }
                catch (Exception error) { result = DeviceApi.safeError(error); }
                String safeResult = result;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    probe.setText(safeResult);
                    check.setEnabled(true);
                });
            });
        });
        content.addView(check);
        Button copy = new Button(this);
        copy.setText("Sao chép chẩn đoán");
        copy.setAllCaps(false);
        copy.setOnClickListener(view -> {
            getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText(
                    "genAi diagnostics", DeviceDiagnostics.report(this) + "\nAPI probe: " + probe.getText()));
            Toast.makeText(this, "Đã sao chép; không chứa token, mã ghép hoặc dữ liệu trẻ.", Toast.LENGTH_SHORT).show();
        });
        content.addView(copy);
        Button back = new Button(this);
        back.setText("Quay lại ghép thiết bị");
        back.setAllCaps(false);
        back.setOnClickListener(view -> finish());
        content.addView(back);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }
    @Override protected void onResume() {
        super.onResume();
        handler.post(refresh);
    }
    @Override protected void onPause() {
        handler.removeCallbacks(refresh);
        super.onPause();
    }
    @Override protected void onDestroy() {
        handler.removeCallbacks(refresh);
        executor.shutdownNow();
        super.onDestroy();
    }
}
