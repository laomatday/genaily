import BackgroundTasks
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: DeviceCoordinator.backgroundTaskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor in
                refreshTask.expirationHandler = {}
                await DeviceCoordinator.shared.pollOnce()
                DeviceCoordinator.shared.scheduleBackgroundRefresh()
                refreshTask.setTaskCompleted(success: true)
            }
        }
        return true
    }
}
