# Xác thực và phân quyền

## Mô hình danh tính

- Một tài khoản Supabase Auth của ba/mẹ sở hữu một account space nội bộ.
- Một tài khoản có thể quản lý nhiều managed child profile.
- Managed child không có mật khẩu hoặc `auth.users` riêng.
- `families` là ranh giới tenant kỹ thuật, không còn là thực thể người dùng phải
  thêm, đổi hoặc chọn trên giao diện.

## Chế độ trẻ và Parent Gate

Khi ba/mẹ chọn Góc của bé, client gọi `public.enter_child_mode`. Database lưu
`family_id` và `child_profile_id` theo `session_id` trong JWT vào bảng private.
Từ thời điểm đó:

- RPC mutation của ba/mẹ bị `private.is_family_parent` từ chối.
- Child workflow chỉ được chạy cho đúng hồ sơ trẻ đã chọn.
- Không thể đổi sang anh/chị/em khác trong cùng child-mode session.
- URL hoặc local storage không thể tự nâng quyền trở lại ba/mẹ.

Để quay lại, Parent Gate yêu cầu mật khẩu. `signInWithPassword` tạo Auth session
mới; mật khẩu không được ứng dụng lưu. Session mới chưa có child-mode record nên
quyền ba/mẹ được khôi phục sau xác minh thực sự trên server.

Đây là ranh giới cho thiết bị dùng chung hiện tại. Nếu sau này trẻ có tài khoản
riêng, RLS đã hỗ trợ child identity chỉ thao tác trên chính hồ sơ của mình.

## Ma trận quyền

| Vai trò | Đọc lịch/tiến độ trẻ | Child workflow | Mutation quản lý | Delivery thiết bị |
|---|---:|---:|---:|---:|
| Ba/mẹ, parent mode | Có | Có | Có, qua RPC | Không |
| Managed child mode | Đúng trẻ | Đúng trẻ | Không | Không |
| Child Auth identity | Chính mình | Chính mình | Không | Không |
| Guardian/thành viên khác | Hạn chế | Không | Không | Không |
| Người ngoài/`anon` | Không | Không | Không | Không |
| Edge service role | Theo tác vụ server | Không dùng | Không dùng | Có |

## Lớp bảo vệ database

- Browser chỉ có các grant cần thiết; bảng workflow không cho ghi trực tiếp.
- Public RPC là wrapper hẹp, kiểm tra role/tenant/child scope trước khi gọi phần
  triển khai trong schema `private`.
- Hàm `security definer` dùng `search_path = ''` và tên đối tượng đầy đủ schema.
- Các hàm private và RPC delivery bị thu hồi `EXECUTE` khỏi browser roles.
- `schedule_occurrences` và AI quota chỉ được hệ thống tạo/cập nhật.
- Một partial unique index chặn hai session `in_progress` cho cùng trẻ.
- Device command dùng atomic claim, lease, retry/backoff và idempotency key.

Các điều kiện này được kiểm thử trong
[`supabase/tests/family_access_rls.test.sql`](supabase/tests/family_access_rls.test.sql)
cho ba/mẹ, trẻ, guardian, người ngoài và service role.

## Local storage và evidence

Ứng dụng chỉ lưu envelope ngữ cảnh gồm ID account space/trẻ, version và TTL bảy
ngày. Toàn bộ cache bị purge khi logout hoặc khi envelope sai/hết hạn. Lịch sử,
quick-check, evidence path và lệnh thiết bị không được cache vào local storage.

Bucket `learning-evidence` là private. Đọc dùng signed URL có hạn; upload và gắn
evidence phải khớp family/session/child trên server.

## Secrets

Browser chỉ nhận:

```dotenv
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
```

Gemini key, provider token và service role chỉ tồn tại ở Supabase Edge Runtime.
Xem cấu hình đầy đủ trong
[`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md).
