package app.genaifamily.device;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

public final class AppPickerActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Ứng dụng giải trí");

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int spacing = dp(16);
        content.setPadding(spacing, spacing, spacing, spacing);
        content.setBackgroundColor(getColor(R.color.app_background));

        TextView explanation = new TextView(this);
        explanation.setText("Chỉ chọn ứng dụng gây xao nhãng. Ứng dụng học tập và liên lạc khẩn cấp nên được giữ lại.");
        explanation.setTextColor(getColor(R.color.app_text_muted));
        explanation.setTextSize(14);
        explanation.setPadding(0, 0, 0, dp(12));
        content.addView(explanation);

        PackageManager packageManager = getPackageManager();
        Intent launcherIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> launchable = packageManager.queryIntentActivities(launcherIntent, 0);
        launchable.sort(Comparator.comparing(item -> item.loadLabel(packageManager).toString()));
        Set<String> selected = DevicePreferences.blockedPackages(this);

        for (ResolveInfo item : launchable) {
            String packageName = item.activityInfo.packageName;
            if (getPackageName().equals(packageName)) continue;
            CheckBox checkBox = new CheckBox(this);
            checkBox.setText(item.loadLabel(packageManager));
            checkBox.setTextColor(getColor(R.color.app_text));
            checkBox.setTextSize(15);
            checkBox.setChecked(selected.contains(packageName));
            checkBox.setPadding(0, dp(6), 0, dp(6));
            checkBox.setOnCheckedChangeListener((button, checked) ->
                    DevicePreferences.setPackageBlocked(this, packageName, checked));
            content.addView(checkBox);
        }

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        setContentView(scrollView);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
