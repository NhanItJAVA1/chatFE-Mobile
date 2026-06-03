# Auth OTP Flow Context

Tài liệu này ghi lại luồng đăng ký, đăng nhập và xác thực email OTP sau các thay đổi ở frontend web. Mobile có thể dùng làm context để triển khai tương đương.

## Mục Tiêu

- Đăng ký xong chuyển sang màn xác thực email OTP.
- Đăng nhập tài khoản chưa xác thực email thì chuyển sang màn xác thực OTP.
- Sau khi xác thực email thành công thì quay lại màn đăng nhập, không vào thẳng trang chính.
- Thông báo trạng thái dùng Toast, không hiển thị alert lỗi/thành công dạng box trong form OTP.
- Không tự động resend OTP theo countdown. Người dùng chủ động bấm gửi lại.
- Quên mật khẩu dùng OTP reset password, sau khi reset thành công phải xóa token/session local và bắt người dùng đăng nhập lại.

## API Sử Dụng

### Đăng Ký

`POST /v1/auth/register`

Frontend gửi kèm:

```json
{
  "phone": "0971484472",
  "password": "password",
  "email": "user@example.com",
  "displayName": "User",
  "sendVerificationEmail": true
}
```

Sau khi đăng ký thành công:

- Hiển thị Toast thành công.
- Điều hướng sang màn verify email.
- Truyền email, phone, displayName qua navigation state/context nếu nền tảng hỗ trợ.

### Lấy Email Chưa Xác Thực Theo Số Điện Thoại

`GET /v1/auth/unverified-email?phone=0971484472`

Response:

```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "email": "voan2068@gmail.com"
  }
}
```

Dùng trong luồng đăng nhập khi API login báo email chưa xác thực nhưng response lỗi không có email.

### Gửi OTP Lần Đầu

`POST /v1/auth/send-verification`

Request:

```json
{
  "email": "phuong.boss@example.com"
}
```

Dùng khi vừa chuyển sang màn verify từ luồng đăng nhập chưa xác thực. Không dùng endpoint resend cho lần đầu vào màn.

### Gửi Lại OTP Thủ Công

`POST /v1/auth/resend-verification`

Request:

```json
{
  "email": "phuong.boss@example.com"
}
```

Chỉ gọi khi người dùng bấm nút `Gửi lại mã OTP`.

Không có countdown tự động và không tự gọi lại endpoint này.

### Xác Thực OTP

`POST /v1/auth/verify-email`

Request đúng:

```json
{
  "email": "phuong.boss@example.com",
  "code": "123456"
}
```

Lưu ý: API yêu cầu field `code`, không phải `otp`.

Sau khi xác thực thành công:

- Hiển thị Toast thành công.
- Điều hướng về màn đăng nhập.
- Không tự động vào trang chính.

### Quên Mật Khẩu - Gửi OTP Reset Password

`POST /v1/auth/forgot-password`

Request:

```json
{
  "email": "phuong.boss@example.com"
}
```

Response thành công:

```json
{
  "message": "Verification code has been sent to your email",
  "expiresIn": 300
}
```

Lưu ý:

- OTP reset password hết hạn sau 300 giây.
- Backend giới hạn 5 request/giờ cho mỗi email.
- Mobile nên hiển thị countdown 5 phút theo `expiresIn`.
- Không tự động resend OTP. Người dùng chủ động bấm gửi lại.

### Quên Mật Khẩu - Xác Thực OTP Reset

`POST /v1/auth/verify-reset-otp`

Request đúng:

```json
{
  "email": "phuong.boss@example.com",
  "otp": "123456"
}
```

Lưu ý: reset password OTP dùng field `otp`, khác với verify email dùng field `code`.

Response thành công:

```json
{
  "data": {
    "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 300
  },
  "message": "OTP verified successfully"
}
```

Lưu ý:

