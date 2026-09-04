# Báo cáo triển khai và nâng cấp dự án

Ngày cập nhật: 04/09/2026

## 1. Kết quả tổng quan

Đợt 1–4 đã được triển khai trong mã nguồn. Ứng dụng hiện có baseline database
độc lập, phân quyền server cho chế độ trẻ, mô hình occurrence cho lịch tuần,
Study Lock bắt buộc với mọi hoạt động học, quota AI, dispatch thiết bị có atomic
claim/retry, UI semantic, accessibility tests và CI đầy đủ. Lần đăng nhập đầu
hiển thị lựa chọn Ba/mẹ hoặc Trẻ; trạng thái hoàn tất và child-mode lock đều do
server quản lý, không phụ thuộc URL/localStorage.

Project Supabase mới đã nhận đủ migration, RLS, trigger, bucket và ba Edge
Function. Kênh companion Android/iOS đã thay provider giả bằng pairing/token,
delivery queue và acknowledgement thật. Phần còn lại trước khi phát hành là
cấu hình secret Gemini, tài khoản E2E, ký/cài companion lên thiết bị thật và
thêm FCM/APNs cho push production.

## 2. Đợt 1 — Ổn định và bảo mật

- [x] Tạo checkpoint Git phục hồi trước hardening.
- [x] Loại ZIP/script SQL cấp quyền rộng khỏi worktree và chặn `*.zip`.
- [x] Thêm Parent Gate xác minh lại bằng Supabase Auth.
- [x] Gắn child mode với JWT `session_id` ở database; local state/URL không thể
  tự khôi phục quyền ba/mẹ.
- [x] Thu hẹp grants/RLS; mutation nghiệp vụ đi qua RPC hẹp.
- [x] Thêm 99 assertion pgTAP cho parent, managed child, child identity,
  guardian, outsider và service role.
- [x] Viết README, `.env.example`, tắt seed mặc định.
- [x] Thêm baseline schema độc lập và kế hoạch tách khỏi project CRM.

## 3. Đợt 2 — Dữ liệu và độ tin cậy

### Đổi bé và truy vấn

- [x] `useAccountChildren` và `useFamilyData` dùng generation guard; response cũ
  không thể ghi đè dữ liệu của bé mới.
- [x] Reset view data ngay khi child scope thay đổi.
- [x] Initial query chỉ lấy cửa sổ cần cho màn hình hiện tại.
- [x] Lịch sử session dùng cursor/keyset pagination và nút “Tải thêm”.
- [x] Các query có limit cấu hình tập trung trong `src/config/appConfig.ts`.
- [x] Realtime được debounce và chỉ invalidate bảng/child scope liên quan.

### Cache và riêng tư

- [x] Không lưu `FamilyData`, câu trả lời, evidence hoặc device command vào
  local storage.
- [x] Chỉ giữ ID ngữ cảnh trong envelope có version và TTL.
- [x] Purge cache khi logout, hết hạn hoặc dữ liệu không hợp lệ.

### AI và thiết bị

- [x] Quota AI theo family/profile/ngày, claim atomic ở database.
- [x] Structured JSON schema và parser regression test cho Gemini output.
- [x] Model cấu hình bằng secret; mặc định Edge Function là
  `gemini-3.7-flash`.
- [x] Device command có idempotency key, atomic claim, lease hai phút,
  retry/backoff, timeout provider và trạng thái lỗi rõ ràng.
- [x] Client dispatch bất đồng bộ, không làm hỏng giao dịch buổi học nếu provider
  tạm lỗi.
- [x] Edge Function có batch worker dành riêng cho service role để gửi lại lệnh
  đến hạn và thu hồi lease bị treo.
- [x] Companion queue cho Android/iOS có mã ghép một lần, token 256-bit chỉ lưu
  dạng hash phía server, per-device delivery và acknowledgement.
- [x] Android companion có Keystore, chọn app cục bộ, Accessibility disclosure,
  shield và heartbeat fail-safe; iOS companion có Keychain, FamilyControls,
  ManagedSettings shield và background refresh.
- [ ] Cấu hình Cron gọi batch worker trên project staging/production; đây là
  bước hạ tầng có secret, không được hardcode vào repository.
- [x] Performance Advisor không còn warning/error sau migration index; các
  thông báo unused index là bình thường trên database chưa có dữ liệu.

## 4. Mô hình lịch và Study Lock

```text
schedule_events (mẫu tuần)
  └── schedule_occurrences (mỗi ngày áp dụng, rolling 42 ngày)
        └── learning_sessions (tiến trình thực tế)
              └── device_commands (lock/unlock idempotent)
```

- [x] Unique `(schedule_event_id, occurrence_date)` chống sinh trùng.
- [x] Cron materialize rolling window mỗi ngày.
- [x] Sửa/xóa template chỉ reconcile occurrence/session tương lai chưa bắt đầu;
  lịch sử hoàn thành được giữ nguyên.
- [x] Session liên kết bằng ID, không ghép theo tiêu đề/môn học.
- [x] Partial unique index chặn hai session `in_progress` cho cùng trẻ.
- [x] Server kiểm tra đúng ngày mới cho bắt đầu và tính duration từ
  `actual_started_at`.
- [x] Mọi activity học (`school`, `extra`, `self_study`) bắt buộc Study Lock;
  hoạt động khác không tạo learning session.
- [x] Timeout recovery đưa session về `awaiting_parent`, ghi audit event và tạo
  đúng một lệnh unlock.

## 5. Đợt 3 — UI và chất lượng mã nguồn

- [x] Màu/spacing/radius/shadow dùng token/class trong `src/style.css`; TSX không
  còn literal hex/rgb hoặc inline style.
