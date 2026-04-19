# Message Pin & Reply Guide

> Comprehensive guide on how to load, manage, and display pinned messages and reply messages in the chat UI

---

## 1. Message Types Overview

### 1.1 Normal Message
```json
{
  "id": "msg_001",
  "conversationId": "conv_123",
  "senderId": "user_1",
  "type": "text",
  "text": "Hello everyone!",
  "media": null,
  "quotedMessageId": null,
  "pinned": false,
  "pinnedAt": null,
  "createdAt": "2024-01-20T10:00:00Z"
}
```

### 1.2 Reply Message (Quoted Message)
```json
{
  "id": "msg_002",
  "conversationId": "conv_123",
  "senderId": "user_2",
  "type": "text",
  "text": "I agree!",
  "quotedMessageId": "msg_001",          // ← Points to replied message
  "quotedMessagePreview": "Hello everyone!",
  "pinned": false,
  "createdAt": "2024-01-20T10:05:00Z"
}
```

### 1.3 Pinned Message
```json
{
  "id": "msg_003",
  "conversationId": "conv_123",
  "senderId": "user_1",
  "type": "text",
  "text": "Important announcement",
  "media": null,
  "quotedMessageId": null,
  "pinned": true,                        // ← Pinned flag
  "pinnedAt": "2024-01-20T10:10:00Z",    // ← When pinned
  "createdAt": "2024-01-20T10:08:00Z"
}
```

### 1.4 Pinned Reply Message (Combination)
```json
{
  "id": "msg_004",
  "conversationId": "conv_123",
  "senderId": "user_3",
  "type": "text",
  "text": "Replying to important announcement",
  "quotedMessageId": "msg_003",          // ← Reply to msg_003
  "quotedMessagePreview": "Important announcement",
  "pinned": true,                        // ← Also pinned!
  "pinnedAt": "2024-01-20T10:15:00Z",
  "createdAt": "2024-01-20T10:12:00Z"
}
```

---

## 2. Loading Strategy

### 2.1 Load Pinned Messages (Separate Endpoint)

**Endpoint:** `GET /v1/conversations/{conversationId}/pinned-messages`

```bash
curl -X GET \
  "http://localhost:4000/v1/conversations/conv_123/pinned-messages" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "data": [
    {
      "id": "msg_003",
      "text": "Important announcement",
      "pinned": true,
      "pinnedAt": "2024-01-20T10:10:00Z",
      "quotedMessageId": null              // ← Normal pinned message
    },
    {
      "id": "msg_004",
      "text": "Replying to important announcement",
      "pinned": true,
      "pinnedAt": "2024-01-20T10:15:00Z",
      "quotedMessageId": "msg_003"         // ← Pinned reply message!
    }
  ]
}
```

**Key Point:** Pinned messages list includes **both regular pinned messages AND pinned replies**

---

### 2.2 Load Message List (Includes Replies)

**Endpoints:**
- `GET /v1/conversations/{conversationId}/messages` - Get all messages with cursor
- `GET /v1/conversations/{conversationId}/messages/cursor?cursor=&limit=20` - Paginated

```bash
curl -X GET \
  "http://localhost:4000/v1/conversations/conv_123/messages?limit=50" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "data": {
    "messages": [
      { "id": "msg_001", "text": "Hello", "quotedMessageId": null, "pinned": false },
      { "id": "msg_002", "text": "I agree!", "quotedMessageId": "msg_001", "pinned": false },
      { "id": "msg_003", "text": "Important announcement", "quotedMessageId": null, "pinned": true },
      { "id": "msg_004", "text": "Replying...", "quotedMessageId": "msg_003", "pinned": true }
    ],
    "cursor": "next_cursor_token"
  }
}
```

**Key Points:**
- Returns ALL messages (normal + replies + pinned + pinned replies)
- Replies are identified by `quotedMessageId !== null`
- Pinned messages have `pinned: true`

---

## 3. Feature Comparison Matrix

| Feature | Regular Message | Reply Message | Pinned Message | Pinned Reply |
|---------|-----------------|---------------|----------------|--------------|
| Has `quotedMessageId` | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Has `quotedMessagePreview` | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Has `pinned: true` | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| In main message list | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| In pinned-messages endpoint | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Separate loader needed | ❌ No | ❌ No | ✅ Yes | ✅ No (included in pinned) |
| Realtime event | `receiveMessage` | `receiveMessage` | `message:pinned` | `message:pinned` |

