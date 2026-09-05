package app.genaifamily.device;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class DeviceCommandService extends Service {
    private static final String CHANNEL_ID = "study_lock_commands";
    private static final int NOTIFICATION_ID = 4101;
    private static final long POLL_INTERVAL_MS = 15_000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean polling = new AtomicBoolean(false);
    private final Runnable pollTask = this::schedulePoll;
    private volatile boolean destroyed;

    static void start(Context context) {
        try { context.startForegroundService(new Intent(context, DeviceCommandService.class)); }
        catch (RuntimeException error) {
            DeviceDiagnostics.failure(context, "BACKGROUND: Android chưa cho chạy nền; mở lại companion app.");
        }
    }
    @Override public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, notification(false));
        handler.post(pollTask);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        handler.removeCallbacks(pollTask);
        handler.post(pollTask);
        return START_STICKY;
    }
    @Override public void onDestroy() {
        destroyed = true;
        handler.removeCallbacks(pollTask);
        executor.shutdownNow();
        super.onDestroy();
    }
    @Override public void onTimeout(int startId, int fgsType) {
        // Android 15+ limits dataSync foreground services. Fail open, never crash or strand a lock.
        destroyed = true;
        handler.removeCallbacks(pollTask);
        DevicePreferences.setLock(this, false, 0L);
        DeviceDiagnostics.failure(this, "BACKGROUND_TIMEOUT: Android đã dừng phiên nền; mở lại companion app.");
        stopSelf();
    }
    @Override public IBinder onBind(Intent intent) { return null; }

    private void schedulePoll() {
        if (destroyed || !polling.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try { pollServer(); }
            catch (Exception error) {
                DeviceDiagnostics.failure(this, DeviceApi.safeError(error));
                if (error instanceof DeviceApi.ApiException
                        && ((DeviceApi.ApiException) error).deviceUnauthorized) {
                    // Only an explicit device-token rejection clears pairing; gateway/network errors do not.
                    DevicePreferences.clearPairing(this);
                    stopSelf();
                }
                DevicePreferences.isLockActive(this);
            } finally {
                polling.set(false);
                if (!destroyed && SecureStore.readToken(this) != null) {
                    handler.postDelayed(pollTask, POLL_INTERVAL_MS);
                }
            }
        });
    }

    private void pollServer() throws Exception {
        String token = SecureStore.readToken(this);
        if (token == null) { stopSelf(); return; }
        JSONObject response = DeviceApi.poll(token);
        if (destroyed) return;
        int heartbeatSeconds = Math.max(30, Math.min(3600, response.optInt("heartbeat_timeout_seconds", 180)));
        JSONObject desired = response.optJSONObject("desired");
        if (desired == null || !("lock".equals(desired.optString("state"))
                || "unlock".equals(desired.optString("state")))) {
            throw new DeviceApi.ApiException(200, "PROTOCOL: trạng thái Study Lock không hợp lệ.", false);
        }
        DeviceDiagnostics.heartbeat(this, heartbeatSeconds);
        boolean shouldLock = "lock".equals(desired.optString("state"));
        boolean canApplyLock = DevicePermissions.isAccessibilityEnabled(this)
                && !DevicePreferences.blockedPackages(this).isEmpty();
        boolean applied = !shouldLock || canApplyLock;
        String failure = applied ? null : "Hãy bật quyền Study Lock và chọn ít nhất một ứng dụng cần chặn.";
        if (shouldLock && applied) {
            DevicePreferences.setLock(this, true, System.currentTimeMillis() + heartbeatSeconds * 1000L);
        } else {
            DevicePreferences.setLock(this, false, 0L);
        }
        if (failure != null) DeviceDiagnostics.failure(this, "PERMISSION: " + failure);
        JSONArray commands = response.optJSONArray("commands");
        if (commands != null) {
            for (int index = 0; index < commands.length(); index++) {
                JSONObject command = commands.optJSONObject(index);
                if (command == null) continue;
                String commandId = command.optString("id", "");
                if (commandId.isEmpty()) continue;
                try { DeviceApi.acknowledge(token, commandId, applied, failure); }
                catch (Exception error) {
                    DeviceDiagnostics.failure(this, DeviceApi.safeError(error));
                    // Unacknowledged commands remain eligible for server redelivery.
                }
            }
        }
        if (!destroyed && (Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)) {
            getSystemService(NotificationManager.class).notify(
                NOTIFICATION_ID, notification(DevicePreferences.isLockActive(this)));
        }
    }
    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                getString(R.string.notification_channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.notification_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    private Notification notification(boolean locked) {
        PendingIntent intent = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setContentTitle(locked ? "Study Lock đang bật" : getString(R.string.notification_title))
                .setContentText(locked ? "Ứng dụng giải trí đã chọn đang được chặn" : getString(R.string.notification_description))
                .setContentIntent(intent).setOngoing(true).build();
    }
}
