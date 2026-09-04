# Báo cáo ổn định và kiểm thử đồng thời — 2026-09-04

## Kết luận

Ứng dụng đã được tối ưu và gia cố để **sẵn sàng chạy bài test 200 tài
khoản**. Chưa thể chứng nhận tải 200 tài khoản trên hạ tầng thật trong lần chạy
này vì workspace không có Docker/Supabase local và chưa có project staging kèm
service-role key. Harness chủ động từ chối chạy vào project remote nếu không
xác nhận chính xác đó là staging.

Không sử dụng kết quả preflight một tài khoản để suy diễn rằng 200 tài khoản đã
đạt. Bài test chính thức phải chạy theo `docs/LOAD_TESTING.md` trên staging có
cấu hình tương đương production.

## Thay đổi ảnh hưởng trực tiếp tới tải

- Dashboard dùng một RPC snapshot nhất quán thay cho 16 request song song:
  200 tài khoản tạo 200 request mỗi lượt, thay vì khoảng 3.200 request.
- Realtime mặc định tắt và chuyển sang polling 30 giây có nhận biết trạng thái
  tab. Supabase Free chỉ có đúng 200 kết nối Realtime, không đủ dự phòng cho tab
  hoặc thiết bị thứ hai.
- Các đợt invalidation được gộp thành một request đang chạy và tối đa một
  request nối đuôi; React StrictMode không còn làm treo loading.
- Lịch sử phiên học được phân trang; snapshot vẫn giữ phiên `in_progress` hoặc
  `awaiting_parent` dù phiên đó nằm ngoài trang gần nhất.
- Lưu lịch dùng version + advisory lock. API cũ không còn quyền cho client, nên
  hai editor không thể âm thầm ghi đè nhau.
- Hàng đợi lệnh thiết bị được claim nguyên tử, lọc retry trước `LIMIT`; heartbeat
  chỉ ghi tối đa một lần mỗi 60 giây.
- Sinh kế hoạch AI dùng semaphore toàn project, mặc định tối đa bốn request;
  request dư nhận `429` và lease tự hết hạn nếu Edge isolate bị dừng.
- Materializer lịch chỉ sửa dữ liệu thay đổi và bù 7 ngày cuối của cửa sổ thay
  vì viết lại toàn bộ 42 ngày mỗi đêm.
- Chuyển tài khoản/trẻ và pagination/mutation cũ không còn được phép ghi state
  vào context mới.

## Kết quả đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| ESLint, Stylelint, hardcode audit, TypeScript | Đạt |
| Migration parser | 35 file đạt |
| Unit/integration | 24 file, 71 test đạt |
| pgTAP/RLS trên DB thật trong transaction rollback | 119/119 đạt; không còn fixture |
| Mobile Playwright công khai | 3 đạt |
| Mobile Playwright cần tài khoản E2E | 8 skip do chưa cấu hình credentials staging |
| Production build + bundle budget | Đạt; tổng JavaScript gzip 189.710 byte |
| Snapshot dưới role `authenticated` thật | Đạt; khoảng 25–27 ms, 3,3–3,8 KB trên dữ liệu thưa |
| `device-agent` | ACTIVE v3; request chưa ghép trả đúng HTTP 401 |
| `dispatch-device-command` | ACTIVE v4 |
| `generate-week-plan` | ACTIVE v3; gateway từ chối request thiếu JWT |

## Bài test 200 tài khoản còn phải chạy

1. Tạo Supabase local bằng Docker hoặc project staging riêng.
2. Cấu hình các biến `LOAD_TEST_*` theo `docs/LOAD_TESTING.md`.
3. Chạy `npm run seed:load`, sau đó chạy warm-up, đo chính thức và chạy xác
   nhận lại bằng `npm run test:load`.
4. Chạy riêng ba profile: snapshot đọc, lưu lịch synthetic và Realtime. Không
   bật Realtime 200 kết nối trên gói Free để làm tiêu chí production.
5. Đạt khi error rate không quá 1%, dashboard p95 không quá 2.500 ms và lưu
   lịch p95 không quá 3.000 ms; đồng thời không có Auth 429, lock wait kéo dài,
   PostgREST 5xx hoặc dữ liệu chéo tài khoản.

## Rủi ro còn mở

- Supabase Auth leaked-password protection vẫn đang tắt.
- Dữ liệu hiện tại quá ít để đánh giá query plan ở quy mô production.
- 8 E2E đăng nhập/ghi dữ liệu cần account staging chuyên dụng.
- Test companion Study Lock cần thiết bị Android/iOS thật; HTTP/DB chỉ xác nhận
  được protocol và hàng đợi, không xác nhận được quyền hệ điều hành.

Tham khảo: [Supabase production load testing](https://supabase.com/docs/guides/deployment/going-into-prod),
[Realtime limits](https://supabase.com/docs/guides/realtime/reports), và
[password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
