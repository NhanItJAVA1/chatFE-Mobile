# Chat FE - Frontend Application

Ứng dụng chat frontend được xây dựng với **Vite + React 18 + Tailwind CSS + JavaScript**.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16
- npm hoặc yarn

### Installation

```bash
cd FE
npm install
```

### Development Server

```bash
npm run dev
```

Mở trình duyệt: `http://localhost:5173`

### Build Production

```bash
npm run build
npm run preview  # Preview production build locally
```

---

## 📁 Project Structure

```
FE/
├── public/                         # Static assets
├── src/
│   ├── components/
│   │   ├── auth/                  # Auth components (LoginForm, RegisterForm)
│   │   ├── search/                # Search friends components
│   │   ├── contacts/              # Contacts list component (Friends + Add)
│   │   ├── chat/                  # Chat list component
│   │   ├── layout/                # Layout components (MainLayout, Sidebar)
│   │   └── common/                # Reusable UI components
│   ├── pages/
│   │   ├── LoginPage.jsx          # Login page
│   │   ├── RegisterPage.jsx       # Register page
│   │   ├── HomePage.jsx           # Dashboard/Main page
│   │   ├── SearchFriendsPage.jsx  # Search friends page
│   │   ├── FriendRequestsPage.jsx # Friend requests management
│   │   └── FriendsPage.jsx        # Friends list page (legacy)
│   ├── context/
│   │   └── AuthContext.jsx        # Global auth state (login/logout/user/profile)
│   ├── hooks/
│   │   └── useAuth.js             # Hook để access AuthContext
│   ├── services/
│   │   ├── api.js                 # Base API client với Auth + cache config
│   │   ├── authService.js         # Auth functions (login, register, getProfile)
│   │   └── friendService.js       # Friend API functions (search, add, list, etc.)
│   ├── utils/
│   │   └── helpers.js             # Utility functions
│   ├── constants/
│   │   └── index.js               # App constants
│   ├── styles/
│   │   └── globals.css            # Global styles (Tailwind CSS)
│   ├── App.jsx                    # Main app + routing
│   └── main.jsx                   # Entry point
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example                   # Environment variables template
└── index.html
```

---

## 🔐 Authentication

### Login Flow

1. User nhập phone + password
2. Call `POST /v1/auth/login`
3. Backend trả về token + user data
4. Frontend lưu token vào `localStorage` (key: `"token"`)
5. Tự động gọi `GET /v1/profile` để lấy displayName
6. Token tự động attach vào `Authorization` header cho all requests

### Register Flow

1. User nhập form (phone, email, username, displayName, password)
2. Call `POST /v1/auth/register`
3. Success → Redirect to `/login`
4. Đăng nhập với tài khoản vừa tạo

### Protected Routes

- Routes: `/`, `/search-friends`, `/friend-requests`, `/friends`
- Yêu cầu authentication
- Non-auth users → redirect to `/login`

### Auto Login

- Khi app mount, AuthContext tự động check localStorage
- Nếu có token → call `GET /v1/profile` để restore user session
- User không cần login lại khi reload page

---

## 🎯 Key Features

### 1. **Authentication** ✅

- Register tài khoản mới
- Login bằng phone + password
- Auto-login khi reload (persist token)
- Logout
- Fetch displayName từ `/profile` endpoint

### 2. **Friend Management** ✅

- Tìm kiếm user bằng phone
- Gửi lời mời kết bạn
- Quản lý lời mời (Accept/Decline/Cancel)
- Xem danh sách bạn bè (populate từ friendship + user profile)
- Xóa bạn (Unfriend)

### 3. **UI/UX** ✅

- **3-Column Layout**: Sidebar | Left Panel | Right Panel (Telegram-style)
- **Sidebar Menu**: Profile, All Chats, Contacts, Calls, Saved Messages, Night Mode, Settings, Logout
- **Dynamic Left Panel**: Switch giữa ChatList hoặc Contacts
- **Dark Mode**: Toggle via Night Mode switch
- **Responsive**: Mobile + Tablet + Desktop
- **Real-time Search**: Filter contacts by name/phone

---

## 🔗 API Endpoints Used

### Auth (`/v1/auth`)

- `POST /v1/auth/register` - Register
- `POST /v1/auth/login` - Login
- `GET /v1/profile` - Get current user profile

### Users (`/v1/users`)

- `GET /v1/users/search?phone={phone}` - Search user by phone
- `GET /v1/users/{id}` - Get user profile by ID

### Friends (`/v1/friend-requests`, `/v1/friendships`)

- `POST /v1/friend-requests/{receiverId}` - Send friend request
- `GET /v1/friend-requests/received` - Get received requests
- `GET /v1/friend-requests/sent` - Get sent requests
- `PATCH /v1/friend-requests/{requestId}` - Accept/Decline request (with body: `{ status: "accepted" | "declined" }`)
- `DELETE /v1/friend-requests/{requestId}` - Cancel request
- `GET /v1/friendships` - Get friends list (params: `skip`, `limit`)
- `DELETE /v1/friendships/{friendId}` - Unfriend

