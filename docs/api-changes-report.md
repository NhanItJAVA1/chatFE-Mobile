# API Changes Report - Backend Updates

Updated: 2026-04-13

---

## 1. Friends - Cursor Pagination

### GET `/v1/friendships`

**Changes:** Replaced page-based pagination with cursor-based pagination.

**Request Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cursor` | string | No | - | Pagination cursor (from previous `nextCursor`) |
| `limit` | integer | No | 20 | Items per page (1-100) |
| `sortBy` | string | No | newest | Sort order: `newest` or `oldest` |

**Response Body:**

```json
{
  "data": {
    "items": [
      {
        "id": "friendship-id",
        "userA": "user-id-1",
        "userB": "user-id-2",
        "createdAt": "2026-04-01T10:00:00.000Z"
      }
    ],
    "nextCursor": "base64EncodedCursor",
    "hasMore": true
  }
}
```

**Notes:**
- `items` removed: `total`, `page` fields
- Added: `nextCursor`, `hasMore`
- Cursor format: `base64(id|createdAtISO)`

---

## 2. AI - Smart Reply Context

### POST `/v1/ai/smart-reply`

**Changes:** Added `userId` for better context when user is the last sender.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | UUID | Yes | Conversation ID |
| `userId` | UUID | No | Current user ID (auto-filled from token if not provided) |

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Notes:**
- When `userId` matches `lastMessage.senderId`, AI will also fetch the previous message as context for better suggestions
- Backward compatible: `userId` is optional

---

## 3. Chat - Pinned Messages Ordering

### GET `/v1/conversations/{conversationId}/pinned-messages`

**Changes:** Response now sorted by `pinnedAt` ascending (oldest first).

**Response Body:** (unchanged structure)

```json
{
  "data": {
    "messages": [
      { "id": "msg-001", "text": "Thong bao cu", "pinnedAt": "2026-04-01T10:00:00Z" },
      { "id": "msg-002", "text": "Thong bao moi", "pinnedAt": "2026-04-10T10:00:00Z" }
    ]
  }
}
```

---

## 4. Chat - Message Classification & Splitting (CORE CHANGE)

### 4.1. New Message Types

**New `MessageType` enum values:**

| Value | Description |
|-------|-------------|
| `text` | Plain text message |
| `image` | Image message |
| `file` | File attachment message |
| `link` | Message containing links (NEW) |
| `system` | System message |

---

### 4.2. Send Message - Classification Rules

**Endpoint:** `POST /v1/conversations/{conversationId}/messages`

**Request Body:**

```json
{
  "text": "Hello https://example.com",
  "media": [
    {
      "url": "https://cdn.example.com/image.jpg",
      "filename": "photo.jpg",
      "mimetype": "image/jpeg",
      "size": 102400
    }
  ]
}
```

**Quy tac xu ly tin nhan khi gui:**

| Input | Output |
|-------|--------|
| `text` + `media` (khong co link) | 1 message IMAGE/FILE (text + media chung 1 message) |
| `text` + `media` + `link` | 2 messages: IMAGE/FILE message + LINK message |
| `text` + `link` (khong media) | 1 message LINK |
| Nhieu `media` items | Tach moi IMAGE/FILE thanh message rieng |
| Chi co `media` | 1 message IMAGE/FILE |
| Chi co `text` | 1 message TEXT |

**Example 1: Gui "Hello https://link.com" + 1 image**
- 2 messages: IMAGE message (chi image) + LINK message (text + link)

**Example 2: Gui "Hello" + 1 image (khong co link)**
- 1 message IMAGE (text + image cung message)

**Example 3: Gui "Hello" + 2 images**
- 2 messages IMAGE (moi image 1 message, text di cung image cuoi)

**Response Body (201):**

```json
{
  "data": [
    {
      "id": "msg-001",
      "conversationId": "conv-001",
      "senderId": "user-001",
      "type": "image",
      "text": null,
      "media": [{ "url": "...", "mediaType": "image", "name": "photo.jpg", "size": 102400 }],
      "links": [],
      "pinned": false,
      "createdAt": "2026-04-13T10:00:00.000Z"
    },
    {
      "id": "msg-002",
      "conversationId": "conv-001",
      "senderId": "user-001",
      "type": "link",
      "text": "Hello https://example.com",
      "media": null,
      "links": ["https://example.com"],
      "pinned": false,
      "createdAt": "2026-04-13T10:00:00.001Z"
    }
  ]
}
```

**Notes:**
- Response la mang `Message[]` thay vi `Message` duy nhat
- Khi gui thanh cong, client nhan duoc mang cac message da duoc tao

---

### 4.3. Get Media/File/Link

### GET `/v1/conversations/{conversationId}/media`

**Changes:** Doc truc tiep tu bang `message_classifications` (thay vi filter in-memory tu MESSAGES table).

**Request Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cursor` | string | No | - | Pagination cursor (base64 encoded) |
| `limit` | integer | No | 20 | Items per page (1-100) |
| `type` | string | No | all | Filter: `all`, `image`, `file`, `link` |

**Response Body:**

```json
{
  "data": {
    "images": [
      {
        "messageId": "msg-001",
        "url": "https://cdn.example.com/img/photo.jpg",
        "name": "photo.jpg",
        "size": null,
        "width": null,
        "height": null,
        "mediaType": "image",
        "senderId": "user-123",
        "createdAt": "2026-04-13T10:00:00Z"
      }
    ],
    "files": [
      {
        "messageId": "msg-002",
        "url": "https://cdn.example.com/files/doc.pdf",
        "name": "doc.pdf",
        "size": null,
        "mediaType": "file",
        "senderId": "user-123",
        "createdAt": "2026-04-13T11:00:00Z"
      }
    ],
    "links": [
      {
        "messageId": "msg-003",
        "url": "https://example.com/article",
        "senderId": "user-123",
        "createdAt": "2026-04-13T12:00:00Z"
      }
    ],
    "nextCursor": "eyJwayI6Ik... ",
    "hasMore": true
  }
}
```

