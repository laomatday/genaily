import Foundation

enum DeviceClientError: LocalizedError {
    case invalidConfiguration
    case server(String)
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: "Companion app chưa có cấu hình Supabase hợp lệ."
        case .server(let message): message
        case .keychain: "Không lưu được token vào Keychain."
        }
    }
}

struct PairResponse: Decodable {
    let deviceId: UUID
    let deviceToken: String

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceToken = "device_token"
    }
}

struct DeviceCommand: Decodable, Identifiable {
    let id: UUID
    let command: String
}

struct DesiredState: Decodable {
    let state: String
}

struct PollResponse: Decodable {
    let heartbeatTimeoutSeconds: Int
    let desired: DesiredState
    let commands: [DeviceCommand]

    enum CodingKeys: String, CodingKey {
        case heartbeatTimeoutSeconds = "heartbeat_timeout_seconds"
        case desired
        case commands
    }
}

struct ErrorResponse: Decodable {
    let error: String
}

private struct AckResponse: Decodable {}

struct DeviceClient {
    private let session: URLSession
    private let endpoint: URL
    private let publishableKey: String

    init(session: URLSession = .shared) throws {
        guard let endpointValue = Bundle.main.object(forInfoDictionaryKey: "GENAI_DEVICE_AGENT_URL") as? String,
              let endpoint = URL(string: endpointValue), endpoint.scheme == "https",
              let publishableKey = Bundle.main.object(forInfoDictionaryKey: "GENAI_PUBLISHABLE_KEY") as? String,
              !publishableKey.isEmpty else {
            throw DeviceClientError.invalidConfiguration
        }
        self.session = session
        self.endpoint = endpoint
        self.publishableKey = publishableKey
    }

    func pair(code: String) async throws -> PairResponse {
        try await send(
            body: ["action": "pair", "pairing_code": code, "platform": "ios"],
            token: nil,
            as: PairResponse.self
        )
    }

    func poll(token: String) async throws -> PollResponse {
        try await send(body: ["action": "poll"], token: token, as: PollResponse.self)
    }

    func acknowledge(token: String, commandId: UUID, applied: Bool, error: String?) async throws {
        var body: [String: Any] = [
            "action": "ack",
            "command_id": commandId.uuidString.lowercased(),
            "status": applied ? "acknowledged" : "failed",
        ]
        if let error { body["error_message"] = error }
        let _: AckResponse? = try await sendOptional(body: body, token: token, as: AckResponse.self)
    }

    private func send<T: Decodable>(body: [String: Any], token: String?, as type: T.Type) async throws -> T {
        guard let value: T = try await sendOptional(body: body, token: token, as: type) else {
            throw DeviceClientError.server("Máy chủ không trả về dữ liệu.")
        }
        return value
    }

    private func sendOptional<T: Decodable>(body: [String: Any], token: String?, as type: T.Type) async throws -> T? {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        if let token { request.setValue("Device \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DeviceClientError.server("Phản hồi máy chủ không hợp lệ.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).error)
                ?? "Máy chủ thiết bị trả lỗi \(http.statusCode)."
            throw DeviceClientError.server(message)
        }
        return data.isEmpty ? nil : try JSONDecoder().decode(type, from: data)
    }
}