---

## 4. Realtime Socket Events

### 4.1 Receiving New Reply Message
```javascript
socket.on("receiveMessage", (data) => {
  const { message, conversationId } = data;
  
  if (message.quotedMessageId) {
    console.log("New reply received");
    console.log("Reply to:", message.quotedMessageId);
    console.log("Preview:", message.quotedMessagePreview);
  }
});
```

### 4.2 When Message Gets Pinned
```javascript
socket.on("message:pinned", (data) => {
  const { messageId, conversationId, pinnedAt } = data;
  console.log("Message pinned:", messageId);
  // This could be a normal message OR a reply message getting pinned
});
```

### 4.3 When Message Gets Unpinned
```javascript
socket.on("message:unpinned", (data) => {
  const { messageId, conversationId } = data;
  console.log("Message unpinned:", messageId);
});
```

### 4.4 When Reply Message is Deleted
```javascript
socket.on("receiveMessage", (data) => {
  // If deletedAt is set, message is soft-deleted
  if (data.message.deletedAt) {
    console.log("Message deleted:", data.message.id);
  }
});
```

---

## 5. Backend Implementation Details

### 5.1 Message Schema (Model)

From `src/modules/chat/model/model.ts`:

```typescript
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  type: z.nativeEnum(MessageType),
  text: z.string().optional(),
  media: z.array(MessageMediaSchema).optional(),
  links: z.array(z.string()).optional(),
  deletedForUserIds: z.array(z.string()).optional(),
  
  // Reply/Quote fields
  quotedMessageId: z.string().optional(),        // ← Reply to message ID
  quotedMessagePreview: z.string().optional(),   // ← Preview of quoted message
  
  mentions: z.array(MessageMentionSchema).optional(),
  createdAt: z.date(),
  editedAt: z.date().optional(),
  deletedAt: z.date().optional(),
  
  // Pin fields
  pinned: z.boolean().default(false),           // ← Is pinned
  pinnedAt: z.date().optional(),                 // ← When pinned
  
  readBy: z.array(z.object({
    userId: z.string(),
    readAt: z.date(),
  })).optional(),
});

export type Message = z.infer<typeof MessageSchema>;
```

### 5.2 Creating Reply Message (Socket)

From `src/modules/chat/infras/transport/socket-service.ts`:

```typescript
socket.on("quoteMessage", async (payload, callback) => {
  const { conversationId, quotedMessageId, text, media } = payload;
  
  // Validate quotedMessageId exists
  const quotedMessageObj = await this.useCase.getMessage(quotedMessageId);
  if (!quotedMessageObj) {
    return callback({ success: false, error: "Quoted message not found" });
  }
  
  // Create reply message with quotedMessageId
  const newMessage = await this.useCase.createMessage({
    conversationId,
    senderId: currentUserId,
    text,
    media,
    quotedMessageId,  // ← Set this field
    quotedMessagePreview: quotedMessageObj.text
  });
  
  // Broadcast to all members
  this.socketService.emitToRoom(conversationId, "receiveMessage", {
    message: newMessage
  });
  
  callback({ success: true, data: newMessage });
});
```

### 5.3 Pinning a Message (HTTP)

From `src/modules/chat/infras/transport/http-service.ts`:

```typescript
async pinMessageAPI(req: Request, res: Response) {
  const messageId = req.params.messageId;
  const currentUserId = res.locals["requester"].sub;
  
  // Pin message (works for any message: normal, reply, etc.)
  const message = await this.useCase.pinMessage(messageId, currentUserId);
  
  // Broadcast pin event
  const { conversationId } = message;
  this.socketService.emitToRoom(conversationId, "message:pinned", {
    messageId,
    conversationId,
    pinnedAt: message.pinnedAt
  });
  
  res.status(200).json({ data: message });
}
```

### 5.4 Loading Pinned Messages (HTTP)

From `src/modules/chat/infras/transport/http-service.ts`:

```typescript
async getPinnedMessagesAPI(req: Request, res: Response) {
  const conversationId = req.params.conversationId;
  const currentUserId = res.locals["requester"].sub;
  
  // Get all pinned messages (includes pinned replies)
  const messages = await this.useCase.getPinnedMessages(conversationId, currentUserId);
  
  res.status(200).json({ data: messages });
}
```

---

## 6. Frontend Implementation Guide

### 6.1 Initial Load Strategy

