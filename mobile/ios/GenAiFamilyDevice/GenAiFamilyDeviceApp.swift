import SwiftUI

@main
struct GenAiFamilyDeviceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var coordinator = DeviceCoordinator.shared

    var body: some Scene {
        WindowGroup {
            ContentView(coordinator: coordinator)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                coordinator.startForegroundPolling()
            } else if phase == .background {
                coordinator.stopForegroundPolling()
            }
        }
    }
}
