package app.genaifamily.device;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class ShieldActivity extends Activity {
    static final String EXTRA_APP_LABEL = "blocked_app_label";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable closeWhenUnlocked = new Runnable() {
        @Override
        public void run() {
            if (!DevicePreferences.isLockActive(ShieldActivity.this)) {
                finishAndRemoveTask();
                return;
            }
            handler.postDelayed(this, 500L);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        int spacing = dp(28);
        content.setPadding(spacing, spacing, spacing, spacing);
        content.setBackgroundColor(getColor(R.color.app_background));

        TextView title = new TextView(this);
        title.setText("Đang trong giờ tập trung");
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(getColor(R.color.app_text));
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        String appLabel = getIntent().getStringExtra(EXTRA_APP_LABEL);
        TextView message = new TextView(this);
        message.setText((appLabel == null ? "Ứng dụng này" : appLabel) + " sẽ mở lại khi buổi học kết thúc.");
        message.setTextSize(16);
        message.setTextColor(getColor(R.color.app_text_muted));
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(24));
        content.addView(message);

        Button home = new Button(this);
        home.setText("Về màn hình chính");
        home.setAllCaps(false);
        home.setOnClickListener(view -> goHome());
        content.addView(home);
        setContentView(content);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(closeWhenUnlocked);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(closeWhenUnlocked);
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        goHome();
    }

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
