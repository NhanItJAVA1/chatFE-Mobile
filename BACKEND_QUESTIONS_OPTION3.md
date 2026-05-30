# 🔍 Câu Hỏi Cho Backend Team - Kiểm Tra Support cho Option 3 (Hybrid Approach)

> **Bối cảnh:** FE hiện tại chỉ allow chat với bạn bè (friend status). Bây giờ muốn cho phép chat tự do hơn + thêm "My Document" feature.

---

## 📋 PHẦN 1: CÁC ENDPOINT HIỆN CÓ (dựa trên FE code)

### ✅ Conversation Endpoints Hiện Có

```
POST   /conversations/private           → Tạo/get private conversation
GET    /conversations                   → Fetch danh sách conversations (paginated)
GET    /conversations/{id}              → Chi tiết conversation
GET    /conversations/{id}/messages     → Fetch messages (paginated with cursor)
POST   /conversations/{id}/seen         → Mark conversation as read
DELETE /conversations/{id}              → Delete conversation
PATCH  /conversations/{id}              → Update conversation
POST   /conversations/{id}/members      → Add members (group)
DELETE /conversations/{id}/members/{id} → Remove member
POST   /conversations/{id}/mute         → Mute conversation
```

### ✅ Friend Endpoints Hiện Có

```
GET    /friendships                     → Fetch danh sách bạn bè
POST   /friend-requests/{userId}        → Gửi lời mời kết bạn
GET    /friend-requests/received        → Lời mời nhận được
DELETE /friendships/{friendId}          → Unfriend
```

---

## ❓ PHẦN 2: CÂU HỎI CHO BACKEND

### **A. Support Non-Friend Conversations**

#### **Q1: POST /conversations/private có thể tạo conversation với người NON-FRIEND không?**

- **Current behavior:** Có error không (409 Conflict)?
- **Needed behavior:** Cho phép tạo conversation với bất kỳ userId nào
- **Response status:** 
  - 201 Created (conversation mới)
  - 200 OK (conversation đã tồn tại)

**Follow-up:** Conversation được return có những field nào? 
- Cần có: `_id`, `type`, `members`, `pairKey`
- Nice to have: `status` field (ACTIVE/PENDING/BLOCKED)

---

#### **Q2: Conversation model hiện tại có `status` field không?**

```ts
// Hiện tại Conversation type như thế này:
interface Conversation {
    _id: string;
    type: "PRIVATE" | "GROUP";
    name?: string;
    members?: string[];
    pairKey?: string;
    // ... các field khác
}

// Cần thêm status field:
status: "ACTIVE" | "PENDING" | "BLOCKED" | "ARCHIVED"?
```

- **Nếu CÓ:** Value nào có sẵn? Có cách nào set status không (API)?
- **Nếu KHÔNG:** Có thể thêm được không?

---

#### **Q3: GET /conversations - Backend return condition gì?**

Hiện tại `/conversations` return những conversation nào?

- ✅ Tất cả conversation user là member?
- ✅ Chỉ conversation có status = "ACTIVE"?
- ✅ Bao gồm cả PENDING (người chưa kết bạn nhưng đã nhắn)?
- ❌ Không return conversation nếu unfriend/block?

---

#### **Q4: Khi unfriend hoặc block, conversation bị xử lý như thế nào?**

```
Options:
a) Xóa luôn (DELETE) → lịch sử chat mất
b) Set status = "ARCHIVED" → vẫn tồn tại, just ẩn
c) Set status = "BLOCKED" → không thể mở
d) Giữ nguyên nhưng add "blocked_by" field
e) Khác?
```

- Hiện tại backend xử lý gì?
- FE có cách nào để detect user đã unfriend không (socket event)?

---

### **B. Message Request Feature**

#### **Q5: Có endpoint nào để fetch "message requests" (non-friend conversations) không?**

**Needed:**
```ts
GET /conversations/requests
// Response:
{
  items: [
    {
      _id: "...",
      type: "PRIVATE",
      otherUser: { id, displayName, phone, avatar },
      status: "PENDING",  // chưa accept
      lastMessage: { text, sentAt },
      unreadCount: 3
    }
  ]
}
```

- Hiện tại có endpoint này không?
- Nếu không, có cách nào filter được không (dùng query param `?status=PENDING`)?

---

#### **Q6: Có way nào để "accept" hoặc "decline" message request không?**

```ts
POST /conversations/{id}/accept-request
POST /conversations/{id}/reject-request
```

- Khi accept → status thay đổi thành "ACTIVE"?
- Socket event nào được emit?

---

### **C. My Document Feature**

#### **Q7: Backend hỗ trợ "saved messages" hoặc "my document" feature không?**

**Zalo-style:** Một nơi user có thể save tin nhắn, ảnh, file để xem lại sau

**Options:**
1. **Create special conversation:**
   ```ts
   POST /conversations/my-document
   // Response: { type: "SYSTEM", name: "My Document", members: [currentUserId] }
   ```

2. **Separate API:**
   ```ts
   POST /saved-messages
   GET /saved-messages
   DELETE /saved-messages/{id}
   ```

3. **Không có hỗ trợ sẵn** → Cần implement từ đầu

