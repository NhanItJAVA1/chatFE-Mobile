# Tài liệu Socket.IO - Module Chat

Tài liệu này mô tả chi tiết về các Namespace, Events và Payloads được sử dụng trong hệ thống Socket.IO của module Chat, giúp đội ngũ Frontend tích hợp dễ dàng.

## Mục lục

1. [Kết nối và Xác thực](#1-kết-nối-và-xác-thực)
2. [Namespace `/messages`](#2-namespace-messages)
3. [Events Client -> Server](#3-events-client---server)
4. [Events Server -> Client](#4-events-server---client)
5. [Rate Limits](#5-rate-limits)
6. [Ví dụ Code](#6-ví-dụ-code)
7. [Kiến trúc Room](#7-kiến-trúc-room)

---

## 1. Kết nối và Xác thực

### Cách kết nối

```javascript
import { io } from "socket.io-client";

const socket = io("YOUR_SERVER_URL/messages", {
  auth: {
    token: "YOUR_JWT_TOKEN"
  },
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### Quy tắc xác thực

- JWT Token phải được truyền trong `auth.token` khi kết nối
- Token được giải mã để lấy `userId` từ `sub` claim
- Nếu token hết hạn hoặc không hợp lệ, connection sẽ bị reject

---

## 2. Namespace `/messages`

### Đặc điểm

- **URL:** `io("YOUR_SERVER_URL/messages")`
- **Tự động join rooms:** Khi kết nối thành công, socket tự động join vào:
  - `user:{userId}` - Nhận tin nhắn cá nhân
  - `user_room:{userId}` - Nhận typing events

### Cơ chế Room

```
┌─────────────────────────────────────────────────────────┐
│                    Namespace /messages                   │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │ user:{userId}│     │group:{convId}│                  │
│  │  (personal)  │     │   (group)    │                  │
│  └──────────────┘     └──────────────┘                  │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │user_room:    │     │group_room:   │                  │
│  │  {userId}    │     │  {convId}    │                  │
│  │  (typing)    │     │  (typing)    │                  │
│  └──────────────┘     └──────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Events Client -> Server

### 3.1 Quản lý Room

#### `joinGroup` - Tham gia nhóm

```javascript
socket.emit("joinGroup", { conversationId: "conv_123" }, (res) => {
  // res: { success: boolean, message?: string, error?: string }
});
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|----------|-------|----------|-------|
| conversationId | string | ✅ | ID cuộc trò chuyện |

#### `leaveGroup` - Rời nhóm

```javascript
socket.emit("leaveGroup", { conversationId: "conv_123" }, (res) => {
  // res: { success: boolean, message?: string, error?: string }
});
```

### 3.2 Tin nhắn

#### `sendMessage` - Gửi tin nhắn

```javascript
socket.emit("sendMessage", {
  conversationId: "conv_123",
  text: "Xin chào mọi người!",
  media: [
    {
      fileId: "file_abc123",
      type: "IMAGE",
      url: "https://cdn.example.com/image.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    }
  ]
}, (res) => {
  if (res.success) {
    console.log("Tin nhắn đã gửi:", res.message);
  } else {
    console.error("Lỗi:", res.error);
  }
});
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|----------|-------|----------|-------|
| conversationId | string | ✅ | ID cuộc trò chuyện |
| text | string | ✅* | Nội dung tin nhắn |
| media | array | ✅* | Danh sách media attachments |

> *Cần có ít nhất `text` hoặc `media`

**Rate Limit:** 60 request/phút

#### `editMessage` - Chỉnh sửa tin nhắn

```javascript
socket.emit("editMessage", {
  messageId: "msg_456",
  text: "Nội dung đã chỉnh sửa"
}, (res) => {
  // res: { success: boolean, message?: MessageObject, error?: string }
});
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|----------|-------|----------|-------|
| messageId | string | ✅ | ID tin nhắn cần sửa |
| text | string | ✅ | Nội dung mới |

**Rate Limit:** 30 request/phút

#### `deleteMessage` - Xóa tin nhắn (chỉ tôi)

```javascript
socket.emit("deleteMessage", {
  messageId: "msg_456"
}, (res) => {
  // res: { success: boolean, error?: string }
});
```

#### `revokeMessage` - Thu hồi tin nhắn

```javascript
socket.emit("revokeMessage", {
  messageId: "msg_456"
}, (res) => {
  // res: { success: boolean, message?: MessageObject, error?: string }
});
```

> Chỉ người gửi gốc hoặc admin nhóm mới có quyền thu hồi

**Rate Limit:** 30 request/phút

#### `deleteMessageForEveryone` - Xóa cho mọi người

```javascript
socket.emit("deleteMessageForEveryone", {
  messageId: "msg_456"
}, (res) => {
  // res: { success: boolean, message?: MessageObject, error?: string }
});
```

### 3.3 Trạng thái tin nhắn

#### `messageSeen` - Đánh dấu đã đọc

```javascript
socket.emit("messageSeen", {
  conversationId: "conv_123",
  lastSeenMessageId: "msg_456"
}, (res) => {
  // res: { success: boolean, error?: string }
});
```

#### `messageDelivered` - Đánh dấu đã giao

```javascript
socket.emit("messageDelivered", {
  conversationId: "conv_123",
  lastDeliveredMessageId: "msg_456"
}, (res) => {
  // res: { success: boolean, error?: string }
});
```

#### `markAllSeen` - Đánh dấu tất cả đã đọc

```javascript
socket.emit("markAllSeen", {
  conversationId: "conv_123"
}, (res) => {
  // res: { success: boolean, error?: string }
});
```

### 3.4 Reactions

#### `addReaction` - Thêm reaction

```javascript
socket.emit("addReaction", {
  messageId: "msg_456",
  emoji: "👍"
}, (res) => {
  // res: { success: boolean, reaction?: ReactionObject, error?: string }
});
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|----------|-------|----------|-------|
| messageId | string | ✅ | ID tin nhắn |
| emoji | string | ✅ | Emoji (VD: "👍", "❤️", "😂") |

**Rate Limit:** 60 request/phút

#### `removeReaction` - Xóa reaction

```javascript
// Xóa một emoji cụ thể
socket.emit("removeReaction", {
  messageId: "msg_456",
  emoji: "👍"
}, (res) => {
  // res: { success: boolean, deletedCount?: number, error?: string }
});

// Xóa tất cả reactions của user trên tin nhắn
socket.emit("removeReaction", {
  messageId: "msg_456"
}, (res) => {
  // res: { success: boolean, deletedCount?: number, error?: string }
});
```

### 3.5 Typing Indicators

#### `typing:start` - Bắt đầu gõ

```javascript
// Chat cá nhân
socket.emit("typing:start", {
  toUserId: "user_456"
});

// Chat nhóm
socket.emit("typing:start", {
  groupId: "conv_123"
});
```

#### `typing:stop` - Ngừng gõ

```javascript
// Chat cá nhân
socket.emit("typing:stop", {
  toUserId: "user_456"
});

// Chat nhóm
socket.emit("typing:stop", {
  groupId: "conv_123"
});
```

> **Lưu ý:** Chỉ truyền một trong hai `toUserId` hoặc `groupId`, không truyền cả hai cùng lúc

**Rate Limit:** 30 request/phút

---

## 4. Events Server -> Client

### 4.1 Tin nhắn

#### `receiveMessage` - Tin nhắn mới

```javascript
socket.on("receiveMessage", (data) => {
  console.log("Tin nhắn mới:", data.message);
  console.log("Cuộc trò chuyện:", data.conversationId);
});
```

**Payload:**
```typescript
{
  message: {
    _id: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar: string;
    type: "TEXT" | "MEDIA" | "FILE" | "SYSTEM";
    text?: string;
    media?: MediaAttachment[];
    replyTo?: {
      _id: string;
      text: string;
      senderName: string;
    };
    reactions?: Reaction[];
    isPinned: boolean;
    isRevoked: boolean;
    createdAt: string;
    updatedAt: string;
  };
  conversationId: string;
}
```

#### `message:edited` - Tin nhắn đã chỉnh sửa

```javascript
socket.on("message:edited", (data) => {
  console.log("Cuộc trò chuyện:", data.conversationId);
  console.log("Tin nhắn đã sửa:", data.message);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  message: MessageObject;
}
```

#### `message:deleted` - Tin nhắn đã xóa (cá nhân)

```javascript
socket.on("message:deleted", (data) => {
  console.log("Đã xóa trong:", data.conversationId);
  console.log("ID tin nhắn:", data.messageId);
  console.log("Người xóa:", data.deletedBy);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  messageId: string;
  deletedBy: string;
}
```

#### `message:deleted_for_everyone` - Tin nhắn đã xóa cho mọi người

```javascript
socket.on("message:deleted_for_everyone", (data) => {
  console.log("Đã xóa cho mọi người trong:", data.conversationId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  messageId: string;
  deletedBy: string;
}
```

#### `message:revoked` - Tin nhắn đã thu hồi

```javascript
socket.on("message:revoked", (data) => {
  console.log("Tin nhắn thu hồi:", data.messageId);
  console.log("Người thu hồi:", data.revokedBy);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  messageId: string;
  revokedBy: string;
}
```

#### `message:pinned` - Tin nhắn đã ghim

```javascript
socket.on("message:pinned", (data) => {
  console.log("Tin nhắn được ghim trong:", data.conversationId);
  console.log("Tin nhắn:", data.message);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  message: MessageObject;
}
```

#### `message:unpinned` - Tin nhắn đã bỏ ghim

```javascript
socket.on("message:unpinned", (data) => {
  console.log("Tin nhắn bỏ ghim:", data.messageId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  message: MessageObject;
}
```

### 4.2 Trạng thái

#### `messageSeen` - Tin nhắn đã đọc

```javascript
socket.on("messageSeen", (data) => {
  console.log("User đã đọc:", data.userId);
  console.log("Trong cuộc trò chuyện:", data.conversationId);
  console.log("Tin nhắn cuối đã đọc:", data.lastSeenMessageId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  userId: string;
  lastSeenMessageId: string;
}
```

#### `messageDelivered` - Tin nhắn đã giao

```javascript
socket.on("messageDelivered", (data) => {
  console.log("User nhận được:", data.userId);
  console.log("Tin nhắn cuối đã giao:", data.lastDeliveredMessageId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  userId: string;
  lastDeliveredMessageId: string;
}
```

### 4.3 Typing

#### `typing:start` - User đang gõ

```javascript
socket.on("typing:start", (data) => {
  console.log("User đang gõ:", data.userId);
  
  if (data.toUserId) {
    console.log("Chat cá nhân với:", data.toUserId);
  }
  
  if (data.groupId) {
    console.log("Trong nhóm:", data.groupId);
  }
});
```

**Payload (chat cá nhân):**
```typescript
{
  userId: string;
  toUserId: string;
}
```

**Payload (chat nhóm):**
```typescript
{
  userId: string;
  groupId: string;
}
```

#### `typing:stop` - User ngừng gõ

```javascript
socket.on("typing:stop", (data) => {
  console.log("User ngừng gõ:", data.userId);
});
```

### 4.4 Reactions

#### `message:reaction` - Reaction được thêm

```javascript
socket.on("message:reaction", (data) => {
  console.log("Reaction mới trên tin nhắn:", data.messageId);
  console.log("Reaction:", data.reaction);
});
```

**Payload:**
```typescript
{
  messageId: string;
  reaction: {
    _id: string;
    messageId: string;
    userId: string;
    emoji: string;
    createdAt: string;
  };
}
```

#### `message:reaction:remove` - Reaction được xóa

```javascript
socket.on("message:reaction:remove", (data) => {
  console.log("User xóa reaction:", data.userId);
  console.log("Emoji bị xóa:", data.emoji);
});
```

**Payload:**
```typescript
{
  messageId: string;
  userId: string;
  emoji?: string;
}
```

#### `message:reactions:clear` - Tất cả reactions bị xóa

```javascript
socket.on("message:reactions:clear", (data) => {
  console.log("Tất cả reactions đã bị xóa");
});
```

**Payload:**
```typescript
{
  messageId: string;
  userId: string;
}
```

### 4.5 Cuộc trò chuyện

#### `conversation:created` - Cuộc trò chuyện mới được tạo

```javascript
socket.on("conversation:created", (data) => {
  console.log("Cuộc trò chuyện mới:", data.conversation);
  console.log("Tin nhắn hệ thống:", data.systemMessage);
});
```

**Payload:**
```typescript
{
  conversation: ConversationObject;
  systemMessage: MessageObject;
}
```

#### `conversation:members_added` - Thành viên được thêm

```javascript
socket.on("conversation:members_added", (data) => {
  console.log("Cuộc trò chuyện:", data.conversationId);
  console.log("Thành viên mới:", data.newMembers);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  newMembers: MemberObject[];
}
```

#### `conversation:member_removed` - Thành viên bị xóa/rời

```javascript
socket.on("conversation:member_removed", (data) => {
  console.log("Thành viên bị xóa:", data.removedUserId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  removedUserId: string;
}
```

#### `conversation:updated` - Cập nhật thông tin cuộc trò chuyện

```javascript
socket.on("conversation:updated", (data) => {
  console.log("Cập nhật trong:", data.conversationId);
  console.log("Dữ liệu mới:", data.data);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  data: Partial<ConversationObject>;
}
```

### 4.6 Nhóm (Groups)

#### `group:admin_changed` - Thay đổi quyền admin

```javascript
socket.on("group:admin_changed", (data) => {
  console.log("User được thay đổi quyền:", data.targetUserId);
  console.log("Có phải admin?", data.isAdmin);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  targetUserId: string;
  isAdmin: boolean;
}
```

#### `group:owner_transferred` - Chuyển quyền trưởng nhóm

```javascript
socket.on("group:owner_transferred", (data) => {
  console.log("Chủ nhóm cũ:", data.oldOwnerId);
  console.log("Chủ nhóm mới:", data.newOwnerId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  oldOwnerId: string;
  newOwnerId: string;
}
```

#### `group:member_approved` - Phê duyệt thành viên

```javascript
socket.on("group:member_approved", (data) => {
  console.log("User được phê duyệt:", data.userId);
  console.log("Thông tin:", data.member);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  userId: string;
  member: MemberObject;
}
```

#### `group:member_rejected` - Từ chối thành viên

```javascript
socket.on("group:member_rejected", (data) => {
  console.log("User bị từ chối:", data.userId);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  userId: string;
}
```

#### `group:settings_updated` - Cập nhật cài đặt nhóm

```javascript
socket.on("group:settings_updated", (data) => {
  console.log("Cài đặt mới:", data.settings);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  settings: {
    allowSendLink: boolean;
    requireApproval: boolean;
    allowMemberInvite: boolean;
  };
}
```

### 4.7 Bầu chọn (Polls)

#### `poll:new` - Bình chọn mới

```javascript
socket.on("poll:new", (data) => {
  console.log("Bình chọn mới trong nhóm:", data.conversationId);
  console.log("Chi tiết:", data.poll);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  poll: {
    _id: string;
    conversationId: string;
    question: string;
    options: {
      _id: string;
      text: string;
      voteCount: number;
    }[];
    isMultipleChoice: boolean;
    allowAddOption: boolean;
    createdBy: string;
    createdAt: string;
    expiresAt?: string;
  };
}
```

#### `poll:vote` - Có người bầu chọn

```javascript
socket.on("poll:vote", (data) => {
  console.log("User bỏ phiếu:", data.userId);
  console.log("Bình chọn:", data.poll);
});
```

**Payload:**
```typescript
{
  conversationId: string;
  pollId: string;
  userId: string;
  poll: PollObject;
}
```

---

## 5. Rate Limits

| Event | Giới hạn | Window |
|-------|----------|--------|
| `sendMessage` | 60 | request/phút |
| `typing:start/stop` | 30 | request/phút |
| `addReaction` | 60 | request/phút |
| `editMessage` | 30 | request/phút |
| `deleteMessage` | 30 | request/phút |
| `revokeMessage` | 30 | request/phút |

> Khi vượt quá rate limit, server sẽ trả về callback với `error: "Rate limit exceeded. Please slow down."`

---

## 6. Ví dụ Code

### 6.1 Kết nối đầy đủ

```javascript
import { io } from "socket.io-client";

class ChatSocket {
  constructor(token) {
    this.socket = io("https://your-server.com/messages", {
      auth: { token },
      transports: ["websocket"],
    });

    this.setupListeners();
  }

  setupListeners() {
    // Tin nhắn
    this.socket.on("receiveMessage", (data) => this.handleNewMessage(data));
    this.socket.on("message:edited", (data) => this.handleEditedMessage(data));
    this.socket.on("message:deleted", (data) => this.handleDeletedMessage(data));
    this.socket.on("message:revoked", (data) => this.handleRevokedMessage(data));

    // Trạng thái
    this.socket.on("messageSeen", (data) => this.handleSeen(data));
    this.socket.on("messageDelivered", (data) => this.handleDelivered(data));

    // Typing
    this.socket.on("typing:start", (data) => this.handleTypingStart(data));
    this.socket.on("typing:stop", (data) => this.handleTypingStop(data));

    // Reactions
    this.socket.on("message:reaction", (data) => this.handleReaction(data));
    this.socket.on("message:reaction:remove", (data) => this.handleReactionRemove(data));

    // Nhóm
    this.socket.on("conversation:created", (data) => this.handleNewConversation(data));
    this.socket.on("conversation:members_added", (data) => this.handleMembersAdded(data));
    this.socket.on("group:admin_changed", (data) => this.handleAdminChanged(data));

    // Poll
    this.socket.on("poll:new", (data) => this.handleNewPoll(data));
    this.socket.on("poll:vote", (data) => this.handlePollVote(data));

    // Connection events
    this.socket.on("connect", () => console.log("Đã kết nối"));
    this.socket.on("disconnect", () => console.log("Mất kết nối"));
    this.socket.on("connect_error", (err) => console.error("Lỗi kết nối:", err));
  }

  // Join/Leave group
  joinGroup(conversationId) {
    return new Promise((resolve, reject) => {
      this.socket.emit("joinGroup", { conversationId }, (res) => {
        res.success ? resolve(res) : reject(new Error(res.error));
      });
    });
  }

  leaveGroup(conversationId) {
    return new Promise((resolve, reject) => {
      this.socket.emit("leaveGroup", { conversationId }, (res) => {
        res.success ? resolve(res) : reject(new Error(res.error));
      });
    });
  }

  // Tin nhắn
  sendMessage(conversationId, text, media = []) {
    return new Promise((resolve, reject) => {
      this.socket.emit("sendMessage", { conversationId, text, media }, (res) => {
        res.success ? resolve(res.message) : reject(new Error(res.error));
      });
    });
  }

  editMessage(messageId, text) {
    return new Promise((resolve, reject) => {
      this.socket.emit("editMessage", { messageId, text }, (res) => {
        res.success ? resolve(res.message) : reject(new Error(res.error));
      });
    });
  }

  // Trạng thái
  markAsSeen(conversationId, lastSeenMessageId) {
    this.socket.emit("messageSeen", { conversationId, lastSeenMessageId });
  }

  // Typing
  startTyping(conversationId, isGroup) {
    const payload = isGroup ? { groupId: conversationId } : { toUserId: conversationId };
    this.socket.emit("typing:start", payload);
  }

  stopTyping(conversationId, isGroup) {
    const payload = isGroup ? { groupId: conversationId } : { toUserId: conversationId };
    this.socket.emit("typing:stop", payload);
  }

  // Reactions
  addReaction(messageId, emoji) {
    return new Promise((resolve, reject) => {
      this.socket.emit("addReaction", { messageId, emoji }, (res) => {
        res.success ? resolve(res.reaction) : reject(new Error(res.error));
      });
    });
  }

  removeReaction(messageId, emoji) {
    return new Promise((resolve, reject) => {
      this.socket.emit("removeReaction", { messageId, emoji }, (res) => {
        res.success ? resolve(res.deletedCount) : reject(new Error(res.error));
      });
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// Sử dụng
const chatSocket = new ChatSocket("jwt-token-here");
await chatSocket.joinGroup("conv_123");
const message = await chatSocket.sendMessage("conv_123", "Hello!");
```

### 6.2 Xử lý Reconnection

```javascript
class ChatSocket {
  constructor(token) {
    this.token = token;
    this.joinedGroups = new Set();
    this.connect();
  }

  connect() {
    this.socket = io("https://your-server.com/messages", {
      auth: { token: this.token },
    });

    this.socket.on("connect", () => {
      console.log("Đã kết nối");
      // Re-join các group đã tham gia
      this.joinedGroups.forEach((groupId) => {
        this.socket.emit("joinGroup", { conversationId: groupId });
      });
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Mất kết nối:", reason);
    });
  }

  async joinGroup(conversationId) {
    this.joinedGroups.add(conversationId);
    return new Promise((resolve, reject) => {
      this.socket.emit("joinGroup", { conversationId }, (res) => {
        res.success ? resolve(res) : reject(new Error(res.error));
      });
    });
  }
}
```

### 6.3 Typing với Debounce

```javascript
class TypingManager {
  constructor(socket, conversationId, isGroup) {
    this.socket = socket;
    this.conversationId = conversationId;
    this.isGroup = isGroup;
    this.timeout = null;
  }

  onType() {
    // Gửi typing:start lần đầu
    if (!this.typing) {
      const payload = this.isGroup
        ? { groupId: this.conversationId }
        : { toUserId: this.conversationId };
      this.socket.emit("typing:start", payload);
      this.typing = true;
    }

    // Reset timeout
    clearTimeout(this.timeout);

    // Sau 3s không gõ nữa thì gửi typing:stop
    this.timeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  stopTyping() {
    clearTimeout(this.timeout);
    if (this.typing) {
      const payload = this.isGroup
        ? { groupId: this.conversationId }
        : { toUserId: this.conversationId };
      this.socket.emit("typing:stop", payload);
      this.typing = false;
    }
  }
}

// Sử dụng
const typing = new TypingManager(socket, "conv_123", true);

inputElement.addEventListener("input", () => {
  typing.onType();
});

sendButton.addEventListener("click", () => {
  typing.stopTyping();
  // Gửi tin nhắn...
});
```

---

## 7. Kiến trúc Room

### 7.1 Room Naming Convention

```
user:{userId}           → Nhận tin nhắn cá nhân
user_room:{userId}       → Nhận typing indicators 1-1
group:{conversationId}  → Nhận tin nhắn nhóm
group_room:{conversationId} → Nhận typing indicators nhóm
```

### 7.2 Flow gửi tin nhắn

```
1. Client A gửi sendMessage
       ↓
2. Server xử lý và lưu vào DB
       ↓
3. Server lấy danh sách thành viên
       ↓
4. Server emit "receiveMessage" tới từng user
       ↓
5. Client B, C, D nhận được tin nhắn mới
```

### 7.3 Flow typing indicator

```
1. Client A bắt đầu gõ
       ↓
2. Emit "typing:start" với groupId
       ↓
3. Server emit tới room "group_room:{conversationId}"
       ↓
4. Clients B, C, D nhận "typing:start"
       ↓
5. Client A ngừng gõ (hoặc timeout 3s)
       ↓
6. Emit "typing:stop"
       ↓
7. Server emit tới room
       ↓
8. Clients B, C, D nhận "typing:stop"
```

---

## 8. Data Models

### Message Object

```typescript
interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  type: "TEXT" | "MEDIA" | "FILE" | "SYSTEM";
  text?: string;
  media?: MediaAttachment[];
  replyTo?: {
    _id: string;
    text: string;
    senderName: string;
  };
  reactions?: Reaction[];
  isPinned: boolean;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
  seenBy?: string[];
  deliveredTo?: string[];
}

interface MediaAttachment {
  fileId: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  url: string;
  thumbnailUrl?: string;
  filename: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}
```

### Conversation Object

```typescript
interface Conversation {
  _id: string;
  name: string;
  type: "PRIVATE" | "GROUP";
  avatarUrl?: string;
  ownerId: string;
  adminIds: string[];
  members: Member[];
  settings: {
    allowSendLink: boolean;
    requireApproval: boolean;
    allowMemberInvite: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
```

### Member Object

```typescript
interface Member {
  _id: string;
  userId: string;
  name: string;
  avatar: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
}
```

### Poll Object

```typescript
interface Poll {
  _id: string;
  conversationId: string;
  question: string;
  options: {
    _id: string;
    text: string;
    voteCount: number;
  }[];
  isMultipleChoice: boolean;
  allowAddOption: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  totalVotes: number;
}
```

---

## 9. Error Handling

### Callback Error Response

```javascript
socket.emit("sendMessage", { conversationId, text }, (res) => {
  if (!res.success) {
    switch (res.error) {
      case "Unauthorized":
        // Token hết hạn, cần refresh
        break;
      case "Rate limit exceeded. Please slow down.":
        // Quá rate limit, đợi một chút
        break;
      default:
        // Lỗi khác
        console.error("Lỗi:", res.error);
    }
  }
});
```

### Common Error Codes

| Error | Mô tả | Hành động |
|-------|-------|-----------|
| `Unauthorized` | Token không hợp lệ | Refresh token |
| `Rate limit exceeded` | Quá giới hạn request | Đợi và thử lại |
| `conversationId is required` | Thiếu conversationId | Kiểm tra payload |
| `Either text or media is required` | Cần có nội dung | Thêm text hoặc media |
| `Message not found` | Tin nhắn không tồn tại | Refresh chat |
