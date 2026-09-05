package app.genaifamily.device;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** One launcher: bundled React UI plus an explicitly registered native Study Lock bridge. */
public final class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(StudyLockPlugin.class);
        super.onCreate(state);
    }
    @Override public void onResume() {
        super.onResume();
        if (SecureStore.readToken(this) != null) DeviceCommandService.start(this);
    }
}
