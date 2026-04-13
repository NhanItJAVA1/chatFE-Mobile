# Hướng dẫn hiện thực Module Bạn bè & Lời mời kết bạn (Frontend)

Tài liệu này hướng dẫn cách tích hợp các API và Socket.io cho tính năng bạn bè trong ứng dụng Chat.

## 1. Lời mời kết bạn (Friend Requests)

### 1.1 Gửi lời mời kết bạn
- **Endpoint**: `POST /friend-requests/:receiverId`
- **Mô tả**: Gửi một lời mời kết bạn mới tới người dùng có `receiverId`.
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "request_id",
      "status": "pending"
    }
  }
  ```

### 1.2 Cập nhật trạng thái lời mời
- **Endpoint**: `PATCH /friend-requests/:requestId`
- **Body**:
  ```json
  {
    "status": "accepted" | "rejected" | "canceled"
  }
  ```
- **Mô tả**: 
    - `accepted`: Chấp nhận kết bạn.
    - `rejected`: Từ chối lời mời.
    - `canceled`: Người gửi hủy lời mời.

### 1.3 Lấy danh sách lời mời đã nhận
- **Endpoint**: `GET /friend-requests/received?page=1&limit=20`
- **Response**:
  ```json
  {
    "data": {
      "items": [...],
      "total": 10,
      "page": 1,
      "limit": 20,
      "hasMore": false
    }
  }
  ```

### 1.4 Lấy danh sách lời mời đã gửi
- **Endpoint**: `GET /friend-requests/sent?page=1&limit=20`

### 1.5 Kiểm tra trạng thái lời mời
- **Endpoint**: `GET /friend-requests/check/:targetUserId`
- **Mô tả**: Kiểm tra xem giữa bạn và người dùng đó đang có lời mời nào không.

---

## 2. Bạn bè (Friendships)

### 2.1 Lấy danh sách bạn bè
- **Endpoint**: `GET /friendships?cursor=&limit=20&sortBy=newest`
- **Mô tả**: Sử dụng cursor pagination để lấy danh sách bạn bè.
- **Response**:
  ```json
  {
    "data": {
      "items": [...],
      "nextCursor": "...",
      "hasMore": true
    }
  }
  ```

### 2.2 Hủy kết bạn
- **Endpoint**: `DELETE /friendships/:friendId`

### 2.3 Lấy bạn chung
- **Endpoint**: `GET /users/:id/mutual-friends?limit=20`

### 2.4 Gợi ý kết bạn
- **Endpoint**: `GET /users/:id/suggestions?limit=20`

---

## 3. Thông báo thời gian thực (Socket.io)

### 3.1 Kết nối
- **Namespace**: `/friends`
- **Xác thực**: Gửi JWT token qua `auth.token`.
  ```javascript
  const socket = io('/friends', {
    auth: { token: 'YOUR_JWT_TOKEN' }
  });
  ```

### 3.2 Các sự kiện nhận từ Server (Lắng nghe)
Hầu hết các sự kiện đều trả về payload có dạng:
```json
{
  "type": "STRING_TYPE",
  "data": { ... },
  "timestamp": "ISO_DATE"
}
```

- `friend_request:received`: Khi có người gửi lời mời cho bạn.
- `friend_request:accepted`: Khi người kia chấp nhận lời mời của bạn.
- `friend_request:rejected`: Khi người kia từ chối lời mời của bạn.
- `friend_request:canceled`: Khi người kia hủy lời mời đã gửi cho bạn.
- `friendship:unfriended`: Khi bạn bị ai đó xóa khỏi danh sách bạn bè.

---

## 4. Các trạng thái (Enums)

### FriendRequestStatus
- `pending`: Đang chờ xử lý.
- `accepted`: Đã chấp nhận.
- `rejected`: Đã từ chối.
- `canceled`: Đã hủy.
