# Android APK: build, cấu hình và chẩn đoán

## 1. Lấy APK để kiểm thử

Mở repository → **Actions → Android APK** → chọn lần chạy thành công →
**Artifacts → genaily-android-pilot-...**. Giải nén ZIP rồi cài file `.apk`.
Artifact có APK, `SHA256SUMS.txt`, thông tin commit/version và hướng dẫn này.

Workflow tự chạy khi push vào `main` có thay đổi Android hoặc workflow/script
liên quan. Chạy lại chủ động bằng **Run workflow → main → channel: pilot**.
Pull request chỉ chạy kiểm tra/build, không dùng signing secrets, không probe
production và không phát hành APK. Các action được pin theo commit SHA;
quyền workflow chỉ là `contents: read`.

API probe là bắt buộc cho release. Với pilot phục vụ chẩn đoán, lỗi mạng/probe
không chặn biên dịch APK; kết quả `failure` được giữ rõ trong job summary và
`BUILD.txt`. Không coi một pilot build xanh là bằng chứng backend hoạt động.
Cấu hình sai, unit test lỗi, lint lỗi hoặc APK không có chữ ký vẫn chặn mọi build.

**Pilot kết nối dữ liệu production nhưng không phải bản release thương mại.**
Pilot có application ID `app.genaifamily.device.pilot`, chữ Pilot trong ứng dụng,
version tăng theo workflow run và được ký bằng debug certificate. Không cài cả
companion cũ và pilot để cùng kiểm soát một máy: thu hồi thiết bị cũ trên web,
tắt Trợ năng của bản cũ rồi chỉ dùng một bản.

Debug certificate trên runner mới có thể khác. Khi Android báo không cập nhật
được bản pilot, gỡ bản pilot cũ rồi cài lại và tạo mã ghép mới. Gỡ app làm mất
token và lựa chọn ứng dụng của bản đó. Release cần khóa ký ổn định riêng.
Không tự gỡ/cài nếu cần giữ trạng thái hiện tại để chẩn đoán sự cố.

## 2. Cấu hình production

Nguồn mặc định: `mobile/android/config/production.properties`.
Project được pin: `fhrzkosrnxgvyikmvfph`.
Endpoint: `https://fhrzkosrnxgvyikmvfph.supabase.co/functions/v1/device-agent`.
File chỉ chứa URL, project ref và **publishable key** dành cho client; không có
`service_role`, `sb_secret_*`, device token hoặc khóa ký.

Thứ tự ưu tiên của Gradle: environment → `local.properties` → file production.
CI có thể ghi đè publishable key qua GitHub Actions secret/variable
`GENAI_PUBLISHABLE_KEY`; secret được ưu tiên hơn variable. URL ghi đè qua Actions
variable `GENAI_DEVICE_AGENT_URL` nhưng vẫn phải khớp project production đã pin.
Không cần thiết lập secret để chạy pilot với cấu hình client mặc định hiện tại.

Build dừng ngay nếu URL sai project, không phải HTTPS, key thiếu/placeholder,
hoặc key là loại đặc quyền/JWT. Không sửa `local.properties.example` rồi quên
đổi tên: đó không phải file Gradle đọc. Xóa các giá trị mẫu khỏi `local.properties`
cũ để dùng cấu hình mặc định; giữ dòng `sdk.dir` theo máy phát triển.

Toolchain được pin để tái lập build: Android Gradle Plugin 8.13.2, Gradle 8.13,
JDK 17, compile/target SDK 36, build tools 36.0.0. SDK 37 khai báo ban đầu
không có trên nguồn tải của runner trong lần kiểm tra ngày 05/09/2026;
bộ công cụ được chuyển sang SDK 36, vẫn hỗ trợ toàn bộ API app đang dùng. CI cài Gradle tường minh;
không giả định repo có `gradlew`. Local cần cài đúng Gradle rồi chạy:

