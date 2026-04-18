# FE Integration Guide - Group Chat API

**Ngày cập nhật**: April 17, 2026  
**Phiên bản API**: v1  
**Base URL**: `http://localhost:3000/v1` (dev)

---

## 📋 Mục lục

1. [Tổng quan hệ thống](#tổng-quan-hệ-thống)
2. [HTTP Endpoints](#http-endpoints)
3. [Socket.IO Realtime Events](#socketio-realtime-events)
4. [Integration Flow](#integration-flow)
5. [Điểm lệch Docs vs Code](#điểm-lệch-docs-vs-code)
6. [Response Format](#response-format)
7. [Error Handling](#error-handling)

---

## 🏗️ Tổng quan hệ thống

### Kiến trúc API

- **HTTP REST** cho quản trị (CRUD group info, members, settings)
- **Socket.IO** (/messages namespace) cho tin nhắn realtime + events tức thời

### Authentication

- Tất cả request cần `Authorization: Bearer <JWT_TOKEN>` header
- Socket kết nối qua `auth.token` query parameter

### Base Path

```
/v1/...
```

---

## 🔌 HTTP Endpoints

### 1. Tạo nhóm chat

**Endpoint**
```
POST /v1/groups
```

**Headers**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "Nhóm Dev Team",
  "memberIds": ["user-uuid-1", "user-uuid-2"],
  "avatarUrl": "https://cdn.example.com/avatar.png"
}
```

**Validation Rules**
- `name`: required, 1-100 characters
- `memberIds`: required, **minimum 2 members** (total group = 3 persons including creator)
- `avatarUrl`: optional, must be valid URL

**Response (201 Created)**
```json
{
  "status": "success",
  "msg": "Created",
  "data": {
    "conversation": {
      "_id": "conv_uuid",
      "name": "Nhóm Dev Team",
      "type": "group",
      "avatarUrl": "https://...",
      "ownerId": "your-user-id",
      "admins": ["your-user-id"],
      "membersCount": 3,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z",
      "settings": {
        "allowSendLink": true,
        "requireApproval": false,
        "allowMemberInvite": true
      }
    },
    "members": [
      {
        "_id": "mem_uuid",
        "userId": "user-uuid-1",
        "role": "admin",
        "status": "active",
        "joinedAt": "2024-01-15T10:00:00Z"
      }
    ],
    "systemMessage": {
      "_id": "msg_uuid",
      "type": "SYSTEM",
      "text": "Nguyễn Văn A đã tạo nhóm",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Lưu ý**
- Creator sẽ tự động là owner + admin
- Các thành viên được thêm sẽ có role = member
- Nếu `requireApproval=true` khi tạo, các thành viên sẽ ở trạng thái pending (chưa active)

---

### 2. Lấy danh sách Conversation (inbox)

**Endpoint**
```
GET /v1/conversations/cursor?cursor=<next_cursor>&limit=20
```

**Query Parameters**
- `cursor`: optional, dùng để phân trang (từ response trước)
- `limit`: optional, default 20, max 100

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": [
    {
      "_id": "conv_uuid",
      "name": "Nhóm Dev Team",
      "type": "group",
      "avatarUrl": "https://...",
      "unreadCount": 5,
      "role": "admin",
      "lastMessage": {
        "text": "Chào mọi người",
        "createdAt": "2024-01-15T11:00:00Z"
      },
      "lastMessageTimeFormatted": "11:00",
      "lastMessageStatus": "read"
    }
  ],
  "meta": {
    "hasMore": true,
    "nextCursor": "cursor_string"
  }
}
```

**Lưu ý**
- Response bao gồm cả group lẫn private conversation
- Danh sách đã được sort theo thời gian tin nhắn mới nhất
- UnreadCount là số tin chưa đọc của user trong conversation đó

---

### 3. Lấy chi tiết nhóm

**Endpoint**
```
GET /v1/groups/:groupId/info
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "conversation": {
      "_id": "conv_uuid",
      "name": "Nhóm Dev Team",
      "type": "group",
      "avatarUrl": "https://...",
      "ownerId": "owner-uuid",
      "admins": ["admin-uuid-1", "admin-uuid-2"],
      "membersCount": 15,
      "createdAt": "2024-01-01T00:00:00Z",
      "settings": {
        "allowSendLink": true,
        "requireApproval": false,
        "allowMemberInvite": true
      }
    },
    "members": [
      {
        "_id": "mem_uuid",
        "userId": "user-uuid",
        "role": "admin",
        "status": "active",
        "joinedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "currentUserRole": "admin",
    "settings": {
      "allowSendLink": true,
      "requireApproval": false,
      "allowMemberInvite": true
    }
  }
}
```

---

### 4. Lấy danh sách thành viên nhóm

**Endpoint**
```
GET /v1/groups/:groupId/members
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "members": [
      {
        "_id": "mem_uuid",
        "userId": "user-uuid",
        "name": "Nguyễn Văn A",
        "avatar": "https://...",
        "role": "admin",
        "status": "active",
        "joinedAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### 5. Cập nhật tên/ảnh nhóm

**Endpoint**
```
PUT /v1/groups/:groupId
```

**Request Body**
```json
{
  "name": "Tên nhóm mới",
  "avatarUrl": "https://cdn.example.com/new-avatar.png"
}
```

**Validation**
- `name`: 1-100 characters
- `avatarUrl`: must be valid URL

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "_id": "conv_uuid",
    "name": "Tên nhóm mới",
    "avatarUrl": "https://...",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

**Permission**
- Chỉ admin hoặc owner được update

---

### 6. Thêm thành viên vào nhóm

**Endpoint**
```
POST /v1/groups/:groupId/members
```

**Request Body**
```json
{
  "memberIds": ["user-uuid-1", "user-uuid-2"]
}
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "newMembers": [
      {
        "_id": "mem_uuid",
        "userId": "user-uuid-1",
        "role": "member",
        "status": "active|pending",
        "joinedAt": "2024-01-15T12:00:00Z"
      }
    ]
  }
}
```

**Lưu ý**
- Nếu `settings.requireApproval=true`, thành viên mới sẽ ở status `pending`
- Nếu `settings.allowMemberInvite=false`, API sẽ trả 403 (chỉ admin mới được thêm)
- Các user đã có trong nhóm sẽ bị skip

---

### 7. Xóa/Kick thành viên

**Endpoint**
```
DELETE /v1/groups/:groupId/members/:userId
```

**Response (204 No Content)**

**Permission**
- Admin có thể xóa member
- Member có thể tự rời nhóm (userId = chính mình)

**Restriction**
- Không thể xóa owner
- Không thể xóa admin cuối cùng nếu nhóm vẫn có members

---

### 8. Rời nhóm

**Endpoint**
```
POST /v1/groups/:groupId/leave
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": { "success": true }
}
```

**Lưu ý**
- Owner không được leave (phải transfer owner trước)
- Sẽ post system message "User đã rời nhóm"

---

### 9. Set/Unset Admin

**Endpoint**
```
POST /v1/groups/:groupId/set-admin
```

**Request Body**
```json
{
  "targetUserId": "user-uuid",
  "isAdmin": true
}
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "_id": "conv_uuid",
    "admins": ["admin-1", "admin-2"]
  }
}
```

**Permission**
- Chỉ owner được đổi quyền admin

---

### 10. Chuyển quyền owner

**Endpoint**
```
POST /v1/groups/:groupId/transfer-owner
```

**Request Body**
```json
{
  "newOwnerId": "user-uuid"
}
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "_id": "conv_uuid",
    "ownerId": "new-owner-uuid",
    "oldOwnerId": "old-owner-uuid"
  }
}
```

**Lưu ý**
- Chỉ owner hiện tại được transfer
- Người nhận phải là member của nhóm
- Cả owner cũ + mới sẽ là admin

---

### 11. Cập nhật settings nhóm

**Endpoint**
```
PATCH /v1/groups/:groupId/settings
```

**Request Body**
```json
{
  "allowSendLink": true,
  "requireApproval": false,
  "allowMemberInvite": true
}
```

**Settings Explanation**
- `allowSendLink`: cho phép gửi link trong tin nhắn
- `requireApproval`: member mới cần admin duyệt mới active
- `allowMemberInvite`: allow member tự thêm người (không chỉ admin)

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "settings": {
      "allowSendLink": true,
      "requireApproval": false,
      "allowMemberInvite": true
    }
  }
}
```

**Permission**
- Chỉ admin được update

---

### 12. Lấy danh sách thành viên pending

**Endpoint**
```
GET /v1/groups/:groupId/members/pending
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "pendingMembers": [
      {
        "_id": "mem_uuid",
        "userId": "user-uuid",
        "name": "Phạm Thị F",
        "avatar": "https://...",
        "status": "pending",
        "requestedAt": "2024-01-15T10:00:00Z"
      }
    ]
  }
}
```

---

### 13. Phê duyệt thành viên pending

**Endpoint**
```
PATCH /v1/groups/:groupId/members/:userId/approve
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "member": {
      "_id": "mem_uuid",
      "userId": "user-uuid",
      "role": "member",
      "status": "active",
      "joinedAt": "2024-01-15T12:00:00Z"
    }
  }
}
```

**Permission**
- Chỉ admin được approve

---

### 14. Từ chối thành viên pending

**Endpoint**
```
PATCH /v1/groups/:groupId/members/:userId/reject
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK"
}
```

---

### 15. Giải tán nhóm

**Endpoint**
```
DELETE /v1/groups/:groupId
```

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "Group dissolved successfully"
}
```

**Permission**
- Owner hoặc admin có thể giải tán
- Sẽ xóa hết member + message + group

---

### 16. Gửi tin nhắn (HTTP Fallback)

**Endpoint**
```
POST /v1/conversations/:conversationId/messages
```

**Request Body**
```json
{
  "text": "Xin chào mọi người",
  "media": [
    {
      "url": "https://cdn.example.com/image.jpg",
      "filename": "image.jpg",
      "mimetype": "image/jpeg",
      "size": 123456
    }
  ]
}
```

**Media Schema**
```
{
  "url": string (required),
  "filename": string (required),
  "mimetype": string (required, e.g., "image/jpeg", "video/mp4"),
  "size": number (required, bytes)
}
```

**Response (201 Created)**
```json
{
  "status": "success",
  "msg": "Created",
  "data": [
    {
      "_id": "msg_uuid",
      "conversationId": "conv_uuid",
      "senderId": "user_uuid",
      "type": "TEXT|IMAGE|VIDEO|FILE|LINK",
      "text": "Xin chào mọi người",
      "media": [...],
      "createdAt": "2024-01-15T12:00:00Z"
    }
  ]
}
```

**Behavior**
- Nếu `allowSendLink=false` + có link trong text => 403 Forbidden
- Media item được auto map qua mimetype (image/jpeg => IMAGE type)
- Nếu text + media cùng có link => split thành 2 message (media + link riêng)

**Validation**
- Minimum: text hoặc media phải có ít nhất một cái
- Message length: 0-5000 characters
- Member phải active (status=active), không thể left group

---

### 17. Load lịch sử tin nhắn

**Endpoint**
```
GET /v1/conversations/:conversationId/messages?cursor=<cursor>&limit=20
```

**Query Parameters**
- `cursor`: optional, pagination cursor
- `limit`: optional, default 20, max 100

**Response (200 OK)**
```json
{
  "status": "success",
  "msg": "OK",
  "data": {
    "messages": [
      {
        "_id": "msg_uuid",
        "conversationId": "conv_uuid",
        "senderId": "sender_uuid",
        "senderName": "Nguyễn Văn A",
        "type": "TEXT",
        "text": "Hello",
        "createdAt": "2024-01-15T12:00:00Z"
      }
    ],
    "nextCursor": "cursor_string",
    "hasMore": true
  }
}
```

---

## 📡 Socket.IO Realtime Events

### Kết nối tới Server

**Endpoint**
```
ws://localhost:3000/messages
```

**Auth**
```javascript
const socket = io("http://localhost:3000/messages", {
  auth: {
    token: "YOUR_JWT_TOKEN"
  },
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
```

**Room Join Automatic**
```
- user:{userId}        // nhận tin cá nhân
- user_room:{userId}   // receive typing indicators
```

---

### Socket Client -> Server Events

#### A. Quản lý Room

**1. Join Group**
```javascript
socket.emit("joinGroup", { conversationId: "conv_uuid" }, (res) => {
  if (res.success) {
    console.log("Joined group");
  } else {
    console.error(res.error);
  }
});
```

**2. Leave Group**
```javascript
socket.emit("leaveGroup", { conversationId: "conv_uuid" }, (res) => {
  // { success: boolean, error?: string }
});
```

---

#### B. Tin nhắn

**1. Gửi tin nhắn**
```javascript
socket.emit("sendMessage", 
  {
    conversationId: "conv_uuid",
    text: "Xin chào mọi người",
    media: [
      {
        fileId: "file_abc",
        type: "IMAGE",
        url: "https://...",
        thumbnailUrl: "https://..."
      }
    ]
  },
  (res) => {
    if (res.success) {
      console.log("Message sent:", res.messages);
    } else {
      console.error("Error:", res.error);
    }
  }
);
```

**Rate Limit**: 60 requests/minute

**2. Chỉnh sửa tin nhắn**
```javascript
socket.emit("editMessage",
  {
    messageId: "msg_uuid",
    text: "Nội dung đã chỉnh sửa"
  },
  (res) => {
    // { success: boolean, message?: Message, error?: string }
  }
);
```

**Rate Limit**: 30 requests/minute

**3. Xóa tin nhắn (cá nhân)**
```javascript
socket.emit("deleteMessage",
  { messageId: "msg_uuid" },
  (res) => { /* */ }
);
```

**4. Thu hồi tin nhắn**
```javascript
socket.emit("revokeMessage",
  { messageId: "msg_uuid" },
  (res) => { /* */ }
);
```

**5. Xóa cho mọi người**
```javascript
socket.emit("deleteMessageForEveryone",
  { messageId: "msg_uuid" },
  (res) => { /* */ }
);
```

---

#### C. Trạng thái Tin nhắn

**1. Đánh dấu đã đọc**
```javascript
socket.emit("messageSeen",
  {
    conversationId: "conv_uuid",
    lastSeenMessageId: "msg_uuid"
  },
  (res) => { /* */ }
);
```

**2. Đánh dấu đã giao**
```javascript
socket.emit("messageDelivered",
  {
    conversationId: "conv_uuid",
    lastDeliveredMessageId: "msg_uuid"
  },
  (res) => { /* */ }
);
```

---

#### D. Typing Indicators

**1. Bắt đầu gõ**
```javascript
// Chat nhóm
socket.emit("typing:start", { groupId: "conv_uuid" });

// Chat cá nhân
socket.emit("typing:start", { toUserId: "user_uuid" });
```

**2. Ngừng gõ**
```javascript
socket.emit("typing:stop", { groupId: "conv_uuid" });
```

**Rate Limit**: 30 requests/minute

---

#### E. Reactions

**1. Thêm reaction**
```javascript
socket.emit("addReaction",
  {
    messageId: "msg_uuid",
    emoji: "👍"
  },
  (res) => {
    // { success, reaction?, error? }
  }
);
```

**Rate Limit**: 60 requests/minute

**2. Xóa reaction**
```javascript
socket.emit("removeReaction",
  {
    messageId: "msg_uuid",
    emoji: "👍"
  },
  (res) => { /* */ }
);
```

---

### Socket Server -> Client Events

#### A. Tin nhắn

**1. Nhận tin nhắn mới**
```javascript
socket.on("receiveMessage", (data) => {
  const { message, conversationId } = data;
  // message: { _id, senderId, senderName, text, media, createdAt, ... }
});
```

**2. Tin nhắn đã chỉnh sửa**
```javascript
socket.on("message:edited", (data) => {
  const { conversationId, message } = data;
});
```

**3. Tin nhắn đã xóa (cá nhân)**
```javascript
socket.on("message:deleted", (data) => {
  const { conversationId, messageId, deletedBy } = data;
});
```

**4. Tin nhắn đã xóa cho mọi người**
```javascript
socket.on("message:deleted_for_everyone", (data) => {
  const { conversationId, messageId, deletedBy } = data;
});
```

**5. Tin nhắn đã thu hồi**
```javascript
socket.on("message:revoked", (data) => {
  const { conversationId, messageId, revokedBy } = data;
});
```

---

#### B. Trạng thái

**1. Tin nhắn đã đọc**
```javascript
socket.on("messageSeen", (data) => {
  const { conversationId, userId, lastSeenMessageId } = data;
});
```

**2. Tin nhắn đã giao**
```javascript
socket.on("messageDelivered", (data) => {
  const { conversationId, userId, lastDeliveredMessageId } = data;
});
```

---

#### C. Typing

**1. User đang gõ**
```javascript
socket.on("typing:start", (data) => {
  const { userId, groupId } = data;
});
```

**2. User ngừng gõ**
```javascript
socket.on("typing:stop", (data) => {
  const { userId } = data;
});
```

---

#### D. Reactions

**1. Reaction được thêm**
```javascript
socket.on("message:reaction", (data) => {
  const { messageId, reaction } = data;
  // reaction: { _id, messageId, userId, emoji, createdAt }
});
```

**2. Reaction được xóa**
```javascript
socket.on("message:reaction:remove", (data) => {
  const { messageId, userId, emoji } = data;
});
```

---

#### E. Group Events

**1. Nhóm mới được tạo**
```javascript
socket.on("conversation:created", (data) => {
  const { conversation, systemMessage } = data;
});
```

**2. Thành viên được thêm**
```javascript
socket.on("conversation:members_added", (data) => {
  const { conversationId, newMembers } = data;
});
```

**3. Thành viên bị xóa/rời**
```javascript
socket.on("conversation:member_removed", (data) => {
  const { conversationId, removedUserId } = data;
});
```

**4. Cập nhật thông tin nhóm**
```javascript
socket.on("conversation:updated", (data) => {
  const { conversationId, data: updatedData } = data;
});
```

**5. Thay đổi admin**
```javascript
socket.on("group:admin_changed", (data) => {
  const { conversationId, targetUserId, isAdmin } = data;
});
```

**6. Chuyển owner**
```javascript
socket.on("group:owner_transferred", (data) => {
  const { conversationId, oldOwnerId, newOwnerId } = data;
});
```

**7. Thành viên được phê duyệt**
```javascript
socket.on("group:member_approved", (data) => {
  const { conversationId, userId, member } = data;
});
```

**8. Thành viên bị từ chối**
```javascript
socket.on("group:member_rejected", (data) => {
  const { conversationId, userId } = data;
});
```

**9. Cập nhật settings**
```javascript
socket.on("group:settings_updated", (data) => {
  const { conversationId, settings } = data;
});
```

**10. Nhóm giải tán**
```javascript
socket.on("group:dissolved", (data) => {
  const { conversationId, dissolvedBy } = data;
});
```

---

## 🔄 Integration Flow

### 1. Khởi tạo Application

```typescript
// 1. Login & get JWT token
const token = await loginAPI(email, password);
localStorage.setItem("token", token);

// 2. Kết nối socket immediately
const socket = io("http://localhost:3000/messages", {
  auth: { token }
});

socket.on("connect", () => {
  console.log("Connected to /messages namespace");
});
```

### 2. Load Danh sách Chat

```typescript
// GET /v1/conversations/cursor?limit=20
const response = await fetch("/v1/conversations/cursor?limit=20", {
  headers: { Authorization: `Bearer ${token}` }
});

const { data, meta } = await response.json();
// data = [{ _id, name, avatar, unreadCount, lastMessage, ... }]
// meta = { hasMore, nextCursor }

// Lưu để render list, implement infinite scroll dùng meta
```

### 3. Vào màn Tạo Nhóm

```typescript
// Form inputs: name, memberIds (multiselect)
const response = await fetch("/v1/groups", {
  method: "POST",
  headers: { 
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    name: "Nhóm Dev",
    memberIds: ["user1", "user2"]
  })
});

const { data } = await response.json();
const groupId = data.conversation._id;

// Socket sẽ emit conversation:created tự động cho creator
```

### 4. Vào màn Group Chat

```typescript
// 1. Join group room
socket.emit("joinGroup", { conversationId: groupId }, (res) => {
  if (res.success) {
    // 2. Load conversation detail
    const convRes = await fetch(`/v1/groups/${groupId}/info`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const convDetail = await convRes.json();
    // Render group header: name, avatar, members count
    
    // 3. Load members list
    const membersRes = await fetch(`/v1/groups/${groupId}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { data: { members } } = await membersRes.json();
    // Render members list + highlight admin/owner
    
    // 4. Load message history
    loadMessages(groupId, null);
  }
});