```typescript
// 1. Load main conversation
const conversation = await getConversation(conversationId);

// 2. Load initial message list
const { messages, cursor } = await getMessages(conversationId, { limit: 50 });
renderMessages(messages);

// 3. Load pinned messages (SEPARATE)
const pinnedMessages = await getPinnedMessages(conversationId);
renderPinnedMessagesBar(pinnedMessages);
```

### 6.2 Render Normal Message
```typescript
function renderMessage(message) {
  let html = `
    <div class="message" data-id="${message.id}">
      <div class="sender">${message.senderId}</div>
      <div class="text">${message.text}</div>
  `;
  
  // Show pin button
  html += `<button onclick="pinMessage('${message.id}')">📌 Pin</button>`;
  
  html += '</div>';
  return html;
}
```

### 6.3 Render Reply Message
```typescript
function renderMessage(message) {
  let html = `
    <div class="message" data-id="${message.id}">
  `;
  
  // If this is a reply, show quoted message
  if (message.quotedMessageId) {
    html += `
      <div class="quoted">
        <div class="quoted-label">Reply to:</div>
        <div class="quoted-text">${message.quotedMessagePreview}</div>
      </div>
    `;
  }
  
  html += `
      <div class="sender">${message.senderId}</div>
      <div class="text">${message.text}</div>
      <button onclick="replyMessage('${message.id}')">💬 Reply</button>
      <button onclick="pinMessage('${message.id}')">📌 Pin</button>
    </div>
  `;
  
  return html;
}
```

### 6.4 Render Pinned Messages Bar
```typescript
function renderPinnedMessagesBar(pinnedMessages) {
  let html = '<div class="pinned-bar"><strong>📌 Pinned Messages:</strong>';
  
  pinnedMessages.forEach(msg => {
    // Could be normal message or reply
    let label = msg.quotedMessageId ? '↪️ Reply' : '📌 Message';
    html += `
      <div class="pinned-item" onclick="scrollToMessage('${msg.id}')">
        ${label}: ${msg.text.substring(0, 50)}...
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}
```

### 6.5 Setup Socket Listeners

```typescript
// Listen for new messages (including replies)
socket.on("receiveMessage", (data) => {
  const { message, conversationId } = data;
  
  if (conversationId === currentConversationId) {
    // Add to message list (works for normal + reply messages)
    messages.push(message);
    renderMessages(messages);
    
    // If it's a pinned reply or pinned message, update pinned bar too
    if (message.pinned) {
      pinnedMessages.push(message);
      renderPinnedMessagesBar(pinnedMessages);
    }
  }
});

// Listen for pin events
socket.on("message:pinned", (data) => {
  const { messageId, conversationId } = data;
  
  if (conversationId === currentConversationId) {
    // Find message and mark as pinned
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      msg.pinned = true;
      msg.pinnedAt = new Date();
      pinnedMessages.push(msg);
      renderPinnedMessagesBar(pinnedMessages);
    }
  }
});

