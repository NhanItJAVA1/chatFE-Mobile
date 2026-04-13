# ChatBE Messaging Features Documentation

## Overview
Complete guide to all messaging features supported by ChatBE backend for FE implementation.

---

## 1. Multiple Images Gallery

### Feature
Send multiple images in a single message request, backend creates one message per image.

### API Endpoint
```
POST /conversations/:conversationId/messages
```

### Request Body
```json
{
  "conversationId": "uuid",
  "senderId": "uuid",
  "text": "Check these photos",
  "media": [
    {
      "url": "s3://bucket/img1.jpg",
      "filename": "img1.jpg",
      "mimetype": "image/jpeg",
      "size": 1024000
    },
    {
      "url": "s3://bucket/img2.jpg",
      "filename": "img2.jpg",
      "mimetype": "image/jpeg",
      "size": 2048000
    },
    {
      "url": "s3://bucket/img3.jpg",
      "filename": "img3.jpg",
      "mimetype": "image/jpeg",
      "size": 1512000
    }
  ]
}
```

### Response
Backend returns **3 separate Message objects**:
```json
[
  {
    "id": "msg-uuid-1",
    "conversationId": "conv-uuid",
    "senderId": "sender-uuid",
    "type": "IMAGE",
    "text": "Check these photos",
    "media": [
      {
        "url": "s3://bucket/img1.jpg",
        "mediaType": "IMAGE",
        "name": "img1.jpg",
        "size": 1024000
      }
    ],
    "createdAt": "2026-04-13T10:30:00Z"
  },
  {
    "id": "msg-uuid-2",
    "conversationId": "conv-uuid",
    "senderId": "sender-uuid",
    "type": "IMAGE",
    "text": "Check these photos",
    "media": [
      {
        "url": "s3://bucket/img2.jpg",
        "mediaType": "IMAGE",
        "name": "img2.jpg",
        "size": 2048000
      }
    ],
    "createdAt": "2026-04-13T10:30:01Z"
  },
  {
    "id": "msg-uuid-3",
    "conversationId": "conv-uuid",
    "senderId": "sender-uuid",
    "type": "IMAGE",
    "text": "Check these photos",
    "media": [
      {
        "url": "s3://bucket/img3.jpg",
        "mediaType": "IMAGE",
        "name": "img3.jpg",
        "size": 1512000
      }
    ],
    "createdAt": "2026-04-13T10:30:02Z"
  }
]
```

### FE Implementation
**FE should:**
1. Upload all 3 files to S3 (get presigned URLs)
2. Send single API request with all 3 media objects
3. Receive 3 messages back
4. **Optionally**: Detect consecutive IMAGE messages from same user (within seconds) and render as a gallery view

**Gallery Detection Logic:**
```typescript
// If messages[i], messages[i+1], messages[i+2] are:
// - type === MESSAGE_TYPE.IMAGE
// - senderId === same
// - createdAt within 3 seconds apart
// → render as image gallery (horizontal scroll)
```

---

## 2. Last Message in Conversation List

### Feature
Display conversation list with last message preview, unread count, and timestamp - like Messenger.

### API Endpoint
```
GET /conversations?page=1&limit=20
```

### Response
```json
[
  {
    "id": "conv-uuid-1",
    "type": "PRIVATE",
    "name": null,
    "avatarUrl": "...",
    "membersCount": 2,
    "lastMessage": {
      "messageId": "msg-uuid",
      "senderId": "friend-uuid",
      "type": "TEXT",
      "textPreview": "Bạn khỏe không?",
      "createdAt": "2026-04-13T10:35:00Z"
    },
    "lastMessageAt": "2026-04-13T10:35:00Z",
    "unreadCount": 3,
    "role": "MEMBER",
    "createdAt": "2026-04-01T00:00:00Z"
  },
  {
    "id": "conv-uuid-2",
    "type": "GROUP",
    "name": "Nhóm bạn bè",
    "avatarUrl": "...",
    "membersCount": 5,
    "lastMessage": {
      "messageId": "msg-uuid-2",
      "senderId": "user2-uuid",
      "type": "IMAGE",
      "textPreview": "📷 Image",
      "createdAt": "2026-04-13T10:20:00Z"
    },
    "lastMessageAt": "2026-04-13T10:20:00Z",
    "unreadCount": 0,
    "role": "MEMBER",
    "createdAt": "2026-04-01T00:00:00Z"
  }
]
```

