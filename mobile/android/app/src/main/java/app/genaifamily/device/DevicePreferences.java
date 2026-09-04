package app.genaifamily.device;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class DevicePreferences {
    private static final String STORE_NAME = "device_preferences";
    private static final String DEVICE_ID = "device_id";
    private static final String LOCKED = "study_lock_active";
    private static final String UNLOCK_AFTER = "unlock_after_epoch_ms";
    private static final String BLOCKED_PACKAGES = "blocked_packages";

    private DevicePreferences() {}

    static void saveDeviceId(Context context, String deviceId) {
        preferences(context).edit().putString(DEVICE_ID, deviceId).apply();
    }

    static String deviceId(Context context) {
        return preferences(context).getString(DEVICE_ID, null);
    }

    static boolean isLockActive(Context context) {
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean(LOCKED, false)) return false;
        long unlockAfter = preferences.getLong(UNLOCK_AFTER, 0L);
        if (unlockAfter <= System.currentTimeMillis()) {
            setLock(context, false, 0L);
            return false;
        }
        return true;
    }

    static void setLock(Context context, boolean locked, long unlockAfterEpochMs) {
        preferences(context).edit()
                .putBoolean(LOCKED, locked)
                .putLong(UNLOCK_AFTER, locked ? unlockAfterEpochMs : 0L)
                .apply();
    }

    static Set<String> blockedPackages(Context context) {
        return Collections.unmodifiableSet(new HashSet<>(
                preferences(context).getStringSet(BLOCKED_PACKAGES, Collections.emptySet())
        ));
    }

    static void setPackageBlocked(Context context, String packageName, boolean blocked) {
        Set<String> packages = new HashSet<>(blockedPackages(context));
        if (blocked) packages.add(packageName);
        else packages.remove(packageName);
        preferences(context).edit().putStringSet(BLOCKED_PACKAGES, packages).apply();
    }

    static void clearPairing(Context context) {
        SecureStore.clearToken(context);
        preferences(context).edit().remove(DEVICE_ID).putBoolean(LOCKED, false).remove(UNLOCK_AFTER).apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }
}
