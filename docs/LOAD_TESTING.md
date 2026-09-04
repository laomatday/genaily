# Kiểm thử tải 200 tài khoản

Bộ harness này mô phỏng **200 tài khoản khác nhau**, mỗi tài khoản có một hồ
sơ trẻ riêng. Pha chuẩn bị đăng nhập được tách khỏi pha tải; khi workload bắt
đầu, 200 tài khoản cùng mở dashboard qua RPC snapshot, tương ứng 200 request
cho một lượt tải. Chế độ `legacy` vẫn có để so sánh với luồng cũ gồm 16 request
song song mỗi dashboard, tức khoảng 3.200 request cho 200 tài khoản.

Supabase khuyến nghị chạy load test trên staging và nêu k6 như một lựa chọn.
Repository chưa phụ thuộc k6; harness dùng Node 22 và `@supabase/supabase-js`
đang có sẵn để kết quả tái lập được bằng `npm ci`.

Tài liệu Supabase liên quan:

- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Database monitoring](https://supabase.com/docs/guides/database/inspect)

## Quy tắc an toàn

- Ưu tiên Supabase local hoặc một project staging riêng, tuyệt đối không dùng
  project production.
- Remote target bị từ chối trừ khi đồng thời có
  `LOAD_TEST_ALLOW_REMOTE=true`, `LOAD_TEST_ENVIRONMENT=staging` và
  `LOAD_TEST_CONFIRM_HOST` khớp chính xác hostname đích.
- Service-role key chỉ dùng trong script seed; runner dùng publishable key và
  đăng nhập từng tài khoản nên mọi request vẫn đi qua RLS.
- Email parent/child luôn mang prefix `genaily-loadtest-<run-id>`; cleanup chỉ
  tìm đúng tập email synthetic của run hiện tại.
- Seed lặp lại dùng lại đúng Auth user/account space/child đã có và xác nhận cả
  ba ID là duy nhất cho từng tài khoản. Cleanup hợp nhất account space từ cả
  membership và `families.created_by`, xóa account space trước để các hàng có
  `family_id` cascade, sau đó xóa child/parent profile, cuối cùng mới xóa Auth
  user; script đọc lại cả ba lớp và báo lỗi nếu còn bản ghi.
- Mutation lịch mặc định tắt. Chỉ bật trên dữ liệu synthetic bằng
  `LOAD_TEST_MUTATE_SCHEDULE=true`.

## Chạy trên Supabase local

Máy phải có Docker. Supabase Auth local mặc định chỉ cho 30 lượt đăng nhập/
5 phút trên một IP; để pha tải 200 người không bị biến thành bài test rate
limit, tăng tạm `auth.rate_limit.sign_in_sign_ups` lên ít nhất 250 trong
`supabase/config.toml`, rồi khởi động lại Supabase. Không sao chép cấu hình nới
rate limit này sang production.

Harness mặc định cần migration
`20260904084139_optimize_dashboard_concurrency.sql`. Migration tạo RPC
`get_child_dashboard_snapshot`, giữ `SECURITY INVOKER`, giới hạn cửa sổ/limit,
cấp `EXECUTE` riêng cho `authenticated` và thu hồi `anon`. Khi bật mutation
lịch, cần thêm `20260904084247_concurrency_reliability_guards.sql`; runner gọi
`save_schedule_setup_v2` với `schedule_version` vừa đọc từ snapshot để kiểm tra
đúng luồng optimistic save của ứng dụng. Trước workload mutation, runner gửi
một payload sai kiểu có chủ đích và chỉ chấp nhận lỗi validation; preflight này
không ghi/xóa lịch. Chạy `db reset` hoặc `db push` vào staging trước khi test;
lỗi `PGRST202`/function-not-found là dấu hiệu migration hoặc schema cache chưa
sẵn sàng, không phải kết quả tải.

```bash
npx supabase start
npx supabase db reset --local
eval "$(npx supabase status -o env)"

export LOAD_TEST_SUPABASE_URL="$API_URL"
export LOAD_TEST_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export LOAD_TEST_PASSWORD="mật-khẩu-riêng-cho-load-test"
export LOAD_TEST_ACCOUNT_COUNT="200"
export LOAD_TEST_RUN_ID="local-200"

npm run seed:load
npm run test:load
```

Mặc định runner đo đúng đường đi production mới:

```bash
export LOAD_TEST_DASHBOARD_MODE="snapshot"
npm run test:load
```

Chỉ dùng chế độ sau để đo mức cải thiện so với fan-out cũ:

```bash
export LOAD_TEST_DASHBOARD_MODE="legacy"
npm run test:load
```

Kiểm thử đồng thời cả lưu và đọc lại lịch trên 200 account synthetic:

```bash
export LOAD_TEST_MUTATE_SCHEDULE="true"
npm run test:load
```

Mutation chỉ chạy một lượt và không được kết hợp với duration để tránh sinh dữ
liệu lịch/occurrence không giới hạn. Test này kiểm tra success path của optimistic
save trên 200 trẻ tách biệt; xung đột hai lần ghi cùng một trẻ được kiểm tra bằng
integration test, không phải workload này.

Mở đồng thời 200 kết nối Realtime, mỗi kết nối đăng ký đúng 10 nguồn thay đổi
như ứng dụng thật:

```bash
export LOAD_TEST_REALTIME="true"
npm run test:load
```

Realtime mặc định tắt, giống `VITE_REALTIME_ENABLED=false` của ứng dụng. Khi
tắt, frontend dùng fallback polling; harness chỉ đo request snapshot và không
mô phỏng timer polling nền. Khi bật, thời gian thiết lập channel được báo riêng
và không trừ vào duration của workload dashboard.

Giữ 200 tài khoản liên tục tải dashboard trong 60 giây (mỗi VU nghỉ theo
`LOAD_TEST_THINK_TIME_MS` giữa hai lượt):

```bash
export LOAD_TEST_DURATION_SECONDS="60"
export LOAD_TEST_MUTATE_SCHEDULE="false"
npm run test:load
```

Xóa toàn bộ account synthetic thuộc đúng run ID:

```bash
export LOAD_TEST_ALLOW_CLEANUP="true"
npm run seed:load -- cleanup
```

## Chạy trên staging từ xa

Ngoài các biến ở trên, bắt buộc khai báo:

```bash
export LOAD_TEST_ALLOW_REMOTE="true"
export LOAD_TEST_ENVIRONMENT="staging"
export LOAD_TEST_CONFIRM_HOST="YOUR_STAGING_REF.supabase.co"
```

Kiểm tra/nới Auth rate limit của staging trước pha chuẩn bị. Một runner đi qua
cùng một IP có thể nhận HTTP 429; đó là rate limiter hoạt động, không phải lỗi
Postgres/RLS. Không tắt CAPTCHA hay nới rate limit production để chạy test.

## Ngưỡng và kết quả

Runner trả exit code khác 0 nếu một VU lỗi, bất kỳ operation nào vượt error
rate, hoặc p95 vượt ngưỡng. Các biến điều chỉnh:

- `LOAD_TEST_MAX_ERROR_RATE` — mặc định `0.01`.
- `LOAD_TEST_DASHBOARD_MODE` — mặc định `snapshot`; `legacy` chỉ để đối chiếu.
- `LOAD_TEST_DASHBOARD_P95_MS` — mặc định `2500` ms.
- `LOAD_TEST_SCHEDULE_P95_MS` — mặc định `3000` ms.
- `LOAD_TEST_DURATION_SECONDS` — mặc định `0`; giá trị lớn hơn `0` chạy workload
  đến deadline (tối đa `1800` giây) và bỏ qua số iteration.
- `LOAD_TEST_ITERATIONS` — mặc định `1`, chỉ dùng khi duration bằng `0`.
- `LOAD_TEST_AUTH_CONCURRENCY` — mặc định `20`, chỉ áp dụng pha đăng nhập.
- `LOAD_TEST_THINK_TIME_MS` — mặc định `250` ms giữa các iteration.
- `LOAD_TEST_REALTIME` — mặc định `false`; bật để giữ 200 channel trong workload.
- `LOAD_TEST_REALTIME_TIMEOUT_MS` — mặc định `10000` ms.

JSON stdout chứa p50/p95/p99/max, error rate theo từng bảng/RPC, thời gian auth,
preflight, thiết lập Realtime, tổng thời gian workload và throughput. Trong lúc
test staging, theo dõi Database Reports,
`pg_stat_statements`, lock contention, Auth 429, PostgREST 5xx, Realtime
connections và CPU/RAM/IO. Chạy ít nhất ba lần: warm-up, đo chính thức và xác
nhận sau tối ưu.
