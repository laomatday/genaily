# Kế hoạch cô lập Supabase project

## Quyết định đề xuất

Tạo một Supabase project riêng cho genAi Family trước production. Không tiếp tục
lưu dữ liệu trẻ em trong project đang dùng chung với CRM.

Lợi ích chính:

- Giảm phạm vi ảnh hưởng của migration, trigger, RLS và sự cố vận hành.
- Không cần giữ logic bootstrap CRM trong trigger tạo tài khoản.
- Có thể quản lý backup, retention, vùng dữ liệu và quyền vận hành riêng.
- Dễ kiểm thử `db reset`, RLS và khôi phục thảm họa từ một baseline độc lập.

## Phạm vi dữ liệu genAi Family

Các bảng và tài nguyên cần được xác minh trước khi chuyển:

- `families`, `profiles`, `family_members`, `family_settings`.
- `learning_goals`, `learning_sessions`, `session_events`, `session_tasks`.
- `quick_check_questions`, `quick_check_answers`.
- `schedule_events`, `exceptions`, `approvals`, `ai_plans`.
- `schedule_occurrences`, `ai_usage_windows` và private `app_device_modes`.
- `study_lock_events`, `device_commands`, `notifications`, `family_invites`.
- Storage bucket `learning-evidence` và các policy tương ứng.
- Edge Functions `generate-week-plan` và `dispatch-device-command`.

`profiles` ở project cũ là bảng dùng chung. Baseline chuyên dụng tại
`supabase/migrations/20260901000000_genai_family_baseline.sql` chỉ chứa các cột
và ràng buộc cần cho genAi Family, không sao chép schema CRM.

## Trình tự chuyển đổi

1. Tạo project staging riêng tại cùng region dự kiến cho production.
2. Reset project staging từ migration baseline genAi Family; không sao chép
   toàn bộ schema `public` của project dùng chung.
3. Áp dụng các migration mới hơn baseline, bao gồm hardening grants/RLS.
4. Tạo dữ liệu test không chứa thông tin thật và chạy toàn bộ pgTAP/RLS tests.
5. Tạo Storage bucket private, triển khai Edge Functions và cấu hình Cron cho
   device-command queue.
6. Cấu hình secrets trên project mới; không sao chép secret vào repository.
7. Đổi `.env.local` của staging sang URL và publishable key mới.
8. Chạy smoke test: đăng ký, thêm nhiều trẻ, lưu lịch, buổi tự học, minh chứng,
   phê duyệt và Study Lock.
9. Lập kế hoạch chuyển dữ liệu production theo ID ổn định và cửa sổ bảo trì.
10. Sau thời gian đối soát, thu hồi quyền và xóa dữ liệu genAi Family khỏi project
    CRM theo chính sách retention đã được phê duyệt.

## Auth và managed child

Hồ sơ trẻ hiện không có `auth.users`. Khi chuyển project, chỉ tài khoản phụ huynh
cần được tạo trong Supabase Auth; managed child được chuyển như dữ liệu ứng dụng.

Không sao chép trực tiếp password hash bằng script tùy ý. Nếu chưa có người dùng
production, cách an toàn nhất là yêu cầu đăng ký/xác nhận lại trên project mới.
Nếu đã có production, cần dùng quy trình Auth migration chính thức của Supabase.

## Điều kiện cutover

- Database mới có thể tạo lại hoàn toàn từ migration baseline.
- RLS tests đạt cho parent, child identity, thành viên khác và outsider.
- `anon` không có quyền đọc hoặc ghi bảng ứng dụng.
- `authenticated` không có quyền mutation trực tiếp trên bảng workflow.
- Tất cả public RPC đều có quyền `EXECUTE` rõ ràng và kiểm tra authorization.
- Backup/restore thử nghiệm thành công.
- Edge secrets, CORS origin và provider webhook đã được kiểm tra.
- Có rollback bằng cách trả frontend về URL/key cũ trong thời gian đối soát.

## Việc không thực hiện tự động trong repository

Tạo project, di chuyển người dùng, sao chép dữ liệu thật, đổi DNS/environment của
production và xóa dữ liệu cũ đều là thay đổi hạ tầng có ảnh hưởng bên ngoài. Các
bước này cần tài khoản Supabase có quyền quản trị, backup và phê duyệt cutover.
