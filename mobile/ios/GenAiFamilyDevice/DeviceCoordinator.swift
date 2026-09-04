import BackgroundTasks
import FamilyControls
import Foundation
import ManagedSettings

@MainActor
final class DeviceCoordinator: ObservableObject {
    static let shared = DeviceCoordinator()
    static let backgroundTaskIdentifier = "app.genaifamily.device.refresh"

    @Published var pairingCode = ""
    @Published var status = "Chưa ghép với tài khoản"
    @Published var isBusy = false
    @Published var isPaired = DeviceAuthStore.read() != nil
    @Published var isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
    @Published var isPickerPresented = false
    @Published var selection: FamilyActivitySelection

    private let shieldStore = ManagedSettingsStore(named: .init("genAiFamilyStudyLock"))
    private let defaults = UserDefaults.standard
    private let selectionKey = "family-activity-selection"
    private let unlockDeadlineKey = "study-lock-unlock-deadline"
    private var pollTask: Task<Void, Never>?

    private init() {
        if let data = defaults.data(forKey: selectionKey),
           let stored = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
            selection = stored
        } else {
            selection = FamilyActivitySelection()
        }
        enforceFailsafe()
    }

    func startForegroundPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    func stopForegroundPolling() {
        pollTask?.cancel()
        pollTask = nil
        scheduleBackgroundRefresh()
    }

    func authorizeFamilyControls() async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .child)
            isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
            status = isAuthorized ? "Family Controls đã được phụ huynh cho phép." : "Chưa có quyền Family Controls."
        } catch {
            status = error.localizedDescription
        }
    }

    func pair() async {
        let normalized = pairingCode.replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: " ", with: "")
            .uppercased()
        guard normalized.range(of: "^[0-9A-F]{16}$", options: .regularExpression) != nil else {
            status = "Mã ghép phải có 16 ký tự."
            return
        }
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await DeviceClient().pair(code: normalized)
            try DeviceAuthStore.save(token: response.deviceToken)
            defaults.set(response.deviceId.uuidString.lowercased(), forKey: "managed-device-id")
            isPaired = true
            status = "Đã ghép an toàn với gia đình."
            await pollOnce()
        } catch {
            status = error.localizedDescription
        }
    }

    func saveSelection() {
        if let data = try? JSONEncoder().encode(selection) {
            defaults.set(data, forKey: selectionKey)
        }
        isPickerPresented = false
        status = selection.applicationTokens.isEmpty && selection.categoryTokens.isEmpty
            ? "Hãy chọn ít nhất một ứng dụng hoặc nhóm ứng dụng."
            : "Đã lưu danh sách ứng dụng cần chặn."
    }

    func pollOnce() async {
        enforceFailsafe()
        guard let token = DeviceAuthStore.read() else { return }
        do {
            let response = try await DeviceClient().poll(token: token)
            let wantsLock = response.desired.state == "lock"
            let hasSelection = !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty
            let canApply = !wantsLock || (isAuthorized && hasSelection)
            if wantsLock && canApply {
                applyShield()
                let seconds = min(3600, max(30, response.heartbeatTimeoutSeconds))
                defaults.set(Date().addingTimeInterval(TimeInterval(seconds)), forKey: unlockDeadlineKey)
                status = "Study Lock đang chặn ứng dụng gây xao nhãng."
            } else if !wantsLock {
                removeShield()
                status = "Study Lock đang sẵn sàng."
            } else {
                removeShield()
                status = isAuthorized
                    ? "Hãy chọn ít nhất một ứng dụng cần chặn."
                    : "Hãy cấp quyền Family Controls với xác nhận của phụ huynh."
            }
            for command in response.commands {
                try? await DeviceClient().acknowledge(
                    token: token,
                    commandId: command.id,
                    applied: canApply,
                    error: canApply ? nil : status
                )
            }
        } catch {
            enforceFailsafe()
            status = error.localizedDescription
        }
    }

    func scheduleBackgroundRefresh() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.backgroundTaskIdentifier)
        let request = BGAppRefreshTaskRequest(identifier: Self.backgroundTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func applyShield() {
        shieldStore.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        shieldStore.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
        shieldStore.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    }

    private func removeShield() {
        shieldStore.clearAllSettings()
        defaults.removeObject(forKey: unlockDeadlineKey)
    }

    private func enforceFailsafe() {
        guard let deadline = defaults.object(forKey: unlockDeadlineKey) as? Date else { return }
        if deadline <= Date() { removeShield() }
    }
}