- OTP phải là chuỗi 6 chữ số.
- Backend cho tối đa 3 lần nhập sai; quá số lần sẽ invalid OTP và phải xin mã mới.
- Sau khi verify OTP thành công, dùng `tempToken` để đặt mật khẩu mới.
- Nên khóa/ẩn chỉnh sửa OTP sau khi đã nhận `tempToken`, tránh người dùng đổi OTP nhưng token vẫn là token của mã đã verify trước đó.

### Quên Mật Khẩu - Gửi Lại OTP Reset

`POST /v1/auth/resend-reset-otp`

Request:

```json
{
  "email": "phuong.boss@example.com"
}
```

Response thành công:

```json
{
  "message": "Verification code has been resent to your email",
  "expiresIn": 300
}
```

Nếu gửi lại thành công:

- Clear OTP đang nhập.
- Clear `tempToken` cũ nếu có.
- Reset countdown theo `expiresIn`.
- Toast báo đã gửi mã mới và yêu cầu dùng mã mới nhất.

### Quên Mật Khẩu - Đặt Mật Khẩu Mới

`POST /v1/auth/reset-password`

Request khuyến nghị cho mobile:

```json
{
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "NewPassword123!"
}
```

Response thành công:

```json
{
  "data": {
    "success": true
  },
  "message": "Password has been reset successfully"
}
```

Lưu ý:

- `newPassword` dài 6-128 ký tự.
- Backend cũng hỗ trợ field `token` cho legacy email-link flow, nhưng mobile nên dùng `tempToken`.
- Sau khi reset password thành công, backend invalid toàn bộ session. Mobile phải xóa local token/session và điều hướng về màn login.

## Luồng 1: Đăng Ký Tài Khoản

1. Người dùng nhập tên hiển thị, email, số điện thoại, mật khẩu, xác nhận mật khẩu.
2. Người dùng đồng ý điều khoản.
3. Gọi `POST /auth/register` với `sendVerificationEmail: true`.
4. Nếu thành công:
   - Toast: đăng ký thành công, kiểm tra email để nhập OTP.
   - Chuyển sang màn verify email.
   - Email được điền sẵn từ form đăng ký.
5. Người dùng nhập mã OTP.
6. Gọi `POST /auth/verify-email` với `{ email, code }`.
7. Nếu thành công:
   - Toast xác thực thành công.
   - Chuyển về màn đăng nhập.

## Luồng 2: Đăng Nhập Tài Khoản Chưa Verify Email

1. Người dùng nhập số điện thoại và mật khẩu.
2. Gọi `POST /auth/login`.
3. Nếu login trả lỗi email chưa xác thực, ví dụ message `Email is not verified`:
   - Không hiển thị lỗi đỏ trong form login.
   - Toast cảnh báo email chưa xác thực.
   - Chuyển sang màn verify email.
4. Nếu lỗi login có email thì dùng email đó.
5. Nếu lỗi login không có email:
   - Gọi `GET /auth/unverified-email?phone=...`.
   - Điền email lấy được vào input email.
6. Khi có email trên màn verify:
   - Gọi `POST /auth/send-verification` một lần để gửi OTP.
   - Không gọi `resend-verification` ở bước này.
7. Người dùng nhập OTP.
8. Gọi `POST /auth/verify-email` với `{ email, code }`.
9. Nếu thành công:
   - Toast xác thực thành công.
   - Chuyển về màn đăng nhập.

## Luồng Gửi Lại OTP

1. Người dùng đang ở màn verify email.
2. Người dùng bấm `Gửi lại mã OTP`.
3. Gọi `POST /auth/resend-verification`.
4. Nếu thành công:
   - Clear ô nhập OTP hiện tại để tránh dùng mã cũ.
   - Toast báo mã mới đã gửi, dùng mã mới nhất.
5. Nếu thất bại:
   - Chỉ Toast lỗi.
   - Không hiển thị alert box trong form.

## Luồng 3: Quên Mật Khẩu

1. Người dùng vào màn quên mật khẩu.
2. Người dùng nhập email.
3. Validate email ở client:
   - Không rỗng.
   - Đúng định dạng email cơ bản.