- [x] Light/dark/system theme trong sidebar; nền child/parent dùng cùng token.
- [x] Icon giao diện dùng SVG từ Google Material Symbols theo từng icon, không
  tải font icon toàn bộ.
- [x] Lazy-load Parent Dashboard và Child App.
- [x] Tách repository thành types/shared/queries/mutations.
- [x] Tách draft model và preview khỏi Schedule Setup.
- [x] Dropdown có keyboard navigation, selected scroll, reposition; drawer,
  sheet và Parent Gate có focus trap/restore.
- [x] Form label, alert, nav `aria-label`/`aria-current` đã được bổ sung.
- [x] Axe WCAG A/AA chạy trong Playwright.
- [x] ESLint, React Hooks lint, Stylelint, migration parser, Vitest, Playwright,
  bundle budget và GitHub Actions CI đã được thêm.

## 6. Đợt 4 — Dependency

- [x] Giữ Node 22, khóa `>=22.12 <23` trong `engines`, `.nvmrc` dùng 22.
- [x] Dọn dependency không dùng, lockfile trùng và Material Symbols font lớn.
- [x] React/React DOM 19.2 và types tương ứng.
- [x] Supabase JS 2.115 và CLI 2.116.
- [x] Vite 8.2, plugin React 6.1 và Vitest 5.
- [x] Giữ TypeScript 5.9, không gộp major upgrade với database migration.
- [x] Google GenAI SDK 2.21 trong Edge Function sau khi thêm structured-output
  regression test.
- [x] `npm audit --omit=dev` không có advisory tại lần kiểm tra cuối.

## 7. Tiêu chí hoàn thành trước production

| Tiêu chí | Mã nguồn | Cần xác minh trên staging |
|---|---:|---:|
| Trẻ không vào/gọi mutation của ba/mẹ | Đạt | pgTAP cloud đạt; còn E2E UI |
| Một occurrence cho mỗi ngày áp dụng | Đạt | Chạy cron qua tuần |
| Sửa/xóa không phá lịch sử | Đạt | Test dữ liệu staging |
| Một session `in_progress` mỗi trẻ | Đạt | pgTAP cloud đạt |
| Study Lock tự phục hồi, không gửi trùng | Đạt | Pair/poll/ack cloud đạt; còn thiết bị thật |
| RLS đầy đủ mọi vai trò | 99 test đã viết | 99/99 đạt trên cloud |
| Không còn policy/grant demo rộng | Đạt | Advisor + pgTAP đạt |
| Dữ liệu nhạy cảm không ở localStorage | Đạt | Browser inspection |
| Onboarding/Save/đổi bé/multi-tab/Parent Gate/Study Lock E2E | 7 flow xác thực + 2 regression công khai | Chạy full với test account |
| Build trong bundle budget | Đạt trong local check | CI production build |
| README/migration/env/runbook đồng nhất | Đạt | Ops review |

## 8. Lệnh xác minh bắt buộc

```bash
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e

npx supabase start
npx supabase db reset --local
npx supabase test db
```

Kết quả local ngày 04/09/2026:

- `npm run check`: đạt; 14 test files/38 tests đạt, 28 migration parse được,
  production build và bundle budget đạt (tổng JavaScript gzip 188.222 byte).
- `npm run test:e2e`: 2 flow public/mobile/accessibility đạt; 7 flow xác thực được
  skip đúng thiết kế vì chưa cấp test account và `E2E_ALLOW_DATA_MUTATION`.
- `npm audit --omit=dev`: 0 vulnerability.
- 99 assertion pgTAP/RLS đã chạy trực tiếp trên project mới: 99 đạt, 0 lỗi.
- Project cloud có 23 bảng `public`, 15 public trigger, 36 public routine,
  23 public RLS policy, 28 migration và không có bảng
  ứng dụng nào tắt RLS.
- `generate-week-plan` và `dispatch-device-command` dùng JWT;
  `device-agent` tắt gateway JWT nhưng bắt buộc mã ghép entropy cao hoặc header
  `Device` token tự xác thực. Smoke test pair → poll → acknowledge đạt và fixture
  cloud đã được dọn sạch.

Security Advisor cảnh báo các public RPC dùng `SECURITY DEFINER`; đây là các RPC
nghiệp vụ chủ đích, có kiểm tra quyền nội bộ và đã qua pgTAP. Hai bảng nội bộ
`private.app_device_modes` và `private.account_app_onboarding` đã bật RLS, không
cấp DML cho `anon` hoặc `authenticated`; onboarding chỉ truy cập qua RPC hẹp.

Hai E2E public/accessibility/regression chạy không cần tài khoản. Bảy flow xác thực chỉ chạy
khi có biến `E2E_*` và `E2E_ALLOW_DATA_MUTATION=true` để tránh vô tình sửa dữ
liệu thật. CI database tự dựng account test cô lập.

## 9. Việc vận hành không tự động thực hiện từ repository

- Đăng nhập/link Supabase CLI khi cần thao tác cloud từ terminal; project hiện
  đã được cấu hình qua kết nối Supabase trực tiếp.
- Backup, chuyển dữ liệu thật và Auth users khỏi project CRM.
- Thiết lập Gemini secret; FCM/APNs và Cron dispatch chỉ cần cho push/webhook
  production, companion polling không phụ thuộc provider ngoài.
- Xin Apple Family Controls entitlement, ký/cài iOS; build/cài Android và hoàn
  thành khai báo Accessibility API trên Play Console.
- Chạy Security/Performance Advisors và thử restore backup.
- Đổi environment production và phê duyệt cutover/rollback.

Quy trình chi tiết nằm trong
[`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md) và
[`docs/SUPABASE_PROJECT_ISOLATION.md`](docs/SUPABASE_PROJECT_ISOLATION.md).
