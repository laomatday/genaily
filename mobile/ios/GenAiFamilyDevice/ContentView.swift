import FamilyControls
import SwiftUI

struct ContentView: View {
    @ObservedObject var coordinator: DeviceCoordinator

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Study Lock")
                            .font(.largeTitle.bold())
                        Text("Chỉ chặn ứng dụng gây xao nhãng trong giờ học — không khóa iPhone, không đọc nội dung và không can thiệp mật mã.")
                            .foregroundStyle(.secondary)
                    }

                    GroupBox("1. Ghép với gia đình") {
                        VStack(alignment: .leading, spacing: 12) {
                            TextField("Mã ghép 16 ký tự", text: $coordinator.pairingCode)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()
                                .textFieldStyle(.roundedBorder)
                            Button("Ghép thiết bị") { Task { await coordinator.pair() } }
                                .buttonStyle(.borderedProminent)
                                .disabled(coordinator.isBusy)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox("2. Quyền Screen Time") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("iOS sẽ yêu cầu phụ huynh/giám hộ trong Family Sharing xác nhận Family Controls.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Button(coordinator.isAuthorized ? "Family Controls đã bật" : "Xin quyền Family Controls") {
                                Task { await coordinator.authorizeFamilyControls() }
                            }
                            .buttonStyle(.bordered)
                            .disabled(coordinator.isBusy || coordinator.isAuthorized)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox("3. Ứng dụng cần chặn") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Danh sách do iOS giữ kín trên thiết bị; máy chủ không biết trẻ đã chọn ứng dụng nào.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Button("Chọn ứng dụng và danh mục") { coordinator.isPickerPresented = true }
                                .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: coordinator.isPaired ? "checkmark.shield.fill" : "shield")
                            .foregroundStyle(.indigo)
                        Text(coordinator.status)
                            .font(.callout.weight(.semibold))
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))

                    Text("Nếu thiết bị mất liên lạc với máy chủ, shield tự được gỡ khi heartbeat hết hạn. iOS quyết định thời điểm chạy background refresh nên lịch cục bộ vẫn là lớp bảo vệ chính cho bản phát hành production.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .familyActivityPicker(
                isPresented: $coordinator.isPickerPresented,
                selection: $coordinator.selection
            )
            .onChange(of: coordinator.isPickerPresented) { isPresented in
                if !isPresented { coordinator.saveSelection() }
            }
        }
    }
}