**Notes:**
- Cursor-based pagination ho tro UX keo luot (scroll) hieu qua
- Khi `type=all`, tra ve tat ca types nhung van tach theo mang rieng

---

## 5. Chat - Forward Messages

### POST `/v1/messages/forward`

**Purpose:** Forward multiple messages to one or more conversations.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageIds` | string[] | Yes | IDs of messages to forward |
| `targetConversationIds` | string[] | Yes | Target conversation IDs |

```json
{
  "messageIds": ["msg-001", "msg-002"],
  "targetConversationIds": ["conv-a", "conv-b"]
}
```

**Response Body (201):**

```json
{
  "data": [
    {
      "id": "msg-new-001",
      "conversationId": "conv-a",
      "senderId": "user-current",
      "type": "text",
      "text": "Original message text",
      "media": null,
      "links": [],
      "pinned": false,
      "createdAt": "2026-04-13T10:00:00.000Z"
    },
    {
      "id": "msg-new-002",
      "conversationId": "conv-a",
      "senderId": "user-current",
      "type": "image",
      "text": null,
      "media": [{ "url": "...", "mediaType": "image", "name": "photo.jpg", "size": 102400 }],
      "pinned": false,
      "createdAt": "2026-04-13T10:00:00.000Z"
    },
    {
      "id": "msg-new-003",
      "conversationId": "conv-b",
      "senderId": "user-current",
      "type": "text",
      "text": "Original message text",
      "media": null,
      "links": [],
      "pinned": false,
      "createdAt": "2026-04-13T10:00:00.000Z"
    }
  ]
}
```

**Rules:**
- Messages forwarded as the current user (senderId = currentUserId)
- Sender must be a member of source and target conversations
- Cannot forward SYSTEM messages
- LINK messages can be forwarded
- Deleted messages cannot be forwarded
- Duplicate IDs in arrays are automatically deduplicated
- Unread count increased for other members in target conversations
- Classification records (IMAGE/FILE/LINK) are inserted to `message_classifications` table for media in forwarded messages

---

## 6. Chat - Quote Message

### POST `/v1/conversations/{conversationId}/quote/{quotedMessageId}`

**Purpose:** Reply to a specific message with optional text/media (quote context). Supports message classification.

**Quy tac xu ly (giong nhu send message):**

| Input | Output |
|-------|--------|
| `text` + `media` (khong co link) | 1 message IMAGE/FILE (text + media chung 1 message) |
| `text` + `media` + `link` | 2 messages: IMAGE/FILE + LINK |
| `text` + `link` (khong media) | 1 message LINK |
| Nhieu `media` items | Tach moi IMAGE/FILE thanh message rieng |
| Chi co `media` | 1 message IMAGE/FILE |
| Chi co `text` | 1 message TEXT |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | No | Reply text |
| `media` | array | No | Media attachments |

```json
{
  "text": "That is a great point!",
  "media": [
    {
      "url": "https://cdn.example.com/image.jpg",
      "filename": "photo.jpg",
      "mimetype": "image/jpeg",
      "size": 102400
    }
  ]
}
```

**Response Body (201):**

```json
{
  "data": {
    "id": "msg-001",
    "conversationId": "conv-001",
    "senderId": "user-001",
    "type": "image",
    "text": "That is a great point!",
    "media": [{ "url": "...", "mediaType": "image", "name": "photo.jpg", "size": 102400 }],
    "links": [],
    "quotedMessageId": "msg-quoted-001",
    "quotedMessagePreview": "Original message text...",
    "pinned": false,
    "createdAt": "2026-04-13T10:00:00.000Z"
  }
}
```

**Rules:**
- `quotedMessageId` must exist and belong to the same conversation
- Sender must be a member of the conversation
- `quotedMessagePreview` is auto-generated from quoted message text (max 100 chars) or `[Media]`
- Message type determined by presence of media: FILE if media exists, TEXT otherwise

- Accepting a friend request now automatically creates a private conversation for both users with a system welcome message. No client changes required.

---

## 7. FriendRequest Accept - Auto Create Conversation

### PATCH `/v1/friend-requests/{requestId}`

**Changes:** When accepting a friend request (`status: accepted`), the system now automatically creates a private conversation between the two users with a default system message.

**Request Body:**

```json
{
  "status": "accepted"
}
```

**Automatic Side Effects:**

After friendship is successfully created:

1. A new private `Conversation` is automatically created with:
   - `type: "private"`
   - `pairKey`: Sorted join of two user IDs (e.g., `"userA_userB"`)
   - Both users are added as conversation members with role `MEMBER` and status `ACTIVE`

2. A system message is automatically inserted into the conversation:
   - `type: "system"`
   - `text: "Hai bạn đã trở thành bạn bè"`
   - This message becomes the `lastMessage` of the conversation

3. Both users can immediately see the conversation when loading their conversation list.

**Response:** Unchanged from existing behavior.

---

## 8. Backward Compatibility Notes

- `MessageType.LINK` la gia tri moi. Client can handle unknown message types gracefully.
- `POST /v1/conversations/{conversationId}/messages` response thanh mang `Message[]`. Client cu can cap nhat de xu ly array.
- Cac endpoint khac khong thay doi.
