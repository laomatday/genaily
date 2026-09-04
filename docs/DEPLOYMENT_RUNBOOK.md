# Deployment runbook

## 1. Điều kiện trước triển khai

- Dùng project Supabase riêng cho genAi Family; không `db push` baseline vào
  project CRM cũ.
- Chọn đúng region, backup/retention và người chịu trách nhiệm rollback.
- Node khớp `.nvmrc`; working tree đã qua `npm ci && npm run check`.
- Có provider sandbox nhận `lock`/`unlock` và tôn trọng `idempotency_key`.

## 2. Kiểm chứng local hoặc staging sạch

```bash
npx supabase start
npx supabase db reset --local
npx supabase test db

eval "$(npx supabase status -o env)"
export E2E_SUPABASE_URL="$API_URL"
export E2E_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export E2E_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_ALLOW_DATA_MUTATION="true"
npm run seed:e2e
npm run test:e2e
```

Kết quả bắt buộc: migration reset sạch, 119 pgTAP assertion đạt và tám E2E có
mutation không bị skip.

## 3. Áp dụng staging

```bash
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy generate-week-plan
npx supabase functions deploy dispatch-device-command
npx supabase functions deploy device-agent --no-verify-jwt
npx supabase secrets set \
  GEMINI_API_KEY=... \
  GEMINI_MODEL=gemini-3.7-flash \
  AI_GENERATION_MAX_CONCURRENCY=4 \
  AI_GENERATION_LEASE_TTL_SECONDS=90 \
  GEMINI_REQUEST_TIMEOUT_MS=45000 \
  AI_GENERATION_RETRY_AFTER_SECONDS=10
```

Chỉ cấu hình `DEVICE_CONTROL_WEBHOOK_URL` và `DEVICE_CONTROL_WEBHOOK_TOKEN` nếu
dùng thêm provider MDM ngoài; companion Android/iOS không cần hai secret này.

Sau khi push, chạy Supabase Security Advisor và Performance Advisor. Xác nhận
`anon` không có privilege trên bảng ứng dụng, browser không có mutation trực
tiếp và `service_role` là role duy nhất gọi được RPC delivery.

### Giới hạn đồng thời AI

Migration `limit_ai_generation_concurrency` tạo semaphore trong schema
`private`. Edge Function xác thực user trước, sau đó dùng `service_role` lấy
lease; RPC kiểm tra lại active parent và active child. Chỉ request có lease mới
đọc bốn nhóm dữ liệu prompt, trừ quota ngày và gọi Gemini. Mặc định toàn project
có bốn slot; request tiếp theo nhận `429 AI_GENERATION_BUSY` và header
`Retry-After: 10`.

- `AI_GENERATION_MAX_CONCURRENCY`: `1..16`, mặc định `4`.
- `AI_GENERATION_LEASE_TTL_SECONDS`: `30..300`, mặc định `90`.
- `GEMINI_REQUEST_TIMEOUT_MS`: `5000..120000`, mặc định `45000`; runtime tự
  hạ timeout để luôn thấp hơn TTL ít nhất 10 giây.
- `AI_GENERATION_RETRY_AFTER_SECONDS`: `1..60`, mặc định `10`.

Không grant hai RPC lease cho `anon`/`authenticated` và không đưa
`SUPABASE_SERVICE_ROLE_KEY` vào file env frontend. Khi test burst ở staging,
xác nhận không quá số slot cấu hình có `lease_token`, request bận không làm tăng
`ai_usage_windows`, và mọi slot trở về rỗng sau khi request hoàn tất hoặc TTL
hết.

## 4. Worker giao lệnh thiết bị

Client gửi lệnh mới ngay lập tức. Để retry khi app đã đóng và để lệnh unlock do
timeout luôn được gửi, cấu hình Supabase Cron gọi Edge Function mỗi phút bằng
service-role JWT lưu trong Vault. Không đưa key vào migration hoặc Git.