### Features
- **Auto-sorted**: Newest conversations first (by `lastMessageAt`)
- **Unread badge**: `unreadCount > 0` shows number
- **Media preview**: 
  - Images: `📷 Image`
  - Files: `📎 File`
- **Text preview**: Auto-truncated to 100 characters
- **No extra API calls**: All data included in single response

### FE Implementation
```tsx
const renderConversationList = (conversations: Conversation[]) => {
  return conversations.map(conv => (
    <ConversationItem key={conv.id}>
      <Avatar src={conv.avatarUrl} />
      <div className="info">
        <div className="name">{conv.name || "Unknown"}</div>
        <div className="last-message">
          {conv.lastMessage?.textPreview}
        </div>
        <div className="timestamp">
          {formatTime(conv.lastMessageAt)}
        </div>
      </div>
      {conv.unreadCount > 0 && (
        <Badge>{conv.unreadCount}</Badge>
      )}
    </ConversationItem>
  ))
}
```

---

## 3. Message Seen (Read Receipts)

### Feature
Mark messages as seen and broadcast the event to other members.

### API Endpoint
```
POST /conversations/:conversationId/seen
```

### Request Body
```json
{
  "lastSeenMessageId": "message-uuid"
}
```

### Socket Event (Namespace: `/messages`)
**Listen for:** `messageSeen`
```json
{
  "conversationId": "conv-uuid",
  "userId": "user-uuid",
  "lastSeenMessageId": "msg-uuid"
}
```

### Behavior
1. FE sends `messageSeen` socket event when user scrolls to latest message
2. BE marks `unreadCount = 0` for the conversation member
3. BE broadcasts `messageSeen` event to all other members
4. Other members update UI to show message as "seen"

### FE Implementation
```typescript
// When conversation is opened and scrolled to bottom
socket.emit('messageSeen', {
  conversationId: currentConversationId,
  lastSeenMessageId: latestMessageId
}, (response) => {
  if (response.success) {
    console.log('Message marked as seen');
    unreadCount = 0;
  }
});

// Listen for other members seeing messages
socket.on('messageSeen', (payload) => {
  console.log(`${payload.userId} saw message up to ${payload.lastSeenMessageId}`);
  // Update UI - gray out message bubble or add checkmark
});
```

### Behavior Details
- `lastSeenMessageId` must be valid message in conversation
- `unreadCount` auto-resets to 0
- Event broadcasts to all conversation members

---

## 4. Message Revoke & Delete

### Feature
3 different ways to remove/hide messages with different permissions and visibility.

### 4.1 Revoke Message (Thu hồi)
**Only sender can revoke within 24 hours**

#### API Endpoint
```
POST /messages/:messageId/revoke
```

#### Request Body
```json
{}
```

#### Response
```json
{
  "id": "msg-uuid",
  "conversationId": "conv-uuid",
  "type": "SYSTEM",
  "text": "Đã thu hồi",
  "media": [],
  "deletedAt": "2026-04-13T10:36:00Z",
  "createdAt": "2026-04-13T10:30:00Z"
}
```

#### Socket Event
**Event:** `message:revoked`
```json
{
  "conversationId": "conv-uuid",
  "messageId": "msg-uuid",
  "revokedBy": "user-uuid"
}
```

#### Limitations
- ⏱️ Only within 24 hours of creation
- 👤 Sender only
- 🔄 Message becomes SYSTEM type
- 📝 Text shows "Đã thu hồi"

---

### 4.2 Delete for Everyone
**Only sender can delete within 24 hours (all members see "[Tin nhắn đã bị xóa]")**

#### API Endpoint
```
POST /messages/:messageId/delete-for-everyone
```

#### Request Body
```json
{}
```

