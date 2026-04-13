# Hướng Dẫn Tích Hợp Frontend — Chat, User & AI Module

> **Namespace Socket:** `/messages`  
> **Base URL REST:** `/api/v1`  
> **Auth:** Tất cả endpoint (trừ AI có thể không yêu cầu) đều cần `Authorization: Bearer <token>` trong header.

---

## Mục Lục

1. [Nguyên tắc chung: khi nào dùng API, khi nào dùng Socket](#1-nguyên-tắc-chung)
2. [Kết nối Socket](#2-kết-nối-socket)
3. [Module User](#3-module-user)
4. [Module Chat — Conversations](#4-module-chat--conversations)
5. [Module Chat — Messages (gửi & nhận)](#5-module-chat--messages-gửi--nhận)
6. [Module Chat — Quản lý tin nhắn](#6-module-chat--quản-lý-tin-nhắn)
7. [Module Chat — Reactions](#7-module-chat--reactions)
8. [Module Chat — Group Management](#8-module-chat--group-management)
9. [Module Chat — Poll (Bình chọn)](#9-module-chat--poll-bình-chọn)
10. [Module AI](#10-module-ai)
11. [Data Models tham chiếu](#11-data-models-tham-chiếu)

---

## 1. Nguyên Tắc Chung

| Tình huống | Dùng | Lý do |
|---|---|---|
| Tải dữ liệu lần đầu (conversations, messages, profile, v.v.) | **REST API** | Dữ liệu tĩnh, cần cache, SEO-friendly |
| Gửi tin nhắn realtime | **Socket** (ưu tiên) hoặc API | Socket nhanh hơn, không cần reload |
| Nhận tin nhắn mới từ người khác | **Socket** (lắng nghe event) | Server push, không cần polling |
| Typing indicator | **Socket** | Cần realtime tức thì, không cần lưu DB |
| Mark tin nhắn đã xem/giao | **Socket** (ưu tiên) hoặc API | Socket cho realtime receipt |
| Quản lý group (tạo, thêm member, đổi tên, ...) | **REST API** | Thao tác một lần, cần confirmation |
| Quản lý poll (tạo, vote) | **REST API** | Server-side validation quan trọng |
| AI features (tóm tắt, dịch, ...) | **REST API** | Batch processing, không cần realtime |
| Presence (online/offline) | **Socket** (lắng nghe) | Server push |
| Xóa/thu hồi tin nhắn | **REST API** hoặc **Socket** | Cả hai đều được — server sẽ push socket event về |

> **Lưu ý quan trọng:** Khi gọi REST API để gửi tin nhắn, chỉnh sửa, xóa, v.v. — server **tự động** emit socket event đến các member còn lại. Frontend **không cần** gọi socket thủ công sau đó.

---

## 2. Kết Nối Socket

### Setup kết nối

```javascript
import { io } from "socket.io-client";

const socket = io("http://your-server.com/messages", {
  auth: {
    token: "Bearer <jwt_token>",
    deviceId: "unique-device-id",
  },
  query: {
    token: "<jwt_token>",
  },
});

socket.on("connect", () => {
  console.log("Connected to /messages namespace");
});

socket.on("connect_error", (err) => {
  console.error("Connection failed:", err.message);
});
```

### Join vào Group Room (bắt buộc để nhận event của group)

Sau khi kết nối, để nhận event từ cuộc trò chuyện nhóm, cần emit `joinGroup`:

```javascript
socket.emit("joinGroup", { conversationId: "group-uuid" }, (response) => {
  if (response.success) {
    console.log("Joined group room");
  }
});
```

> **Lưu ý:** Private conversation không cần join room. Event sẽ tự gửi đến `user:<userId>`.

---

## 3. Module User

### 3.1 REST API — User Profile

#### Xem profile bản thân

```
GET /api/v1/users/profile
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "displayName": "Nguyễn Văn A",
    "email": "a@example.com",
    "phone": "+84901234567",
    "avatarUrl": "https://...",
    "bio": "...",
    "verified": { "email": true, "phone": false },
    "privacy": { "searchableByEmail": true, "searchableByPhone": true, "searchableByUsername": true },
    "settings": { "notifications": { "push": true, "inApp": true } },
    "lastSeen": "2026-04-13T10:00:00Z",
    "createdAt": "..."
  }
}
```

#### Cập nhật profile

```
PATCH /api/v1/users/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "displayName": "Tên mới",
  "avatarUrl": "https://cdn.example.com/avatar.jpg",
  "bio": "Mô tả mới"
}
```

#### Xem public profile của người dùng khác

```
GET /api/v1/users/:id/public
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "displayName": "Nguyễn Văn B",
    "avatarUrl": "https://...",
    "bio": "...",
    "verified": { "email": true, "phone": false }
  }
}
```

#### Tìm kiếm user theo số điện thoại

```
GET /api/v1/users/search?phone=+84901234567
Authorization: Bearer <token>
```

#### Kiểm tra trạng thái online

```
GET /api/v1/users/:id/presence
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "userId": "uuid",
    "isOnline": true,
    "lastSeen": 1713000000000
  }
}
```

### 3.2 Socket — Presence Events

> User module lắng nghe trên namespace gốc `/` (không phải `/messages`).

```javascript
const mainSocket = io("http://your-server.com", {
  auth: { token: "<jwt_token>" }
});

mainSocket.on("user:online", ({ userId }) => {
  console.log(`${userId} vừa online`);
});

mainSocket.on("user:offline", ({ userId }) => {
  console.log(`${userId} vừa offline`);
});
```

#### Heartbeat — duy trì trạng thái online

```javascript
setInterval(() => {
  mainSocket.emit("heartbeat");
}, 30000);
```

---

## 4. Module Chat — Conversations

> Tất cả đều là **REST API**.

### 4.1 Lấy danh sách conversations

```
GET /api/v1/conversations?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "private",
      "name": null,
      "avatarUrl": null,
      "membersCount": 2,
      "lastMessage": {
        "messageId": "uuid",
        "senderId": "uuid",
        "type": "text",
        "textPreview": "Chào!",
        "createdAt": "2026-04-13T10:00:00Z"
      },
      "unreadCount": 3,
      "role": "member"
    }
  ]
}
```

### 4.2 Lấy chi tiết một conversation

```
GET /api/v1/conversations/:conversationId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "conversation": { ... },
    "members": [ { "userId": "...", "role": "member", "status": "active", ... } ],
    "currentUserRole": "admin"
  }
}
```

### 4.3 Tạo hoặc lấy private conversation

```
POST /api/v1/conversations/private
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{ "targetUserId": "uuid-of-target-user" }
```

**Response:** `{ "data": { <conversation> } }`

### 4.4 Lấy tổng số tin nhắn chưa đọc

```
GET /api/v1/conversations/unread-count
Authorization: Bearer <token>
```

**Response:** `{ "totalUnread": 12 }`

### 4.5 Mute / Unmute conversation

```
POST   /api/v1/conversations/:conversationId/mute
DELETE /api/v1/conversations/:conversationId/mute
Authorization: Bearer <token>
```

**Body (POST):**
```json
{
  "muteUntil": "2026-04-20T00:00:00Z",
  "duration": 3600
}
```

### 4.6 Pin / Unpin conversation

```
POST   /api/v1/conversations/:conversationId/pin-conversation
DELETE /api/v1/conversations/:conversationId/pin-conversation
Authorization: Bearer <token>
```

### 4.7 Archive / Unarchive conversation

```
POST   /api/v1/conversations/:conversationId/archive
DELETE /api/v1/conversations/:conversationId/archive
Authorization: Bearer <token>
```

### 4.8 Lấy media trong conversation (ảnh, file, link)

```
GET /api/v1/conversations/:conversationId/media?type=all&cursor=xxx&limit=20
Authorization: Bearer <token>
```

`type`: `all` | `image` | `file` | `link`

**Response:**
```json
{
  "data": {
    "images": [ ... ],
    "files": [ ... ],
    "links": [ ... ],
    "nextCursor": "cursor-string",
    "hasMore": true
  }
}
```

---

## 5. Module Chat — Messages (Gửi & Nhận)

### 5.1 Tải lịch sử tin nhắn

> Dùng **REST API** (cursor-based pagination, tải từ dưới lên).

```
GET /api/v1/conversations/:conversationId/messages?cursor=<messageId>&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "messages": [ { <Message> }, ... ],
    "nextCursor": "older-message-id",
    "hasMore": true
  }
}
```

> **Cách dùng:** Lần đầu không truyền `cursor`. Khi scroll lên tải thêm, truyền `cursor` = `nextCursor` từ response trước.

### 5.2 Gửi tin nhắn

**Cách 1 — Qua Socket (ưu tiên cho realtime UX):**

```javascript
socket.emit("sendMessage", {
  conversationId: "uuid",
  text: "Xin chào!",
  media: [
    {
      url: "https://cdn.example.com/file.jpg",
      filename: "file.jpg",
      mimetype: "image/jpeg",
      size: 102400
    }
  ]
}, (response) => {
  if (response.success) {
    console.log("Đã gửi:", response.messages);
  } else {
    console.error(response.error);
  }
});
```

**Cách 2 — Qua REST API:**

```
POST /api/v1/conversations/:conversationId/messages
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "text": "Xin chào!",
  "media": [
    {
      "url": "https://cdn.example.com/file.jpg",
      "filename": "file.jpg",
      "mimetype": "image/jpeg",
      "size": 102400
    }
  ]
}
```

> Server tự động detect private/group và xử lý tương ứng. Server cũng tự emit socket event `receiveMessage` đến các member.

### 5.3 Nhận tin nhắn mới (Socket listener)

```javascript
socket.on("receiveMessage", ({ message, conversationId }) => {
  console.log("Tin nhắn mới:", message);
});
```

**Cấu trúc `Message`:**
```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderId": "uuid",
  "type": "text",
  "text": "Xin chào!",
  "media": null,
  "links": [],
  "quotedMessageId": null,
  "quotedMessagePreview": null,
  "pinned": false,
  "createdAt": "2026-04-13T10:00:00Z",
  "editedAt": null,
  "deletedAt": null,
  "deletedForUserIds": []
}
```

### 5.4 Quote tin nhắn

**Qua Socket:**
```javascript
socket.emit("quoteMessage", {
  conversationId: "uuid",
  quotedMessageId: "uuid-of-message-to-quote",
  text: "Tôi đồng ý!",
  media: []
}, (response) => {
  if (response.success) console.log(response.message);
});
```

**Qua REST API:**
```
POST /api/v1/messages/:messageId/quote
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "text": "Tôi đồng ý!",
  "media": []
}
```

> Kết quả vẫn là event `receiveMessage` được push đến tất cả member.

### 5.5 Forward tin nhắn

**Qua Socket:**
```javascript
socket.emit("forwardMessages", {
  messageIds: ["uuid1", "uuid2"],
  targetConversationIds: ["conv-uuid1", "conv-uuid2"]
}, (response) => {
  console.log(response.messages);
});
```

**Qua REST API:**
```
POST /api/v1/messages/forward
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "messageIds": ["uuid1", "uuid2"],
  "targetConversationIds": ["conv-uuid1"]
}
```

### 5.6 Typing Indicator

> **Chỉ dùng Socket.** Không có REST API.

```javascript
socket.emit("typing:start", {
  toUserId: "uuid",      // private chat
  groupId: "uuid"        // group chat (chỉ dùng 1 trong 2)
});

socket.emit("typing:stop", {
  toUserId: "uuid",
  groupId: "uuid"
});

socket.on("typing:start", ({ userId, toUserId, groupId }) => {
  console.log(`${userId} đang nhập...`);
});

socket.on("typing:stop", ({ userId }) => {
  console.log(`${userId} dừng nhập`);
});
```

### 5.7 Mark as Seen

**Qua Socket (ưu tiên):**
```javascript
socket.emit("messageSeen", {
  conversationId: "uuid",
  lastSeenMessageId: "uuid"
}, (response) => { console.log(response.success) });

socket.on("messageSeen", ({ conversationId, userId, lastSeenMessageId }) => {
  console.log(`${userId} đã xem đến message ${lastSeenMessageId}`);
});
```

**Qua REST API:**
```
POST /api/v1/conversations/:conversationId/seen
Authorization: Bearer <token>
Content-Type: application/json

{ "lastSeenMessageId": "uuid" }
```

#### Mark All Seen (Socket only)
```javascript
socket.emit("markAllSeen", { conversationId: "uuid" }, (res) => {
  console.log(res.success);
});
```

### 5.8 Mark as Delivered

**Qua Socket:**
```javascript
socket.emit("messageDelivered", {
  conversationId: "uuid",
  lastDeliveredMessageId: "uuid"
}, (response) => { console.log(response.success) });

socket.on("messageDelivered", ({ conversationId, userId, lastDeliveredMessageId }) => {
  console.log(`Đã deliver đến ${userId}`);
});
```

**Qua REST API:**
```
POST /api/v1/conversations/:conversationId/delivered
Content-Type: application/json

{ "lastDeliveredMessageId": "uuid" }
```

---

## 6. Module Chat — Quản Lý Tin Nhắn

### 6.1 Chỉnh sửa tin nhắn

**Qua Socket:**
```javascript
socket.emit("editMessage", { messageId: "uuid", text: "Nội dung mới" }, (res) => {
  console.log(res.message);
});

socket.on("message:edited", ({ conversationId, message }) => {
  console.log("Tin nhắn đã bị sửa:", message);
});
```

**Qua REST API:**
```
PUT /api/v1/messages/:messageId
Authorization: Bearer <token>
Content-Type: application/json

{ "text": "Nội dung mới" }
```

### 6.2 Thu hồi tin nhắn (revoke — xóa với tất cả)

> Tin nhắn hiển thị thông báo "Tin nhắn đã bị thu hồi" với tất cả thành viên.

**Qua Socket:**
```javascript
socket.emit("revokeMessage", { messageId: "uuid" }, (res) => {
  console.log(res.success);
});

socket.on("message:revoked", ({ conversationId, messageId, revokedBy }) => {
  console.log("Tin nhắn đã bị thu hồi:", messageId);
});
```

**Qua REST API:**
```
POST /api/v1/messages/:messageId/revoke
Authorization: Bearer <token>
```

### 6.3 Xóa tin nhắn phía tôi (delete for me)

> Chỉ xóa với bản thân người gọi, người khác vẫn thấy.

**Qua Socket:**
```javascript
socket.emit("deleteMessage", { messageId: "uuid" }, (res) => {
  console.log(res.success);
});

socket.on("message:deleted", ({ conversationId, messageId, deletedBy }) => {
  console.log("Message đã bị xóa phía tôi");
});
```

**Qua REST API:**
```
POST /api/v1/messages/:messageId/delete
Authorization: Bearer <token>
```

### 6.4 Xóa tin nhắn với tất cả (delete for everyone)

**Qua Socket:**
```javascript
socket.emit("deleteMessageForEveryone", { messageId: "uuid" }, (res) => {
  console.log(res.success);
});

socket.on("message:deleted_for_everyone", ({ conversationId, messageId, deletedBy }) => {
  console.log("Tin nhắn đã bị xóa với tất cả");
});
```

**Qua REST API:**
```
POST /api/v1/messages/:messageId/delete-for-everyone
Authorization: Bearer <token>
```

### 6.5 Pin / Unpin tin nhắn

> Dùng **REST API** — server emit socket event `message:pinned` / `message:unpinned` đến room.

```
POST   /api/v1/messages/:messageId/pin
DELETE /api/v1/messages/:messageId/pin
Authorization: Bearer <token>
```

**Socket events nhận về:**
```javascript
socket.on("message:pinned", ({ conversationId, message }) => { ... });
socket.on("message:unpinned", ({ conversationId, message }) => { ... });
```

#### Lấy danh sách tin nhắn đã pin

```
GET /api/v1/conversations/:conversationId/pinned-messages
Authorization: Bearer <token>
```

---

## 7. Module Chat — Reactions

### 7.1 Thêm reaction

**Qua Socket:**
```javascript
socket.emit("addReaction", { messageId: "uuid", emoji: "👍" }, (res) => {
  console.log(res.reaction);
});

socket.on("message:reaction", ({ messageId, reaction }) => {
  console.log("Reaction mới:", reaction);
});
```

**Qua REST API:**
```
POST /api/v1/messages/:messageId/react
Authorization: Bearer <token>
Content-Type: application/json

{ "emoji": "👍" }
```

### 7.2 Xóa reaction

**Qua Socket:**
```javascript
socket.emit("removeReaction", { messageId: "uuid", emoji: "👍" }, (res) => {
  console.log(res.deletedCount);
});

socket.on("message:reaction:remove", ({ messageId, userId, emoji }) => {
  console.log("Reaction đã bị xóa");
});
```

**Qua REST API:**
```
DELETE /api/v1/messages/:messageId/react
Authorization: Bearer <token>
Content-Type: application/json

{ "emoji": "👍" }
```

### 7.3 Xóa tất cả reactions của bản thân

```
DELETE /api/v1/messages/:messageId/reactions
Authorization: Bearer <token>
```

**Socket event nhận về:** `message:reactions:clear`

### 7.4 Lấy danh sách reactions

```
GET /api/v1/messages/:messageId/reactions
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "reactions": [ { "id": "uuid", "messageId": "...", "userId": "...", "emoji": "👍", "count": 1 } ],
    "grouped": { "👍": 5, "❤️": 2 }
  }
}
```

---

## 8. Module Chat — Group Management

> Tất cả thao tác quản lý nhóm đều qua **REST API**. Server tự emit socket event đến group room.

### 8.1 Tạo nhóm

```
POST /api/v1/groups
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Tên nhóm",
  "memberIds": ["uuid1", "uuid2"],
  "avatarUrl": "https://..."
}
```

**Socket event** các member nhận: `conversation:created`

```javascript
socket.on("conversation:created", ({ conversation, systemMessage }) => {
  console.log("Bạn được thêm vào nhóm:", conversation);
});
```

### 8.2 Thêm thành viên vào nhóm

```
POST /api/v1/groups/:groupId/members
Authorization: Bearer <token>
Content-Type: application/json

{ "memberIds": ["uuid1", "uuid2"] }
```

**Socket event** room nhận: `conversation:members_added`

```javascript
socket.on("conversation:members_added", ({ conversationId, newMembers }) => { ... });
```

### 8.3 Xóa thành viên khỏi nhóm

```
DELETE /api/v1/groups/:groupId/members/:userId
Authorization: Bearer <token>
```

**Socket event:** `conversation:member_removed`

```javascript
socket.on("conversation:member_removed", ({ conversationId, removedUserId }) => { ... });
```

### 8.4 Cập nhật thông tin nhóm

```
PUT /api/v1/groups/:groupId
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Tên mới", "avatarUrl": "https://..." }
```

**Socket event:** `conversation:updated`

```javascript
socket.on("conversation:updated", ({ conversationId, data }) => { ... });
```

### 8.5 Rời nhóm

```
POST /api/v1/groups/:groupId/leave
Authorization: Bearer <token>
```

### 8.6 Lấy danh sách thành viên nhóm

```
GET /api/v1/groups/:groupId/members
Authorization: Bearer <token>
```

### 8.7 Lấy thông tin chi tiết nhóm

```
GET /api/v1/groups/:groupId/info
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "conversation": { ... },
    "members": [ ... ],
    "currentUserRole": "admin",
    "settings": {
      "allowSendLink": true,
      "requireApproval": false,
      "allowMemberInvite": true
    }
  }
}
```

### 8.8 Phân quyền Admin

```
POST /api/v1/groups/:groupId/set-admin
Authorization: Bearer <token>
Content-Type: application/json

{ "targetUserId": "uuid", "isAdmin": true }
```

**Socket event:** `group:admin_changed`

```javascript
socket.on("group:admin_changed", ({ conversationId, targetUserId, isAdmin }) => { ... });
```

### 8.9 Chuyển quyền Owner

```
POST /api/v1/groups/:groupId/transfer-owner
Authorization: Bearer <token>
Content-Type: application/json

{ "newOwnerId": "uuid" }
```

**Socket event:** `group:owner_transferred`

```javascript
socket.on("group:owner_transferred", ({ conversationId, oldOwnerId, newOwnerId }) => { ... });
```

### 8.10 Cập nhật cài đặt nhóm

```
PATCH /api/v1/groups/:groupId/settings
Authorization: Bearer <token>
Content-Type: application/json

{ "allowSendLink": false, "requireApproval": true, "allowMemberInvite": false }
```

**Socket event:** `group:settings_updated`

```javascript
socket.on("group:settings_updated", ({ conversationId, settings }) => { ... });
```

### 8.11 Duyệt / Từ chối thành viên (khi requireApproval = true)

#### Lấy danh sách pending

```
GET /api/v1/groups/:groupId/members/pending
Authorization: Bearer <token>
```

#### Duyệt

```
PATCH /api/v1/groups/:groupId/members/:userId/approve
Authorization: Bearer <token>
```

**Socket events:**
- Room nhận: `group:member_approved` `{ conversationId, userId, member }`
- User được duyệt nhận: `group:member_approved`

#### Từ chối

```
PATCH /api/v1/groups/:groupId/members/:userId/reject
Authorization: Bearer <token>
```

**Socket event** gửi đến user bị reject: `group:member_rejected`

```javascript
socket.on("group:member_rejected", ({ conversationId, userId }) => { ... });
```

---

## 9. Module Chat — Poll (Bình Chọn)

> Tất cả đều qua **REST API**. Server emit socket event đến group room.

### 9.1 Tạo poll

```
POST /api/v1/groups/:groupId/polls
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "question": "Họp lúc mấy giờ?",
  "options": ["9:00 AM", "2:00 PM", "5:00 PM"],
  "isMultipleChoice": false,
  "allowAddOption": false,
  "expiresAt": "2026-04-20T00:00:00Z"
}
```

**Socket event** room nhận: `poll:new`

```javascript
socket.on("poll:new", ({ conversationId, poll }) => {
  console.log("Poll mới:", poll);
});
```

### 9.2 Lấy danh sách polls

```
GET /api/v1/groups/:groupId/polls
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "question": "Họp lúc mấy giờ?",
      "options": [
        { "id": "opt-uuid", "text": "9:00 AM", "voteCount": 3, "votedUserIds": ["uid1", "uid2", "uid3"] }
      ],
      "isMultipleChoice": false,
      "totalVotes": 3,
      "expiresAt": "2026-04-20T00:00:00Z"
    }
  ]
}
```

### 9.3 Vote

```
POST /api/v1/groups/:groupId/polls/:pollId/vote
Authorization: Bearer <token>
Content-Type: application/json

{ "optionIds": ["opt-uuid"] }
```

**Socket event** room nhận: `poll:vote`

```javascript
socket.on("poll:vote", ({ conversationId, pollId, userId, poll }) => {
  console.log("Ai đó đã vote:", userId, poll);
});
```

### 9.4 Lấy kết quả poll

```
GET /api/v1/groups/:groupId/polls/:pollId/results
Authorization: Bearer <token>
```

---

## 10. Module AI

> Tất cả AI features dùng **REST API**. Không có socket. Auth tùy endpoint.

Base URL: `/api/v1/ai`

### 10.1 Tóm tắt conversation

```
POST /api/v1/ai/summarize
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "conversationId": "uuid",
  "maxMessages": 50
}
```

**Response:**
```json
{
  "summary": ["Điểm chính 1", "Điểm chính 2"],
  "originalCount": 48,
  "conversationId": "uuid"
}
```

### 10.2 Smart Reply (gợi ý câu trả lời)

```
POST /api/v1/ai/smart-reply
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "conversationId": "uuid",
  "userId": "your-user-id"
}
```

**Response:**
```json
{
  "replies": ["Được, tôi đồng ý!", "Để tôi xem lại nhé.", "Không được rồi."],
  "lastMessage": "Bạn có rảnh tối nay không?",
  "lastSenderName": "Nguyễn Văn B"
}
```

### 10.3 Điều chỉnh tone tin nhắn

```
POST /api/v1/ai/tone-adjust
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "message": "anh ơi cho em xin deadline",
  "tone": "formal"
}
```

`tone`: `"formal"` | `"casual"` | `"funny"` | `"professional"`

**Response:**
```json
{
  "original": "anh ơi cho em xin deadline",
  "adjusted": "Kính gửi anh, em xin phép hỏi về thời hạn nộp bài.",
  "tone": "formal"
}
```

### 10.4 Dịch văn bản

```
POST /api/v1/ai/translate
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "text": "Hello, how are you?",
  "targetLang": "vi",
  "sourceLang": "en"
}
```

**Response:**
```json
{
  "original": "Hello, how are you?",
  "translated": "Xin chào, bạn có khỏe không?",
  "sourceLang": "en",
  "targetLang": "vi"
}
```

### 10.5 Phát hiện ngôn ngữ

```
POST /api/v1/ai/detect-language
Authorization: Bearer <token>
Content-Type: application/json

{ "text": "Bonjour tout le monde" }
```

**Response:** `{ "language": "fr" }`

---

## 11. Data Models Tham Chiếu

### Message

| Field | Type | Mô tả |
|---|---|---|
| `id` | string (uuid) | ID duy nhất |
| `conversationId` | string | ID conversation chứa |
| `senderId` | string | ID người gửi |
| `type` | `text` \| `image` \| `file` \| `link` \| `system` | Loại tin nhắn |
| `text` | string? | Nội dung text |
| `media` | `MediaAttachment[]?` | Danh sách media |
| `links` | string[]? | Các URL được detected |
| `quotedMessageId` | string? | ID tin nhắn được quote |
| `quotedMessagePreview` | string? | Preview của tin nhắn được quote |
| `pinned` | boolean | Đã pin chưa |
| `createdAt` | Date | Thời điểm tạo |
| `editedAt` | Date? | Thời điểm sửa |
| `deletedAt` | Date? | Thời điểm xóa |
| `deletedForUserIds` | string[]? | Xóa phía những user nào |

### MediaAttachment

| Field | Type | Mô tả |
|---|---|---|
| `url` | string | URL của file |
| `filename` | string | Tên file |
| `mimetype` | string | MIME type (`image/jpeg`, `application/pdf`, ...) |
| `size` | number | Kích thước byte |

### Conversation

| Field | Type | Mô tả |
|---|---|---|
| `id` | string | ID |
| `type` | `private` \| `group` | Loại |
| `name` | string? | Tên (group) |
| `avatarUrl` | string? | Ảnh đại diện (group) |
| `ownerId` | string? | ID chủ nhóm |
| `admins` | string[]? | Danh sách admin |
| `membersCount` | number | Số lượng thành viên |
| `settings` | GroupSettings? | Cài đặt nhóm |
| `lastMessage` | LastMessage? | Tin nhắn cuối |
| `lastMessageAt` | Date? | Thời gian tin nhắn cuối |

### ConversationMember

| Field | Type | Mô tả |
|---|---|---|
| `id` | string | ID record |
| `conversationId` | string | ID conversation |
| `userId` | string | ID user |
| `role` | `member` \| `admin` | Vai trò |
| `status` | `active` \| `pending` \| `rejected` | Trạng thái |
| `unreadCount` | number | Số tin chưa đọc |
| `muteUntil` | Date? | Tắt thông báo đến khi |
| `pinned` | boolean | Đã ghim conversation |
| `archived` | boolean | Đã lưu trữ |

### GroupSettings

| Field | Type | Mô tả |
|---|---|---|
| `allowSendLink` | boolean | Cho phép gửi link |
| `requireApproval` | boolean | Yêu cầu duyệt khi tham gia |
| `allowMemberInvite` | boolean | Cho phép thành viên mời người |

### Rate Limits (Socket)

| Event Socket | Giới hạn |
|---|---|
| `sendMessage` | 60 lần / phút |
| `typing` | 30 lần / phút |
| `addReaction` | 60 lần / phút |
| `editMessage` | 30 lần / phút |
| `deleteMessage` | 30 lần / phút |
| `forwardMessages` | 30 lần / phút |
| `quoteMessage` | 60 lần / phút |

---

## Tổng Hợp Socket Events

### Events Frontend **emit** (gửi lên server)

| Event | Khi nào dùng |
|---|---|
| `joinGroup` | Sau khi vào màn hình group chat |
| `leaveGroup` | Khi rời màn hình group chat |
| `sendMessage` | Gửi tin nhắn realtime |
| `quoteMessage` | Reply/quote tin nhắn |
| `forwardMessages` | Forward tin nhắn |
| `editMessage` | Chỉnh sửa tin nhắn |
| `deleteMessage` | Xóa phía mình |
| `deleteMessageForEveryone` | Xóa với tất cả |
| `revokeMessage` | Thu hồi tin nhắn |
| `addReaction` | Thêm emoji reaction |
| `removeReaction` | Xóa reaction |
| `messageSeen` | Đánh dấu đã xem |
| `markAllSeen` | Đánh dấu đọc hết |
| `messageDelivered` | Đánh dấu đã nhận |
| `typing:start` | Bắt đầu nhập |
| `typing:stop` | Dừng nhập |
| `heartbeat` | Duy trì online status |

### Events Frontend **on** (nhận từ server)

| Event | Ý nghĩa |
|---|---|
| `receiveMessage` | Tin nhắn mới (gửi, quote, forward) |
| `message:edited` | Tin nhắn vừa được sửa |
| `message:revoked` | Tin nhắn bị thu hồi |
| `message:deleted` | Tin nhắn bị xóa phía ai đó |
| `message:deleted_for_everyone` | Tin nhắn bị xóa với tất cả |
| `message:pinned` | Tin nhắn được pin |
| `message:unpinned` | Tin nhắn được unpin |
| `message:reaction` | Reaction mới được thêm |
| `message:reaction:remove` | Reaction bị xóa |
| `message:reactions:clear` | Tất cả reaction của user bị xóa |
| `messageSeen` | User đã xem đến message nào |
| `messageDelivered` | Message đã deliver đến user nào |
| `typing:start` | User đang nhập |
| `typing:stop` | User dừng nhập |
| `conversation:created` | Nhóm mới được tạo (bạn được thêm vào) |
| `conversation:updated` | Thông tin nhóm được cập nhật |
| `conversation:members_added` | Thành viên mới được thêm |
| `conversation:member_removed` | Thành viên bị xóa |
| `group:admin_changed` | Quyền admin thay đổi |
| `group:owner_transferred` | Chủ nhóm thay đổi |
| `group:settings_updated` | Cài đặt nhóm thay đổi |
| `group:member_approved` | Thành viên được duyệt vào nhóm |
| `group:member_rejected` | Bị từ chối vào nhóm |
| `poll:new` | Poll mới được tạo |
| `poll:vote` | Có người đã vote poll |
| `user:online` | User online |
| `user:offline` | User offline |
