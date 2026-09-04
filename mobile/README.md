# genAi Family companion apps

Hai companion app trong thư mục này thực thi **Study Lock** bằng API chính thức
của hệ điều hành. Study Lock chỉ che/chặn ứng dụng gây xao nhãng do gia đình
chọn; nó không khóa màn hình, không đổi hoặc vượt mã PIN và không đọc nội dung
của trẻ.

## Giao thức chung

1. Phụ huynh mở **Hôm nay → Study Lock trên thiết bị → Ghép thiết bị mới**.
2. Web gọi RPC `create_device_pairing` và chỉ hiển thị mã 16 ký tự một lần.
3. Companion gửi mã tới Edge Function `device-agent`, nhận token 256-bit rồi lưu
   trong Android Keystore hoặc iOS Keychain.
4. Companion lấy lệnh `lock`/`unlock`, áp dụng trên máy và gửi acknowledgement.
5. Nếu heartbeat hết hạn, companion tự gỡ chặn. Cron phía server cũng sinh lệnh
   `unlock` khi một buổi học vượt quá giới hạn an toàn.

Database chỉ lưu SHA-256 của mã ghép và token thiết bị. Phiên browser của trẻ
không có quyền đọc bảng thiết bị; phụ huynh chỉ đọc được thiết bị thuộc tài khoản
của mình qua RLS.

## Android

Yêu cầu Android Studio/SDK 37, JDK 17 và Gradle 9.6.0. Copy
`android/local.properties.example` thành `android/local.properties`, điền Android
SDK, URL `device-agent` và Supabase publishable key rồi mở thư mục `android/`
trong Android Studio.

Sau khi cài lên máy trẻ:

1. Ghép mã từ giao diện phụ huynh.
2. Mở **Cài đặt Trợ năng** và bật `Study Lock` sau khi đọc disclosure.
3. Chọn từng ứng dụng giải trí/mạng xã hội cần chặn.

Accessibility service chỉ nhận sự kiện đổi cửa sổ và tên package; cấu hình đặt
`canRetrieveWindowContent=false`. Nếu phát hành trên Google Play, khai báo việc
dùng Accessibility API cho parental control, cung cấp disclosure/consent rõ ràng
và hoàn thành biểu mẫu Play Console. Foreground service giữ kết nối bằng thông
báo thường trực; phiên bản production quy mô lớn nên bổ sung FCM để giảm polling.

## iOS / iPadOS

Yêu cầu macOS, Xcode, XcodeGen và Apple Developer Program. Trên Mac:

1. Copy `ios/Config/Config.xcconfig.example` thành
   `ios/Config/Config.xcconfig` và điền cấu hình.
2. Chạy `xcodegen generate` trong `mobile/ios`.
3. Chọn Development Team và bật Family Controls + Background Modes trong Xcode.
4. Cài lên iPhone/iPad của trẻ, xin quyền `.child` để phụ huynh trong Family
   Sharing xác nhận, rồi chọn ứng dụng/danh mục trong picker của iOS.

Trước khi phân phối, Account Holder phải xin Apple phê duyệt **Family Controls
entitlement** cho App ID. `ManagedSettingsStore` giữ shield sau khi app đóng.
`BGAppRefreshTask` không đảm bảo chạy đúng từng phút; để lệnh từ xa gần thời gian
thực ở production cần bổ sung APNs background push và vẫn giữ lịch Study Lock cục
bộ làm nguồn thực thi chính. Không có entitlement/signing profile thì iOS app
không thể cài và kiểm thử trên thiết bị thật.

## Việc cần có để test thiết bị thật

- Một máy Android đã bật Developer Options/USB debugging hoặc cài APK trực tiếp.
- Một máy Mac + iPhone/iPad thuộc Family Sharing và Apple Developer Team.
- Với production push: Firebase project/FCM service account cho Android và APNs
  key + Team ID + Key ID cho iOS. Không commit các credential này.

## Tái tạo app icon

Logo canonical nằm trong `assets/app-logo-source.png`. Generator kiểm tra
SHA-256 trước khi chạy, rồi copy nguyên byte (không scale, không recompress) sang
`public/brand/genaily-mark-v1.png` để làm fallback offline. Canvas, màu nền, đầu
ra và tỷ lệ artwork `2/3` được khai báo một lần tại
`assets/app-icons.config.json`; Vite PWA precache bản fallback cùng favicon.

Không sửa trực tiếp các PNG đã sinh. PWA có asset `any` và `maskable` riêng;
Android dùng adaptive icon với raster foreground cùng alpha mask monochrome;
iOS và Apple Touch được xuất RGB không alpha trên nền trung tính.

```bash
npx playwright install chromium
npm run generate:icons
npm run check:icons
```

Script dùng Chromium của Playwright để rasterize logo ở đúng một lần scale
`2/3`, sau đó encoder PNG dùng `node:zlib` tạo file deterministic. Metadata lưu
SHA-256 của từng derivative để `npm run check:icons` phát hiện file bị sửa tay,
scale lặp hoặc asset nguồn không còn nguyên vẹn.