- Hiện tại backend có gì hỗ trợ không?
- Nếu có, API là gì?

---

### **D. Blocking & Security**

#### **Q8: Block/Unblock user - API là gì?**

```ts
POST /users/{userId}/block
DELETE /users/{userId}/block
GET /users/blocked
```

- Khi block someone, conversation còn hiển thị không?
- Blocked user có thể gửi message không?
- FE có socket event để detect khi bị block không?

---

#### **Q9: Blocking relationship có lưu không (one-way)?**

```
User A block User B:
- B không thể nhắn A
- A có thể nhắn B (nhưng B không nhận?)
- Hay cả hai chiều bị block?
```

---

### **E. Socket Events**

#### **Q10: Hiện tại emit các socket event nào cho conversation?**

```ts
// Hiện có gì?
"conversation:created"
"conversation:updated"
"conversation:deleted"
"message:received"
"friendship:unfriended"
"user:blocked"
?
```

- Khi có new conversation từ non-friend → emit event nào?
- Khi unfriend → chỉ emit `friendship:unfriended` hay cũng có `conversation:status-changed`?

---

### **F. API Rate & Validation**

#### **Q11: Có anti-spam protection không?**

```
Scenario:
- User A mở 1000 conversations với 1000 users trong 1 phút
- System có detect/prevent không?
```

---

## 📊 PHẦN 3: Expected Response Format

### Nếu Backend Đã Support Option 3

Backend response JSON structure nên như thế này:

```json
{
  "conversation": {
    "_id": "uuid",
    "type": "PRIVATE",
    "members": ["userId1", "userId2"],
    "pairKey": "userId1_userId2",
    "status": "PENDING",
    "otherUser": {
      "id": "userId2",
      "displayName": "Nguyễn Văn A",
      "phone": "+84912345678",
      "avatar": "https://..."
    },
    "lastMessage": {
      "text": "Hi there!",
      "senderId": "userId2",
      "createdAt": "2026-05-30T10:00:00Z"
    },
    "unreadCount": 1,
    "createdAt": "2026-05-30T10:00:00Z",
    "updatedAt": "2026-05-30T10:05:00Z"
  }
}
```

---

## 🎯 PHẦN 4: Prioritized Questions (Hỏi cái gì trước)

### 🔴 **Critical** (PHẢI HỎI TRƯỚC)
1. **Q1:** POST /conversations/private có tạo được với non-friend không?
2. **Q2:** Conversation model có status field không?
3. **Q4:** Unfriend/block xử lý conversation như thế nào?

### 🟡 **Important** (NÊN HỎI)
4. **Q5:** Có endpoint message requests không?
5. **Q7:** "My Document" / "saved messages" hỗ trợ gì?

### 🟢 **Nice to Have**
6. **Q10:** Socket events hiện tại?
7. **Q11:** Rate limiting protection?

---

## 💡 Suggestion for Backend Team

Nếu backend **CHƯA hỗ trợ** features này, đề xuất thêm:

```ts
// New endpoints cần thêm:

// 1. Message Requests (non-friend conversations)
GET /conversations/requests              // Fetch message requests
POST /conversations/{id}/accept          // Accept message request
POST /conversations/{id}/reject          // Reject message request

// 2. My Document / Saved Messages
POST /conversations/my-document          // Create "My Document"
GET /saved-messages                      // Or list saved items
POST /messages/{id}/save                 // Save message to My Document
DELETE /saved-messages/{id}              // Delete saved item

// 3. Enhanced Conversation Status
PATCH /conversations/{id}/status         // Update conversation status
GET /conversations?status=PENDING        // Filter by status

// 4. Blocking
POST /users/{userId}/block               // Block user
DELETE /users/{userId}/block             // Unblock
GET /users/blocked                       // List blocked users

// 5. Conversation Archive
POST /conversations/{id}/archive         // Archive conversation
GET /conversations?archived=true         // Show archived
```

---

## 📝 Questions to Send to Backend Team

**Template email/message:**

```
Hi Backend Team,

Hiện tại FE có requirement mới cho chat feature:
1. Allow users mở chat với non-friends (message requests like FB Messenger)
2. Thêm "My Document" feature (like Zalo storage)

Để implement, cần confirm backend support cho các điểm sau:

🔴 CRITICAL:
- ❓ POST /conversations/private có tạo conversation với non-friend không?
- ❓ Conversation model có status field không? (ACTIVE/PENDING/BLOCKED/ARCHIVED)
- ❓ Khi unfriend/block, conversation bị xử lý thế nào? (delete vs archive)

🟡 IMPORTANT:
- ❓ Có endpoint nào fetch message requests (non-friend conversations)?
- ❓ Backend hỗ trợ "My Document" / "saved messages" không?

Chúng em cần response để design FE correctly.

Thanks!
```

---

## 🔗 Related Frontend Files to Update

Nếu backend support, FE sẽ update:
- [conversationService.ts](src/shared/services/conversationService.ts)
- [HomeScreen.tsx](src/mobile/src/screens/HomeScreen.tsx)
- [ChatScreen.tsx](src/mobile/src/screens/ChatScreen.tsx)
- [useChat.ts hook](src/shared/hooks/useChat.ts)
- Add: MyDocumentScreen.tsx (mới)
