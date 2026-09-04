package app.genaifamily.device;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.view.accessibility.AccessibilityEvent;

public final class FocusAccessibilityService extends AccessibilityService {
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (!DevicePreferences.isLockActive(this)) return;
        String packageName = event.getPackageName().toString();
        if (getPackageName().equals(packageName)) return;
        if (!DevicePreferences.blockedPackages(this).contains(packageName)) return;

        Intent shield = new Intent(this, ShieldActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(ShieldActivity.EXTRA_APP_LABEL, applicationLabel(packageName));
        startActivity(shield);
    }

    @Override
    public void onInterrupt() {
        // No speech, gestures, or UI content are intercepted.
    }

    private String applicationLabel(String packageName) {
        try {
            ApplicationInfo info = getPackageManager().getApplicationInfo(packageName, 0);
            return getPackageManager().getApplicationLabel(info).toString();
        } catch (Exception ignored) {
            return "ứng dụng này";
        }
    }
}