async function loadMessages(groupId, cursor) {
  const res = await fetch(
    `/v1/conversations/${groupId}/messages?cursor=${cursor || ""}&limit=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { data: { messages, nextCursor, hasMore } } = await res.json();
  // Render messages
  // Implement virtual scroll + lazy load khi scroll lên top
}

// 5. Listen socket events
socket.on("receiveMessage", (data) => {
  const { message, conversationId } = data;
  if (conversationId === groupId) {
    appendMessageToUI(message);
  }
});

socket.on("conversation:members_added", (data) => {
  if (data.conversationId === groupId) {
    // Refresh member list
  }
});

socket.on("conversation:member_removed", (data) => {
  if (data.conversationId === groupId) {
    // Remove member from UI
  }
});

socket.on("group:admin_changed", (data) => {
  if (data.conversationId === groupId) {
    // Highlight admin badge
  }
});
```

### 5. Gửi tin nhắn

```typescript
// Option A: Socket (realtime)
socket.emit("sendMessage", {
  conversationId: groupId,
  text: "Hello",
  media: []
}, (res) => {
  if (res.success) {
    console.log("Message sent");
  } else {
    showError(res.error);
  }
});

// Option B: HTTP Fallback (nếu socket down)
async function sendMessageHTTP(text, media) {
  const res = await fetch(`/v1/conversations/${groupId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, media })
  });
  return res.json();
}
```

### 6. Typing Indicator

```typescript
let typingTimeout;