#### Response
```json
{
  "id": "msg-uuid",
  "conversationId": "conv-uuid",
  "type": "SYSTEM",
  "text": "Tin nhắn đã bị xóa",
  "media": [],
  "deletedAt": "2026-04-13T10:36:00Z",
  "createdAt": "2026-04-13T10:30:00Z"
}
```

#### Socket Event
**Event:** `message:deleted_for_everyone`
```json
{
  "conversationId": "conv-uuid",
  "messageId": "msg-uuid",
  "deletedBy": "user-uuid"
}
```

#### Limitations
- ⏱️ Only within 24 hours of creation
- 👤 Sender only
- 🔄 Message becomes SYSTEM type
- 📝 Text shows "Tin nhắn đã bị xóa"
- 📢 Everyone sees the deletion

---

### 4.3 Delete for Me (Xóa cho riêng tôi)
**Any member can delete anytime (hidden only for current user)**

#### API Endpoint
```
POST /messages/:messageId/delete
```

#### Request Body
```json
{}
```

#### Response
```json
{
  "success": true
}
```

#### Socket Event
**Event:** `message:deleted`
```json
{
  "conversationId": "conv-uuid",
  "messageId": "msg-uuid",
  "deletedBy": "user-uuid"
}
```

#### Behavior
- ♾️ No time limit
- 👥 Any member can delete
- 🔒 Hidden only for current user
- 📊 Other members still see the message
- 🆔 Message added to `deletedForUserIds` array for current user

---

### Comparison Table

| Feature | Revoke | Delete For Everyone | Delete For Me |
|---------|--------|---------------------|---------------|
| **Endpoint** | POST /messages/:id/revoke | POST /messages/:id/delete-for-everyone | POST /messages/:id/delete |
| **Time Limit** | 24 hours | 24 hours | ∞ Unlimited |
| **Who Can** | Sender only | Sender only | Any member |
| **Visibility** | Everyone sees "[Đã thu hồi]" | Everyone sees "[Tin nhắn đã bị xóa]" | Hidden for user only |
| **Message Type** | SYSTEM | SYSTEM | Stays original |
| **Socket Event** | message:revoked | message:deleted_for_everyone | message:deleted |

---

### FE Implementation Example
```typescript
// Message long-press menu
const messageMenu = [
  {
    label: 'Reply',
    action: () => quoteMessage(messageId)
  },
  {
    label: 'React',
    action: () => openEmojiPicker(messageId)
  },
  ...(messageIsMine && isWithin24Hours(message.createdAt) && [
    {
      label: 'Revoke (Thu hồi)',
      action: () => revokeMessage(messageId),
      style: 'warning'
    },
    {
      label: 'Delete for Everyone',
      action: () => deleteForEveryone(messageId),
      style: 'danger'
    }
  ]),
  {
    label: 'Delete for Me',
    action: () => deleteForMe(messageId),
    style: 'danger'
  }
];

// Check if within 24 hours
const isWithin24Hours = (createdAt: Date): boolean => {
  const now = new Date().getTime();
  const created = new Date(createdAt).getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return (now - created) < ONE_DAY_MS;
};

// API calls
async function revokeMessage(messageId: string) {
  try {
    const response = await fetch(`/messages/${messageId}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const message = await response.json();
    // Message now shows "Đã thu hồi"
    updateMessageUI(message);
  } catch (error) {
    console.error('Revoke failed:', error);
  }
}