4. Gọi `POST /auth/forgot-password` với `{ email }`.
5. Nếu thành công:
   - Toast báo OTP đã gửi.
   - Clear OTP/reset token cũ.
   - Chuyển sang bước nhập OTP.
   - Bắt đầu countdown từ `expiresIn` hoặc fallback 300 giây.
6. Người dùng nhập OTP.
7. Validate OTP ở client:
   - Không rỗng.
   - Chỉ gồm 6 chữ số.
   - Countdown chưa hết hạn.
8. Gọi `POST /auth/verify-reset-otp` với `{ email, otp }`.
9. Nếu thành công:
   - Lưu `tempToken`.
   - Toast báo OTP hợp lệ.
   - Chuyển sang bước nhập mật khẩu mới.
   - Khóa input OTP hoặc không cho sửa OTP ở bước này.
10. Người dùng nhập mật khẩu mới và xác nhận mật khẩu.
11. Validate mật khẩu:
   - Không rỗng.
   - Tối thiểu 6 ký tự.
   - Xác nhận mật khẩu khớp.
12. Gọi `POST /auth/reset-password` với `{ tempToken, newPassword }`.
13. Nếu thành công:
   - Toast báo đặt lại mật khẩu thành công.
   - Clear access token, refresh token, user/session local.
   - Điều hướng về màn đăng nhập.

## Luồng Gửi Lại OTP Reset Password

1. Người dùng đang ở bước nhập OTP reset password.
2. Người dùng bấm `Gửi lại OTP`.
3. Gọi `POST /auth/resend-reset-otp` với `{ email }`.
4. Nếu thành công:
   - Clear OTP hiện tại.
   - Clear `tempToken` hiện tại nếu có.
   - Reset countdown theo `expiresIn`.
   - Toast báo mã mới đã gửi.
5. Nếu thất bại:
   - Toast lỗi.
   - Không hiển thị alert box trong form.

## Quy Tắc Toast Và Lỗi

- Đăng ký thành công: Toast success.
- Đăng ký thất bại: Toast error.
- Đăng nhập thành công: Toast success.
- Đăng nhập thất bại: Toast error.
- Login tài khoản chưa verify: Toast warning/info và chuyển verify.
- Gửi OTP thành công: Toast info/success.
- Gửi OTP thất bại hoặc rate limit: Toast error.
- Verify thành công: Toast success.
- Verify thất bại: Toast error.
- Forgot password gửi OTP thành công: Toast success/info.
- Forgot password gửi OTP thất bại hoặc rate limit: Toast error.
- Verify reset OTP thành công: Toast success.
- Verify reset OTP thất bại, hết hạn hoặc quá số lần thử: Toast error.
- Reset password thành công: Toast success và chuyển về login.
- Reset password thất bại: Toast error.

Màn verify email và quên mật khẩu không hiển thị box lỗi/thành công lớn trong form. Chỉ giữ lỗi field nhỏ dưới input nếu backend trả lỗi validation theo field.

## Lưu Ý Kỹ Thuật

- Các request public auth như register, login, send verification, resend verification, verify email phải bỏ qua auth token.
- Nếu gặp HTTP 401 ở request public, không được tự refresh token vì người dùng có thể chưa đăng nhập.
- Khi verify email, payload phải là `{ email, code }`.
- Khi verify reset password OTP, payload phải là `{ email, otp }`.
- Khi reset password bằng OTP, payload phải là `{ tempToken, newPassword }`.
- Nếu resend OTP, mã cũ có thể không còn hợp lệ. Nên clear input OTP sau resend.
- Nên chặn auto gửi OTP lặp cho cùng email trong một phiên màn hình để tránh tạo nhiều mã liên tiếp làm mã email cũ bị invalid.
- Sau khi reset password thành công, xóa access token, refresh token và user/session local vì backend invalid toàn bộ session.
- Không nên clear toàn bộ local storage nếu còn dữ liệu không liên quan auth như device id; chỉ clear các key auth/session.