Ví dụ chạy trong SQL Editor của đúng project sau khi thay tên secret, URL được
lấy từ Vault thay vì viết trực tiếp vào job:

```sql
create extension if not exists pg_net;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'genai_family_project_url'
);
select vault.create_secret(
  'YOUR_SERVICE_ROLE_JWT',
  'genai_family_service_role_jwt'
);

select cron.schedule(
  'genai-family-device-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'genai_family_project_url'
    ) || '/functions/v1/dispatch-device-command',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'genai_family_service_role_jwt'
      )
    ),
    body := '{"batch":true,"limit":10}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

Kiểm tra `cron.job_run_details`, `net._http_response` và bảng
`device_commands`. Provider phải trả HTTP 2xx; `{ "acknowledged": true,
"id": "..." }` sẽ đánh dấu acknowledged, còn 2xx khác là sent. Lỗi được retry
theo backoff và `max_attempts`; cùng một session/command giữ một idempotency key.

Không log request header của job vì chứa service-role JWT. Xoay secret ngay nếu
key xuất hiện trong log hoặc ticket.

## 5. Smoke test staging

1. Đăng ký một tài khoản mới; xác nhận màn hình chọn Ba/mẹ/Trẻ chỉ xuất hiện
   một lần, sau đó thêm hai bé với hai cấp học khác nhau.
2. Đổi bé liên tục; tên, lịch và tiến độ không được lẫn.
3. Lưu lịch có trường/học thêm/tự học và hoạt động khác; kiểm tra thứ tự giờ.
4. Thử lưu hoạt động học không bật Study Lock; server phải từ chối.

5. Kiểm tra occurrence của các ngày/tuần tiếp theo và không có duplicate.
6. Vào Góc của bé; thử gọi RPC lưu lịch hoặc đổi sang bé khác, phải bị từ chối.
7. Bắt đầu buổi học, reload, hoàn thành, duyệt; provider nhận đúng một lock và
   một unlock.
8. Mô phỏng provider lỗi/timeout, chờ Cron retry; kiểm tra lease không gửi trùng.
9. Kiểm tra evidence private, signed URL hết hạn và local storage không chứa dữ
   liệu học tập.
10. Kiểm tra light/dark/system, keyboard/focus trap và mobile viewport.

### Companion app Android/iOS

Migration `managed_device_companion` thêm `managed_devices` và
`device_command_deliveries`, đều bật FORCE RLS và không cho client ghi trực tiếp.
Edge Function `device-agent` phải deploy với `verify_jwt=false` vì nó xác thực bằng
token thiết bị riêng; mọi action trừ `pair` bắt buộc header
`Authorization: Device <token>`. `dispatch-device-command` vẫn bật JWT và ưu tiên
hàng đợi companion trước webhook MDM tùy chọn.

Các bước build/cấp quyền trên thiết bị nằm tại [`mobile/README.md`](../mobile/README.md).

## 6. Production cutover

- Backup project nguồn và thử restore trước cửa sổ cutover.
- Chuyển dữ liệu theo ID ổn định; đối soát số hàng theo tenant và foreign key.
- Triển khai migration/functions/secrets/scheduler như staging.
- Chạy smoke test bằng dữ liệu synthetic, sau đó đổi frontend URL/publishable key.
- Theo dõi Auth error, RPC error, Cron, Edge Function, device failures và AI quota.
- Không xóa dữ liệu ở project cũ cho tới hết thời gian đối soát/retention.

## 7. Rollback

- Nếu lỗi frontend: trả deployment/env về bản trước.
- Nếu Edge Function lỗi: deploy lại version trước; hàng đợi vẫn giữ lệnh chưa gửi.
- Nếu migration lỗi: dừng traffic và phục hồi backup đã kiểm chứng. Không sửa
  production bằng cách chạy lại script SQL cũ hoặc grant rộng.
- Nếu Study Lock có nguy cơ không mở: ngắt provider lock automation, phát lệnh
  unlock qua quy trình khẩn cấp của provider và lưu audit sự cố.
