# genAi Family

Ứng dụng React giúp một tài khoản ba/mẹ quản lý nhiều hồ sơ trẻ, lịch học và
sinh hoạt, tiến độ buổi học, Parent Gate và Study Lock.

## Kiến trúc hiện tại

- React 19.2, TypeScript 5.9 và Vite 8.
- Supabase Auth, Postgres/RLS, Realtime, Storage và Edge Functions.
- Mỗi tài khoản ba/mẹ có một account space nội bộ; bảng `families` chỉ còn là
  tenant kỹ thuật để giữ tương thích khóa ngoại.
- Trẻ là managed profile. Khi chuyển sang Góc của bé, server ghi chế độ trẻ theo
  Auth session; các RPC của ba/mẹ bị từ chối cho tới khi xác minh lại mật khẩu.
- `schedule_events` lưu mẫu tuần, `schedule_occurrences` lưu từng lần xuất hiện,
  còn `learning_sessions` lưu tiến trình thực tế.
- Ảnh đại diện của trẻ nằm trong bucket private `child-avatars`, chỉ dùng signed
  URL ngắn hạn và được phân quyền theo đúng account space/hồ sơ trẻ.

## Yêu cầu

- Node.js `>=22.12 <23` (đã khai báo trong `.nvmrc` và `package.json`).
- npm.
- Docker và Supabase CLI khi cần reset/test database local.

## Chạy frontend

```bash
nvm use
cp .env.example .env.local
npm ci
npm run dev
```

Điền URL và publishable key của project Supabase chuyên dụng vào `.env.local`.
Không đặt service-role key, Gemini key hoặc token nhà cung cấp thiết bị trong
biến có tiền tố `VITE_`.

## Database local

Migration baseline có thể dựng project genAi Family từ database Supabase rỗng;
seed mặc định bị tắt để không vô tình đưa dữ liệu thử vào production.

```bash
npx supabase start
npx supabase db reset --local
npx supabase test db
```

Không chạy `db reset` trên database chứa dữ liệu thật. Không đẩy baseline mới
vào project CRM cũ; hãy dùng project riêng theo
[`docs/SUPABASE_PROJECT_ISOLATION.md`](docs/SUPABASE_PROJECT_ISOLATION.md).

## Edge Functions

```bash
npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.7-flash
npx supabase functions deploy generate-week-plan
npx supabase functions deploy dispatch-device-command
npx supabase functions deploy device-agent --no-verify-jwt
```

`dispatch-device-command` hỗ trợ gửi một lệnh từ client và xử lý batch bằng
service role cho retry/tự phục hồi. Companion app dùng `device-agent` với mã
ghép/token riêng; tắt gateway JWT là chủ đích và mọi action thiết bị sau pairing
đều bắt buộc header `Authorization: Device <token>`. Webhook ngoài là tùy chọn;
cách build Android/iOS nằm tại [`mobile/README.md`](mobile/README.md). Cron gọi batch phải được cấu hình theo
[`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md); không nhúng
service-role key vào migration hay repository.

## Kiểm tra

```bash
npm run check
npm run test:e2e
npm audit --omit=dev
```

`npm run check` gồm ESLint, Stylelint, typecheck, parser PostgreSQL cho toàn bộ
migration, unit/integration tests, production build và bundle budget. Test E2E
đăng nhập có mutation chỉ chạy khi đặt `E2E_ALLOW_DATA_MUTATION=true` cùng bộ
biến E2E; script seed từ chối project từ xa nếu chưa cho phép rõ ràng.

CI còn reset database sạch, chạy 104 assertion pgTAP/RLS và tám luồng E2E quan
trọng: onboarding lần đầu, lưu lịch, đổi bé, đồng bộ nhiều tab, phần thưởng,
Parent Gate và Study Lock.

## Nguyên tắc bảo mật

- `anon` không được đọc/ghi dữ liệu ứng dụng.
- Browser không ghi trực tiếp các bảng workflow; mutation đi qua RPC hẹp.
- RLS và RPC đều kiểm tra tenant, vai trò và child scope trên server.
- Trạng thái giao lệnh thiết bị chỉ do service role cập nhật.
- Local storage chỉ giữ ID ngữ cảnh có version/TTL và bị purge khi logout; không
  lưu lịch sử học, câu trả lời, evidence hay device command.
- Evidence và avatar trẻ nằm trong bucket private, dùng signed URL ngắn hạn.

## Tài liệu

- [`PROJECT_REVIEW_AND_UPGRADE_PLAN.md`](PROJECT_REVIEW_AND_UPGRADE_PLAN.md): trạng thái các đợt nâng cấp và tiêu chí production.
- [`AUTH_IMPLEMENTATION.md`](AUTH_IMPLEMENTATION.md): mô hình xác thực/phân quyền.
- [`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md): triển khai, kiểm chứng và rollback.
- [`docs/SUPABASE_PROJECT_ISOLATION.md`](docs/SUPABASE_PROJECT_ISOLATION.md): tách khỏi project dùng chung.