```bash
python3 scripts/check-android-production.py
cd mobile/android
gradle --no-daemon :app:verifyProductionConfiguration :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

## 3. Kiểm tra trên máy trẻ

Mở **Chẩn đoán kết nối → Kiểm tra API**. Báo cáo hiển thị phiên bản/commit,
project, cấu hình, token có/không, heartbeat thật gần nhất, quyền Trợ năng,
số ứng dụng được chọn, trạng thái Study Lock và mã lỗi đã làm sạch.
Nút sao chép không chứa token, key, mã ghép, tên trẻ hoặc nội dung học tập.

Probe đọc public auth settings để kiểm tra key, rồi gửi một mã rỗng không hợp lệ
đến `device-agent`. Phản hồi HTTP 400 đúng thông báo là kết quả probe mong đợi.
Probe không dùng mã thật, không tạo thiết bị, không poll hoặc nhận lệnh thay service.
**API tới được không đồng nghĩa database, ghép nối hoặc chặn ứng dụng đã thành công.**
Chỉ poll thật từ service mới cập nhật heartbeat và xác nhận token phía server.

| Mã lỗi | Việc cần kiểm tra |
|---|---|
| CONFIG_URL / CONFIG_KEY | Cấu hình build; không cài APK thiếu/sai cấu hình |
| DNS / TIMEOUT / NETWORK / TLS | Wi-Fi/dữ liệu di động, DNS, ngày giờ và HTTPS |
| API_AUTH | Publishable key đúng project; `device-agent` giữ `verify_jwt=false` |
| ENDPOINT | Edge Function `device-agent` đã deploy đúng project |
| PAIRING_CODE | Tạo mã Android mới, nhập đủ 16 ký tự trong 10 phút |
| PAIRING_CONFLICT | Mã đã dùng hoặc mã dành cho iOS; tạo lại đúng Android |
| DEVICE_AUTH | Server xác nhận token bị thu hồi/không tồn tại; ghép lại |
| PERMISSION | Bật Trợ năng và chọn ít nhất một ứng dụng cần chặn |
| BACKGROUND / BACKGROUND_TIMEOUT | Android không cho chạy nền hoặc đã hết quota; mở app và kiểm tra heartbeat |

Lỗi mạng hoặc 401 từ gateway không xóa token. Chỉ phản hồi 401 xác định rõ
thiết bị không được ghép/đã bị thu hồi mới xóa thông tin ghép tại máy và bỏ chặn.

## 4. Nghiệm thu với hai thiết bị thật

1. Cài pilot trên Android của trẻ; API probe phải qua. Mở web phụ huynh cùng project.
2. Chọn đúng bé → Study Lock → Android → tạo mã mới; nhập vào companion, không vào PWA.
3. Trên web, thiết bị phải chuyển `pairing → active`. Trong Diagnostics phải có
   heartbeat gần đây; không chỉ có dòng “Token trên máy: Có”.
4. Bật Trợ năng, chọn một ứng dụng giải trí; bắt đầu buổi học. Kiểm tra ứng dụng
   đó bị chắn nhưng cuộc gọi/ứng dụng không chọn vẫn dùng được.
5. Hoàn thành buổi học → phụ huynh duyệt; kiểm tra bỏ chắn và acknowledgement.
6. Thử sai mã, mã hết hạn, mã iOS, thu hồi thiết bị, mất mạng và mở app lại.
   Thiết bị phải bỏ chặn khi heartbeat hết hạn; không kẹt Study Lock.

CI chưa thay thế các bước trên. Dịch vụ hiện dùng polling 15 giây và dataSync
foreground service; Android áp quota chạy nền. Handler timeout mới dừng an toàn,
không biến polling thành cơ chế chạy 24/7. Phát hành rộng cần tiếp tục FCM/lịch
cục bộ, kiểm thử tiết kiệm pin/OEM và quy trình khai báo Accessibility/consent.

## 5. Bản release ký chính thức

Trong repository Settings → Secrets and variables → Actions, lưu bốn secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Keystore phải do người phụ trách phát hành nắm giữ,
có backup an toàn; không đưa vào Git hoặc gửi trong chat.

Chọn **Run workflow → main → channel: release**. Workflow chỉ chấp nhận release
trên main, chạy kiểm tra, giải mã keystore vào runner tạm, build release không
debug, xác minh chữ ký APK rồi xóa keystore kể cả khi lỗi. Thiếu signing secrets
thì build release thất bại rõ ràng, không tự chuyển sang ký debug.

Bản release giữ application ID `app.genaifamily.device`. Cập nhật lên APK cũ
cần cùng khóa ký. Pipeline không tự tạo Play Console release hoặc tự phân phối
cho phụ huynh; artifact chỉ dành cho người có quyền truy cập repo.

## Tài liệu đối chiếu

- Supabase client API keys: https://supabase.com/docs/guides/api/api-keys
- AGP 8.13 compatibility: https://developer.android.com/build/releases/agp-8-13-0-release-notes
- Android service timeout: https://developer.android.com/develop/background-work/services/fgs/timeout
- Companion protocol: `mobile/README.md`; backend deployment: `docs/DEPLOYMENT_RUNBOOK.md`.

## Capacitor wrapper update

The current APK now bundles the web UI and native module into one app.
Use docs/CAPACITOR_WRAPPER.md for setup/build instructions; the historical
standalone companion/code-entry steps above apply only to version 0.2.x.
