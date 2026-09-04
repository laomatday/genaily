package app.genaifamily.device;

import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.text.TextUtils;

final class DevicePermissions {
    private DevicePermissions() {}

    static boolean isAccessibilityEnabled(Context context) {
        ComponentName component = new ComponentName(context, FocusAccessibilityService.class);
        String expected = component.flattenToString();
        String enabled = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (enabled == null) return false;
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        while (splitter.hasNext()) {
            if (expected.equalsIgnoreCase(splitter.next())) return true;
        }
        return false;
    }
}