function onInputChange() {
  socket.emit("typing:start", { groupId });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("typing:stop", { groupId });
  }, 3000); // Stop after 3s idle
}

socket.on("typing:start", (data) => {
  if (data.groupId === groupId) {
    showTypingIndicator(data.userId);
  }
});

socket.on("typing:stop", (data) => {
  hideTypingIndicator(data.userId);
});
```

### 7. Unread + Mark as Seen

```typescript
// Trigger khi user scroll to bottom / focus conversation
async function markAsSeen(lastMessageId) {
  // Uncomment nếu dùng HTTP:
  // await fetch(`/v1/conversations/${groupId}/seen`, {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${token}` },
  //   body: JSON.stringify({ lastSeenMessageId: lastMessageId })
  // });
  
  // Hoặc dùng socket (khuyến nghị):
  socket.emit("messageSeen", { 
    conversationId: groupId, 
    lastSeenMessageId: lastMessageId 
  });
}

// Listen khi others mark as seen
socket.on("messageSeen", (data) => {
  if (data.conversationId === groupId) {
    updateMessageStatus(data.userId, "seen", data.lastSeenMessageId);
  }
});
```

### 8. Quản lý Nhóm (Settings Dialog)

```typescript
// Cập nhật tên nhóm
async function updateGroupName(newName) {
  const res = await fetch(`/v1/groups/${groupId}`, {
    method: "PUT",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: newName })
  });
  
  // Socket sẽ emit conversation:updated
}

