package app.genaifamily.device;

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

    static void start(Context context) {
        Intent intent = new Intent(context, DeviceCommandService.class);
        try {
            context.startForegroundService(intent);
        } catch (RuntimeException ignored) {
            // Recent Android versions may reject a foreground-service start from
            // boot/background. The next foreground app launch starts it safely.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, notification(false));
        handler.post(pollTask);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        handler.removeCallbacks(pollTask);
        handler.post(pollTask);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(pollTask);
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void schedulePoll() {
        if (!polling.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try {
                pollServer();
            } catch (Exception ignored) {
                DevicePreferences.isLockActive(this);
            } finally {
                polling.set(false);
                handler.postDelayed(pollTask, POLL_INTERVAL_MS);
            }
        });
    }

    private void pollServer() throws Exception {
        String token = SecureStore.readToken(this);
        if (token == null) {
            stopSelf();
            return;
        }
        JSONObject response = DeviceApi.poll(token);
        int heartbeatSeconds = Math.max(30, Math.min(3600, response.optInt("heartbeat_timeout_seconds", 180)));
        JSONObject desired = response.optJSONObject("desired");
        boolean shouldLock = desired != null && "lock".equals(desired.optString("state"));
        boolean canApplyLock = DevicePermissions.isAccessibilityEnabled(this)
                && !DevicePreferences.blockedPackages(this).isEmpty();
        boolean applied = !shouldLock || canApplyLock;
        String failure = canApplyLock || !shouldLock
                ? null
                : "Hãy bật quyền Study Lock và chọn ít nhất một ứng dụng cần chặn.";

        if (shouldLock && applied) {
            DevicePreferences.setLock(
                    this,
                    true,
                    System.currentTimeMillis() + heartbeatSeconds * 1000L
            );
        } else if (!shouldLock) {
            DevicePreferences.setLock(this, false, 0L);
        }

        JSONArray commands = response.optJSONArray("commands");
        if (commands != null) {
            for (int index = 0; index < commands.length(); index++) {
                JSONObject command = commands.optJSONObject(index);
                if (command == null) continue;
                String commandId = command.optString("id", "");
                if (commandId.isEmpty()) continue;
                try {
                    DeviceApi.acknowledge(token, commandId, applied, failure);
                } catch (Exception ignored) {
                    // The server redelivers unacknowledged commands idempotently.
                }
            }
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, notification(DevicePreferences.isLockActive(this)));
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.notification_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification notification(boolean locked) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setContentTitle(locked ? "Study Lock đang bật" : getString(R.string.notification_title))
                .setContentText(locked ? "Ứng dụng giải trí đã chọn đang được chặn" : getString(R.string.notification_description))
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }
}
