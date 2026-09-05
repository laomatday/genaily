package app.genaifamily.device;

import android.os.SystemClock;

/** A short one-use in-process capability. No exported intent or JavaScript can mint it. */
final class NativeSetupPermit {
    private static long expiresAt;
    private NativeSetupPermit() {}
    static synchronized void grant() { expiresAt = SystemClock.elapsedRealtime() + 30000L; }
    static synchronized boolean consume() {
        boolean valid = expiresAt > SystemClock.elapsedRealtime();
        expiresAt = 0L;
        return valid;
    }
}
