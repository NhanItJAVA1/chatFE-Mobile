# Mobile Auth Flow Guide (Login / Register / Logout / Forgot Password)

Tài liệu này mô tả **luồng gọi API thực tế theo code FE hiện tại** để team mobile có thể bám theo nhanh.

---

## 1) Tổng quan nhanh

### Base URL

- Theo backend docs: `http://localhost:3000/v1`
- FE hiện tại có 2 kiểu gọi:
  - `fetch` trực tiếp qua `src/shared/services/authService.js` (dùng cho Login/Register/Logout qua `AuthContext`)
  - `axios` qua `src/api/axios-instance.js` + `src/services/auth.service.js` (đang dùng cho Forgot Password)

### Response Envelope chuẩn backend

```json
{
  "status": "success",
  "msg": "OK",
  "data": {},
  "meta": {}
}
```

Lỗi:

```json
{
  "status": "error",
  "msg": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": {}
}
```

---

## 2) Luồng Register

### FE call stack

1. `RegisterForm.jsx` gọi `useAuth().register(userData)`
2. `AuthContext.register(...)` gọi `src/shared/services/authService.js -> register(...)`
3. API gọi `POST /auth/register`

### Request body

```json
{
  "phone": "+84901234567",
  "password": "123456",
  "email": "optional@example.com",
  "displayName": "optional"
}
```

### FE xử lý sau khi thành công

- Trả response về `RegisterForm`
- `RegisterPage` điều hướng về `/login`
- **Không tự login ngay**

---

## 3) Luồng Login

### FE call stack

1. `LoginForm.jsx` gọi `useAuth().login(phone, password)`
2. `AuthContext.login(...)` gọi `src/shared/services/authService.js -> login(phone, password)`
3. API gọi `POST /auth/login`
4. Sau khi có token, `AuthContext` gọi tiếp `GET /profile`

### Request body

```json
{
  "phone": "+84901234567",
  "password": "123456"
}
```

### FE xử lý sau khi thành công

- Lưu `token` vào `localStorage` key: `token`
- Lưu profile vào `localStorage` key: `user`
- Set state:
  - `token`
  - `user`
  - `isAuthenticated = true`
- Điều hướng về `/`

### Lưu ý cho mobile

- Flow hiện tại coi `token` là auth chính.
- Refresh token flow **chưa đi qua `AuthContext` cũ** (vì `AuthContext` đang dùng `fetch` service cũ).

---

## 4) Luồng Logout

### FE call stack

1. `useAuth().logout()`
2. `AuthContext.logout()` gọi `src/shared/services/authService.js -> logout()`

### FE xử lý

- Xóa `localStorage.token`
- Xóa `localStorage.user`
- Reset state:
  - `user = null`
  - `token = null`
  - `isAuthenticated = false`

### Lưu ý

- Flow logout trong context cũ là local-only (không gọi server logout endpoint).

---

## 5) Luồng Forgot Password

### FE call stack (flow mới)

1. `ForgotPasswordForm.jsx` lấy input `identifier`
2. Tự build payload:
   - có `@` -> `{ email }`
   - còn lại -> `{ phone }`
3. Gọi `src/services/auth.service.js -> forgotPassword(payload)`
4. Service gọi `axiosInstance.post('/auth/forgot-password', payload, { skipAuth: true })`

### Endpoint

- `POST /auth/forgot-password`

### FE xử lý UI

- Loading: `Đang gửi...`
- Thành công: hiển thị message hướng dẫn kiểm tra email/SMS
- Thất bại: parse message từ `error.message` / `error.msg` / `error.response.data.msg`

---

## 6) Interceptor & Security (flow axios mới)

`src/api/axios-instance.js` hiện có:

1. Request interceptor

- Tự gắn `Authorization: Bearer <token>` nếu không có `skipAuth`

2. Response interceptor

- Nếu success envelope -> trả về `data`
- Nếu lỗi `code = UNAUTHORIZED`:
  - clear token/session
  - phát event `auth:session-expired`
  - redirect `/login`

3. Refresh token (401)

- Khi gặp 401, thử gọi `POST /auth/refresh-token`
- Nếu refresh ok -> retry request cũ
- Nếu fail -> clear session và redirect login

---

## 7) Mapping nhanh cho mobile implementation

### Nên thống nhất 1 service layer

Hiện FE đang có **2 layer auth song song**:

- Layer A (cũ): `src/shared/services/authService.js` + `AuthContext`
- Layer B (mới): `src/services/auth.service.js` + `axios-instance.js`

Để mobile dễ maintain, nên chọn 1 hướng:

1. Dùng toàn bộ theo layer mới (axios + interceptor + refresh token), hoặc
2. Nếu giữ layer cũ thì phải tự implement thêm refresh token/error envelope tương đương.

### Keys lưu local hiện tại

- access token: `token`
- refresh token: `refreshToken` (chỉ xuất hiện trong flow axios mới)
- user profile: `user`

---

## 8) Sequence rút gọn

### Login

`UI -> AuthContext.login -> authService(fetch).login -> POST /auth/login -> save token -> GET /profile -> save user -> Home`

### Register

`UI -> AuthContext.register -> authService(fetch).register -> POST /auth/register -> Login page`

### Logout

`UI -> AuthContext.logout -> clear local token/user -> Login`

### Forgot Password

`UI -> auth.service(axios).forgotPassword -> POST /auth/forgot-password -> show success/error message`

---

## 9) File tham chiếu chính

- `src/shared/context/AuthContext.jsx`
- `src/shared/services/authService.js`
- `src/services/auth.service.js`
- `src/api/axios-instance.js`
- `src/web/components/auth/LoginForm.jsx`
- `src/web/components/auth/RegisterForm.jsx`
- `src/web/components/auth/ForgotPasswordForm.jsx`
- `.github/agents/docs/frontend-api.md`