### Response Format

```json
{
  "status": "success",
  "msg": "OK",
  "data": { ... }
}
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env.local` (copy from `.env.example`):

```env
VITE_API_URL=http://localhost:3000/v1
```

### Important Settings

**localStorage keys:**

- `token` - Auth token (automatically set by `authService.login()`)
- `user` - User data (automatically managed by AuthContext)

**API Base URL:**

- Backend: `http://localhost:3000`
- API Base: `http://localhost:3000/v1`

**Cache Policy:**

- HTTP: `cache: "no-store"` - Prevent 304 responses
- All GET requests bypass browser cache

---

## 🛠️ Tech Stack

| Technology       | Purpose                      |
| ---------------- | ---------------------------- |
| **Vite**         | Fast build tool & dev server |
| **React 18**     | UI framework with hooks      |
| **React Router** | Client-side routing          |
| **Tailwind CSS** | Utility-first CSS            |
| **JavaScript**   | Pure JS (no TypeScript)      |
| **localStorage** | Auth token persistence       |

---

## 💻 Common Tasks

### Add New Page + Route

1. Create `src/pages/NewPage.jsx`
2. Add route in `src/App.jsx`:
   ```jsx
   {
     path: "/new-path",
     element: <NewPage />,
     requireAuth: true  // if protected
   }
   ```
3. Use in routing or sidebar

### Add New API Function

1. Add function in `src/services/friendService.js`
2. Use `api.get()`, `api.post()`, etc.:
   ```jsx
   const response = await api.post("/endpoint", { data });
   // Returns: { status, msg, data }
   return response.data; // Extract data
   ```

### Create Component

1. Create `src/components/folder/ComponentName.jsx`
2. Create `src/components/folder/index.js`:
   ```jsx
   export { default } from "./ComponentName";
   ```
3. Import and use

### Access Auth Data

```jsx
import { useAuth } from "../hooks/useAuth";

export const MyComponent = () => {
  const { user, token, logout, login } = useAuth();

  return (
    <div>
      User: {user?.displayName}
      Logged in: {!!token}
    </div>
  );
};
```

---

## 🐛 Troubleshooting

### Token Not Sent to Backend

**Issue**: Requests show 401 Unauthorized

**Solution**:

- Check localStorage: `console.log(localStorage.getItem("token"))`
- Verify `api.js` getAuthToken() uses key `"token"` (not `"auth"`)
- Clear cache: `localStorage.clear()` then re-login

### "User Not Found" in Search

**Issue**: Search returns "User not found" even though user exists

**Causes**:

- Phone format wrong (must be 10 digits: 0912345678)
- User doesn't exist in backend database
- Try different phone number

**Solution**:

- Check backend has user with that phone
- Verify phone number format
- Check Network tab → GET request status + response

### CORS Errors

**Issue**: "has been blocked by CORS policy"

**Solution**:

- Backend must enable CORS for `http://localhost:5173`
- Check backend CORS headers
- Verify API endpoint is correct

### Dark Mode Not Toggle

**Issue**: Night Mode switch doesn't change theme

**Solution**:

- Check Tailwind CSS has `class` dark mode enabled
- Verify `tailwind.config.js` has `darkMode: "class"`
- Hard refresh browser (Ctrl+Shift+R)

---

## 📚 For Next Developer / Session

### Key Things to Know

1. **Auth Token**: Stored in localStorage with key `"token"` (not `"auth"`)
2. **API Response**: Apps return `{ status, msg, data }`
3. **Protected Routes**: Any new route should use `requireAuth: true` if protected
4. **Current User**: Get via `useAuth().user` hook
5. **3-Column Layout**: Sidebar + Left Panel (toggles) + Right Panel
6. **Friends Data**: Fetched from `/friendships` + `/users/{id}` endpoints

### To Extend Features

1. Read `chatBE/docs/` to understand API structure
2. Add API functions to `src/services/`
3. Create components in `src/components/`
4. Add pages in `src/pages/`
5. Update `src/App.jsx` routing
6. Test using existing pages (search, requests, friends)

### Project Status

- ✅ Auth (Login/Register/Profile)
- ✅ Friend Search
- ✅ Friend Requests (Send/Accept/Decline)
- ✅ Friends List
- ✅ UI (Telegram-style 3-column)
- ⏳ Chat Messaging (Ready for implementation)
- ⏳ Chat History (Ready for implementation)

---

## 📞 Quick Reference

| What         | Where               | Example                                           |
| ------------ | ------------------- | ------------------------------------------------- |
| API calls    | `src/services/*.js` | `api.get("/users/search", { params: { phone } })` |
| Auth hook    | `useAuth()`         | `const { user, token } = useAuth()`               |
| Global state | `AuthContext.jsx`   | User + token persistence                          |
| Routes       | `App.jsx`           | Protected + public routes                         |
| Components   | `src/components/`   | Reusable UI                                       |
| Pages        | `src/pages/`        | Full page views                                   |

---

**Made with ❤️ | Happy Coding! 🚀**