// Listen for unpin events
socket.on("message:unpinned", (data) => {
  const { messageId, conversationId } = data;
  
  if (conversationId === currentConversationId) {
    pinnedMessages = pinnedMessages.filter(m => m.id !== messageId);
    renderPinnedMessagesBar(pinnedMessages);
  }
});
```

---

## 7. API Endpoints Summary

### Create Operations

| Operation | Method | Endpoint | Realtime Event |
|-----------|--------|----------|-----------------|
| Send Message | Socket | `socket.emit("sendMessage")` | `receiveMessage` |
| **Send Reply** | Socket | `socket.emit("quoteMessage")` | `receiveMessage` |
| Edit Message | PUT | `/v1/messages/{id}` | `message:edited` |
| Pin Message | POST | `/v1/messages/{id}/pin` | `message:pinned` |
| Unpin Message | DELETE | `/v1/messages/{id}/pin` | `message:unpinned` |

### Read Operations

| Operation | Method | Endpoint | Returns |
|-----------|--------|----------|---------|
| Get Messages | GET | `/v1/conversations/{id}/messages` | Array of messages (normal + replies) |
| Get Messages (Cursor) | GET | `/v1/conversations/{id}/messages/cursor?limit=20` | Paginated message list |
| **Get Pinned Messages** | GET | `/v1/conversations/{id}/pinned-messages` | Array of pinned messages (+ pinned replies) |
| Get Message Details | GET | `/v1/messages/{id}` | Single message object |

### Delete Operations

| Operation | Method | Endpoint | Realtime Event |
|-----------|--------|----------|-----------------|
| Delete Message | DELETE | `/v1/messages/{id}` | `message:deleted` |
| Revoke Message | POST | `/v1/messages/{id}/revoke` | `message:revoked` |

---

## 8. Common Issues & Solutions

### Issue 1: "Reply message not appearing in pinned list"
**Solution:** Pinned replies ARE included in `/pinned-messages` endpoint. Just check that `pinned: true` is set.

### Issue 2: "Can't find quoted message when creating reply"
**Solution:** Backend validates `quotedMessageId` exists before creating reply. Ensure message ID is correct.

### Issue 3: "UI not updating when message gets pinned"
**Solution:** Listen to `message:pinned` socket event and update both message list and pinned bar.

### Issue 4: "Pagination broken when loading more messages"
**Solution:** Use cursor-based pagination: `GET /messages/cursor?cursor=...&limit=20`

### Issue 5: "Pinned message still showing after unpinning"
**Solution:** Listen to `message:unpinned` event and remove from pinned messages list.

---

## 9. Complete Flow Diagram

```
┌─── Load Conversation ───┐
│                         │
├─► GET /conversations/{id}/messages
│   └─► Returns: Normal + Reply + Pinned + Pinned Reply messages
│
├─► GET /conversations/{id}/pinned-messages  
│   └─► Returns: Pinned + Pinned Reply messages only
│
└─► socket.on("receiveMessage") - Listen for NEW messages
    socket.on("message:pinned") - Listen for pin events
    socket.on("message:unpinned") - Listen for unpin events
    socket.on("message:edited") - Listen for edit events
```

---

## 10. Data Structure Reference

### Message Object (Complete)
```json
{
  "id": "msg_001",
  "conversationId": "conv_123",
  "senderId": "user_1",
  "type": "text",
  "text": "Reply message content",
  "media": [],
  "links": [],
  "deletedForUserIds": [],
  
  // Reply fields
  "quotedMessageId": "msg_000",
  "quotedMessagePreview": "Original message text",
  
  // Mentions
  "mentions": [
    {
      "userId": "user_2",
      "displayName": "John",
      "position": 0
    }
  ],
  
  // Timestamps
  "createdAt": "2024-01-20T10:05:00Z",
  "editedAt": null,
  "deletedAt": null,
  
  // Pin fields
  "pinned": true,
  "pinnedAt": "2024-01-20T10:15:00Z",
  
  // Read status
  "readBy": [
    {
      "userId": "user_2",
      "readAt": "2024-01-20T10:06:00Z"
    }
  ]
}
```

---

## 11. Implementation Checklist

- [ ] Load conversation and initial messages
- [ ] Load pinned messages (SEPARATE endpoint)
- [ ] Display messages in list (normal + reply + pinned)
- [ ] Display pinned bar (normal + reply can be pinned)
- [ ] Setup reply button → emit `quoteMessage`
- [ ] Setup pin button → POST `/messages/{id}/pin`
- [ ] Setup unpin button → DELETE `/messages/{id}/pin`
- [ ] Listen to `receiveMessage` (new normal + reply)
- [ ] Listen to `message:pinned` (update pinned bar)
- [ ] Listen to `message:unpinned` (remove from pinned bar)
- [ ] Handle pagination for messages
- [ ] Show quoted message preview in reply
- [ ] Test pinning a reply message
- [ ] Test unpinning a message
- [ ] Test deleting a reply message

---

## 12. FAQ

**Q: Can I pin a reply message?**  
A: ✅ Yes! A message can have both `quotedMessageId` AND `pinned: true`.

**Q: Do I need a separate endpoint to load reply messages?**  
A: ❌ No! Replies are part of the main message list. Use `GET /conversations/{id}/messages`.

**Q: Will pinned replies appear in the pinned messages list?**  
A: ✅ Yes! `GET /conversations/{id}/pinned-messages` returns both regular pinned messages and pinned replies.

**Q: What happens if I delete the original message that someone replied to?**  
A: The reply message still exists, but `quotedMessagePreview` might be empty or show "[Message deleted]".

**Q: Can a message be both pinned and deleted?**  
A: Technically yes, but soft-deleted messages won't show in UI. Check `deletedAt` field.

**Q: What's the rate limit for replying?**  
A: `quoteMessage` has a 60-second rate limit per user per conversation.

---

**Last Updated:** April 20, 2026  
**Status:** ✅ Complete with Pin + Reply documentation