async function deleteForEveryone(messageId: string) {
  // Same as revoke but different endpoint
  const response = await fetch(`/messages/${messageId}/delete-for-everyone`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const message = await response.json();
  // Message now shows "Tin nhắn đã bị xóa"
  updateMessageUI(message);
}

async function deleteForMe(messageId: string) {
  // This one just marks for current user
  const response = await fetch(`/messages/${messageId}/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (response.ok) {
    // Hide message locally - don't show in chat
    hideMessageLocally(messageId);
  }
}

// Listen to socket events
socket.on('message:revoked', (payload) => {
  updateMessage(payload.messageId, { 
    type: 'SYSTEM', 
    text: 'Đã thu hồi',
    media: []
  });
});

socket.on('message:deleted_for_everyone', (payload) => {
  updateMessage(payload.messageId, { 
    type: 'SYSTEM', 
    text: 'Tin nhắn đã bị xóa',
    media: []
  });
});

socket.on('message:deleted', (payload) => {
  // Check if current user - if yes, hide locally
  if (payload.deletedBy === currentUserId) {
    hideMessageLocally(payload.messageId);
  }
});
```

---

## 5. Friend Request Socket Events

### Namespace
```
/friends
```

### Events

#### 5.1 Friend Request Received
**Event:** `friend_request:received`

```json
{
  "type": "friend_request:received",
  "data": {
    "requestId": "req-uuid",
    "senderId": "user-uuid",
    "senderName": "John",
    "senderAvatar": "...",
    "status": "pending"
  },
  "timestamp": "2026-04-13T10:30:00Z"
}
```

#### 5.2 Friend Request Accepted
**Event:** `friend_request:accepted`

```json
{
  "type": "friend_request:accepted",
  "data": {
    "requestId": "req-uuid",
    "senderId": "user-uuid",
    "senderName": "John",
    "senderAvatar": "...",
    "status": "accepted"
  },
  "timestamp": "2026-04-13T10:35:00Z"
}
```

#### 5.3 Friend Request Rejected
**Event:** `friend_request:rejected`

```json
{
  "type": "friend_request:rejected",
  "data": {
    "requestId": "req-uuid",
    "senderId": "user-uuid",
    "senderName": "John",
    "senderAvatar": "...",
    "status": "rejected"
  },
  "timestamp": "2026-04-13T10:36:00Z"
}
```

#### 5.4 Friend Request Canceled
**Event:** `friend_request:canceled`

```json
{
  "type": "friend_request:canceled",
  "data": {
    "requestId": "req-uuid",
    "senderId": "user-uuid",
    "senderName": "John",
    "senderAvatar": "...",
    "status": "canceled"
  },
  "timestamp": "2026-04-13T10:37:00Z"
}
```

#### 5.5 Friendship Removed (Unfriended)
**Event:** `friendship:unfriended`

```json
{
  "type": "friendship:unfriended",
  "data": {
    "userId": "user-uuid",
    "userName": "John",
    "userAvatar": "...",
    "status": "unfriended"
  },
  "timestamp": "2026-04-13T10:38:00Z"
}
```

### Status Values
⚠️ **All statuses are LOWERCASE:**
- `pending` (not "PENDING" or "Pending")
- `accepted`
- `rejected`
- `canceled`

### FE Implementation
```typescript
import { io } from 'socket.io-client';

// Connect to /friends namespace
const friendSocket = io('http://localhost:3000', {
  auth: {
    token: authToken
  },
  query: {
    token: authToken
  }
}).of('/friends');

// Listen to friend request events
friendSocket.on('friend_request:received', (payload) => {
  console.log('New friend request from:', payload.data.senderName);
  addNotification({
    type: 'friend_request',
    message: `${payload.data.senderName} sent you a friend request`,
    avatar: payload.data.senderAvatar,
    action: () => respondToRequest(payload.data.requestId)
  });
  // Update friend requests list
  refreshFriendRequests();
});

friendSocket.on('friend_request:accepted', (payload) => {
  console.log('Request accepted by:', payload.data.senderName);
  addNotification({
    type: 'success',
    message: `${payload.data.senderName} accepted your request`
  });
  // Move to friends list
  moveFriendRequestToList(payload.data.requestId);
});

friendSocket.on('friend_request:rejected', (payload) => {
  console.log('Request rejected by:', payload.data.senderName);
  // Remove from pending list
  removeFriendRequest(payload.data.requestId);
});

friendSocket.on('friend_request:canceled', (payload) => {
  console.log('Request canceled by:', payload.data.senderName);
  // Remove from received requests
  removeFriendRequest(payload.data.requestId);
});

friendSocket.on('friendship:unfriended', (payload) => {
  console.log(`${payload.data.userName} unfriended you`);
  // Remove from friends list
  removeFriend(payload.data.userId);
  addNotification({
    type: 'info',
    message: `${payload.data.userName} is no longer your friend`
  });
});
```

---

## 6. Forward Messages

### Feature
Copy one or multiple messages to one or multiple conversations.

### API Endpoint
```
POST /messages/forward
```

### Request Body
```json
{
  "messageIds": ["msg-uuid-1", "msg-uuid-2"],
  "targetConversationIds": ["conv-uuid-1", "conv-uuid-2"],
  "userId": "current-user-uuid"
}
```

### Response
```json
[
  {
    "conversationId": "conv-uuid-1",
    "messages": [
      {
        "id": "new-msg-uuid-1",
        "conversationId": "conv-uuid-1",
        "senderId": "current-user-uuid",
        "type": "TEXT",
        "text": "Original message text",
        "createdAt": "2026-04-13T10:40:00Z"
      }
    ]
  },
  {
    "conversationId": "conv-uuid-2",
    "messages": [
      {
        "id": "new-msg-uuid-2",
        "conversationId": "conv-uuid-2",
        "senderId": "current-user-uuid",
        "type": "TEXT",
        "text": "Original message text",
        "createdAt": "2026-04-13T10:40:00Z"
      }
    ]
  }
]
```

### Socket Event
**Event:** `messageSent` (same as sending regular message)
```json
{
  "conversationId": "conv-uuid",
  "messages": [...]
}
```

### Behavior
- ✅ Can forward multiple messages
- ✅ Can forward to multiple conversations
- 👤 Only the current user appears as sender
- 📋 Message content stays the same (text, media)
- 🔗 Creates new message IDs

### FE Implementation
```typescript
// Message long-press menu
const messageMenu = [
  ...otherActions,
  {
    label: 'Forward',
    action: () => openForwardDialog(messageId)
  }
];

// Forward Dialog Component
function ForwardDialog({ messageId, onClose }: Props) {
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    // Load conversations list
    loadConversations();
  }, []);

  const handleForward = async () => {
    try {
      const response = await fetch('/messages/forward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messageIds: [messageId],
          targetConversationIds: selectedConversations,
          userId: currentUserId
        })
      });

      const result = await response.json();
      
      // Show success message
      showToast('Message forwarded successfully');
      onClose();
    } catch (error) {
      showToast('Failed to forward message', 'error');
    }
  };

  return (
    <Dialog open onClose={onClose}>
      <h2>Forward to</h2>
      <div className="conversation-list">
        {conversations.map(conv => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            selected={selectedConversations.includes(conv.id)}
            onSelect={() => {
              if (selectedConversations.includes(conv.id)) {
                setSelectedConversations(
                  selectedConversations.filter(id => id !== conv.id)
                );
              } else {
                setSelectedConversations([
                  ...selectedConversations,
                  conv.id
                ]);
              }
            }}
          />
        ))}
      </div>
      <Button 
        onClick={handleForward}
        disabled={selectedConversations.length === 0}
      >
        Forward ({selectedConversations.length})
      </Button>
    </Dialog>
  );
}
```

---

## Media Format Requirements

### Supported MIME Types

#### Images
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/gif`
- `image/webp`

#### Videos
- `video/mp4`
- `video/mpeg`
- `video/quicktime`
- `video/webm`

#### Audio
- `audio/mpeg`
- `audio/wav`
- `audio/ogg`
- `audio/mp3`
- `audio/mp4` ⭐ (for m4a files)
- `audio/x-m4a` ⭐ (for m4a files)

#### Documents
- `application/pdf`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Media Object Format
```json
{
  "url": "https://s3-bucket.s3.amazonaws.com/path/to/file",
  "filename": "original-filename.jpg",
  "mimetype": "image/jpeg",
  "size": 1024000
}
```

⚠️ **Critical:** `mimetype` field is REQUIRED. Without it, backend crashes when parsing media type.

---

## Socket Events Summary

### Namespace: `/messages`

| Event | Direction | Triggered By |
|-------|-----------|--------------|
| `messageSent` | Server → Client | After sending message |
| `messageEdited` | Server → Client | After editing message |
| `messageDeleted` | Server → Client | After deleting message for me |
| `message:revoked` | Server → Client | After revoking message |
| `message:deleted_for_everyone` | Server → Client | After deleting for everyone |
| `messageSeen` | Both ways | After marking as seen |
| `messageDelivered` | Both ways | After message delivered |
| `typing` | Both ways | User typing indicator |
| `messageReacted` | Server → Client | After adding reaction |
| `reactionRemoved` | Server → Client | After removing reaction |

### Namespace: `/friends`

| Event | Direction | Triggered By |
|-------|-----------|--------------|
| `friend_request:received` | Server → Client | Friend request sent |
| `friend_request:accepted` | Server → Client | Request accepted |
| `friend_request:rejected` | Server → Client | Request rejected |
| `friend_request:canceled` | Server → Client | Request canceled |
| `friendship:unfriended` | Server → Client | User unfriended |

---

## Common Implementation Patterns

### 1. Socket Connection
```typescript
const socket = io(BACKEND_URL, {
  auth: {
    token: authToken
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

socket.on('connect', () => {
  console.log('Connected to messages namespace');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // Retry logic
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### 2. Loading Messages
```typescript
async function loadMessages(conversationId: string, cursor?: string) {
  const params = new URLSearchParams({
    limit: '20',
    ...(cursor && { cursor })
  });

  const response = await fetch(
    `/conversations/${conversationId}/messages?${params}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const { data } = await response.json();
  return data;
}
```

### 3. Sending Message
```typescript
async function sendMessage(conversationId: string, text: string, media?: MediaAttachment[]) {
  const response = await fetch(
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        conversationId,
        senderId: currentUserId,
        text,
        media
      })
    }
  );

  return await response.json();
}
```

### 4. Listening to Messages
```typescript
socket.on('messageSent', ({ conversationId, messages }) => {
  // Add messages to chat UI
  messages.forEach(msg => {
    addMessageToChat(conversationId, msg);
  });
});
```

---

## Error Handling

### Common Errors

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 401 | Unauthorized | Invalid/missing token | Check authentication |
| 403 | Forbidden | Not conversation member | User not in conversation |
| 404 | Not found | Invalid message/conversation ID | Verify IDs |
| 422 | Validation error | Invalid request format | Check request body |
| 400 | Bad request | Missing required fields | Include all required fields |

---

## Best Practices

### Performance
✅ Use cursor-based pagination for messages
✅ Load ~20-50 messages at once, not all
✅ Debounce typing indicator
✅ Cache conversation list

### UX
✅ Show message as "pending" while uploading
✅ Show "read" indicator after seen
✅ Display time indicator (just now, 5m ago, etc.)
✅ Group consecutive messages from same sender
✅ Auto-mark as seen when message enters viewport

### Security
✅ Always include Authorization header
✅ Validate token before socket connection
✅ HTTPS only for production
✅ Don't store sensitive data in localStorage

---

## Testing Checklist

- [ ] Send single message
- [ ] Send 3 images at once
- [ ] Load conversation list with last message
- [ ] Mark message as seen
- [ ] Revoke message within 24h
- [ ] Revoke message after 24h (should fail)
- [ ] Delete for everyone
- [ ] Delete for me (should hide locally)
- [ ] Forward to single conversation
- [ ] Forward to multiple conversations
- [ ] Listen to friend request events
- [ ] Accept/reject/cancel friend request
- [ ] Unfriend user
- [ ] Upload m4a audio file
- [ ] Edit message
- [ ] Pin message
- [ ] React to message
- [ ] Quote message
- [ ] Socket disconnect/reconnect handling

---

## Support & Debugging

### Enable Debug Logging
```typescript
import { io } from 'socket.io-client';

io.transports(['websocket']); // Force websocket
io.loglevels(); // Enable logging
```

### Common Issues

**Socket connection fails:**
- Check token is valid
- Check CORS settings
- Verify WebSocket is not blocked

**Messages not appearing:**
- Check conversation membership
- Verify user ID format (should be UUID)
- Check socket is connected

**Media upload fails:**
- Ensure all media objects have `mimetype`
- Verify MIME type is in supported list
- Check file size limits

---

**Last Updated:** April 13, 2026
**Backend Version:** Latest
**Endpoint Base:** `/api/v1`