// Cập nhật settings
async function updateGroupSettings(settings) {
  const res = await fetch(`/v1/groups/${groupId}/settings`, {
    method: "PATCH",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(settings)
  });
  
  // Socket sẽ emit group:settings_updated
}

// Thêm member
async function addMembers(memberIds) {
  const res = await fetch(`/v1/groups/${groupId}/members`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ memberIds })
  });
  
  // Socket sẽ emit conversation:members_added
}

// Set admin
async function setAdmin(userId, isAdmin) {
  const res = await fetch(`/v1/groups/${groupId}/set-admin`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ targetUserId: userId, isAdmin })
  });
  
  // Socket sẽ emit group:admin_changed
}

// Transfer owner
async function transferOwner(newOwnerId) {
  const res = await fetch(`/v1/groups/${groupId}/transfer-owner`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ newOwnerId })
  });
  
  // Socket sẽ emit group:owner_transferred
}

// Phê duyệt pending member
async function approveMember(userId) {
  const res = await fetch(
    `/v1/groups/${groupId}/members/${userId}/approve`,
    { 
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  
  // Socket sẽ emit group:member_approved
}

// Giải tán nhóm
async function dissolveGroup() {
  const res = await fetch(`/v1/groups/${groupId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  
  // Socket sẽ emit group:dissolved
  // FE nên navigate away from group
}
```

---

## ⚠️ Điểm lệch Docs vs Code

### 1. Tạo Nhóm - memberIds Minimum

**Docs**:
- Ghi `memberIds` min 1

**Code Thực Tế** (usecase/create-group.ts):
- Bắt buộc ít nhất **2 memberIds** (tức total group = 3 người)
- Response 400 nếu thiếu

**Action**: FE validate minimum 2 person + current user = 3 total

---

### 2. Giải Tán Nhóm - Permission

**Docs**:
- "owner only"

**Code Thực Tế** (usecase/dissolve-group.ts):
- Owner **hoặc** admin có thể giải tán

**Action**: FE enable button nếu currentUserRole = admin || owner

---

### 3. Socket sendMessage Callback Response

**Docs** (socket-events.md):
```javascript
{
  success: boolean,
  message?: MessageObject,  // singular
  error?: string
}
```

**Code Thực Tế** (socket-service.ts):
```javascript
{
  success: boolean,
  messages?: Message[],     // plural (array)
  error?: string
}
```

**Action**: Callback return array messages, parse dùng `res.messages[0]`

---

### 4. Group Settings Schema

**Default Value** (code):
```javascript
{
  allowSendLink: true,
  requireApproval: false,
  allowMemberInvite: true
}
```

**Note**: Nếu group tạo lúc không truyền settings, backend auto set default (not null)

---

### 5. Socket event `group:dissolved`

**Docs**: Không mô tả (chỉ mô tả trong code)

**Code**: Emit khi owner delete `/v1/groups/:groupId`

**Payload**:
```javascript
{
  conversationId: string,
  dissolvedBy: string
}
```

**Action**: Listen event này để navigate user away from dead group

---

### 6. Pending Members Permission Check

**Docs**: Không rõ

**Code** (get-pending-members.ts):
- Không check permission, bất cứ member nào cũng có thể call

**Risk**: FE nên tự check `currentUserRole === "admin"` trước khi render approve/reject button

---

### 7. Status Enum - PENDING vs ACTIVE vs REJECTED

**Code** (model.ts):
```typescript
enum ConversationMemberStatus {
  PENDING = "pending",
  ACTIVE = "active",
  REJECTED = "rejected"
}
```

**Lưu ý**:
- Member thêm với `requireApproval=true` => status `pending`
- Admin phê duyệt => status `active`
- Admin từ chối => status `rejected` (không thể approve lại)

---

## 📝 Response Format

### Success Response

```json
{
  "status": "success",
  "msg": "OK|Created|...",
  "data": { /* actual data */ },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

### Error Response

```json
{
  "status": "error",
  "msg": "Error message",
  "code": "VALIDATION_ERROR|NOT_FOUND|UNAUTHORIZED|FORBIDDEN|...",
  "details": { /* validation errors */ }
}
```

### Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

## 🚨 Error Handling

### Common Errors

| Error | Cause | Action |
|-------|-------|--------|
| "Group must have at least 3 members" | memberIds < 2 | Add more members |
| "Only admins can add members" | Not admin | Check permission |
| "Member invites are disabled" | allowMemberInvite=false | Ask admin enable setting |
| "Sending links is disabled" | allowSendLink=false + link in text | Remove link or ask admin |
| "You are not a member" | leftAt set or not in group | Rejoin or show error |
| "Owner cannot leave" | Trying to leave as owner | Transfer owner first |
| "Cannot remove the last admin" | Removing last admin | Transfer owner then remove |
| "Rate limit exceeded" | Too many requests | Debounce/throttle |

### Socket Rate Limits

| Event | Limit | Window |
|-------|-------|--------|
| sendMessage | 60 | per minute |
| typing:start/stop | 30 | per minute |
| addReaction | 60 | per minute |
| editMessage | 30 | per minute |
| deleteMessage | 30 | per minute |
| revokeMessage | 30 | per minute |

---

## 📚 References

- **HTTP Routes**: `src/modules/chat/index.ts` (line 434+)
- **Socket Service**: `src/modules/chat/infras/transport/socket-service.ts`
- **DTO Schemas**: `src/modules/chat/model/dto/*.ts`
- **Use Cases**: `src/modules/chat/usecase/*.ts`
- **Response Format**: `src/share/middleware/response-format.ts`

---

## ✅ Checklist FE Implementation

- [ ] Setup socket connection with JWT auth
- [ ] Implement conversation list (cursor-based pagination)
- [ ] Create group form (name + member multiselect)
- [ ] Create group endpoint call
- [ ] Group chat room (join room + listen events)
- [ ] Load message history (cursor-based + virtualizing)
- [ ] Send message (socket emit + HTTP fallback)
- [ ] Mark as seen/delivered
- [ ] Typing indicator
- [ ] Member list UI
- [ ] Add/remove members
- [ ] Approve/reject pending (if requireApproval=true)
- [ ] Group settings dialog
- [ ] Admin badge + highlight
- [ ] Owner transfer modal
- [ ] Dissolve group confirmation
- [ ] Error handling + retry
- [ ] Offline queue (failed messages)
- [ ] Refetch on reconnect
- [ ] Memory leak prevention (unsubscribe events)

---

**Generated**: April 17, 2026  
**Version**: 1.0
