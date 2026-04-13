# 🗑️ Delete & Revoke Messages - API Documentation

## Overview

Backend hỗ trợ **3 cách xóa/thu hồi tin nhắn** với behavior khác nhau:

1. **Revoke** - Thu hồi tin nhắn (visible to everyone: "[Đã thu hồi]")
2. **Delete for Everyone** - Xóa cho tất cả (visible to everyone: "[Tin nhắn đã bị xóa]")
3. **Delete for Me** - Xóa phía tôi (hidden just for me)

---

## 1. Revoke Message (Thu Hồi)

### Endpoint

```
POST /v1/messages/:messageId/revoke
Authorization: Bearer <token>
Content-Type: application/json
```

### Request

**Path Parameter:**
- `messageId` (UUID) - ID của tin nhắn cần thu hồi

**Body:** Empty (không cần body)

```http
POST /v1/messages/550e8400-e29b-41d4-a716-446655440000/revoke
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Response (200 OK)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "conversationId": "conv-uuid",
    "senderId": "user-uuid",
    "type": "system",
    "text": "Đã thu hồi",
    "media": null,
    "links": [],
    "deletedAt": "2026-04-13T10:00:00.000Z",
    "createdAt": "2026-04-13T09:30:00.000Z"
  }
}
```

### Behavior & Rules

| Aspect | Details |
|--------|---------|
| **Type change** | Original type → `SYSTEM` |
| **Text display** | `"Đã thu hồi"` |
| **Media** | Cleared (null) |
| **Visible to** | ✅ Everyone sees "[Đã thu hồi]" |
| **Time limit** | ⏰ 24 hours (từ lúc tạo message) |
| **Who can** | 👤 Only message sender |
| **Socket event** | `message:revoked` |

### Error Responses

```json
// 400 - Time limit exceeded (> 24h)
{
  "error": "Message recall time expired",
  "code": "RECALL_TIME_EXPIRED"
}

// 403 - Not sender
{
  "error": "You don't have permission to revoke this message",
  "code": "UNAUTHORIZED"
}

// 403 - Not conversation member
{
  "error": "You are not a member of this conversation",
  "code": "NOT_MEMBER"
}

// 404 - Message not found
{
  "error": "Message not found",
  "code": "NOT_FOUND"
}

// 400 - Already deleted
{
  "error": "Message is already deleted",
  "code": "ALREADY_DELETED"
}
```

### Use Case

- User gửi message sau đó nhận ra có lỗi
- Muốn "thu hồi" trước khi request được tất cả response
- VD: "Sorry, sent by mistake" → click revoke → mọi người see "[Đã thu hồi]"

---

## 2. Delete for Everyone (Xóa cho Tất Cả)

### Endpoint

```
POST /v1/messages/:messageId/delete-for-everyone
Authorization: Bearer <token>
Content-Type: application/json
```

### Request

**Path Parameter:**
- `messageId` (UUID) - ID của tin nhắn cần xóa

**Body:** Empty

```http
POST /v1/messages/550e8400-e29b-41d4-a716-446655440000/delete-for-everyone
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Response (200 OK)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "conversationId": "conv-uuid",
    "senderId": "user-uuid",
    "type": "system",
    "text": "Tin nhắn đã bị xóa",
    "media": null,
    "links": [],
    "deletedAt": "2026-04-13T10:00:00.000Z",
    "createdAt": "2026-04-13T09:30:00.000Z"
  }
}
```

### Behavior & Rules

| Aspect | Details |
|--------|---------|
| **Type change** | Original type → `SYSTEM` |
| **Text display** | `"Tin nhắn đã bị xóa"` |
| **Media** | Cleared (null) |
| **Visible to** | ✅ Everyone sees "[Tin nhắn đã bị xóa]" |
| **Time limit** | ⏰ 24 hours (từ lúc tạo message) |
| **Who can** | 👤 Only message sender |
| **Socket event** | `message:deleted_for_everyone` |

### Error Responses

(Same as Revoke)

```json
// 400 - Time limit exceeded
{
  "error": "Message recall time expired",
  "code": "RECALL_TIME_EXPIRED"
}

// 403/404/400 - Other errors same as Revoke
```

### Use Case

- Delete message mà sender không muốn ai thấy
- Message chứa sensitive information
- Khác với Revoke ở chỗ text khác ("bị xóa" vs "thu hồi")
- Functionality **giống nhau**, chỉ UX/text khác

---

## 3. Delete for Me (Xóa Phía Tôi)

### Endpoint

```
POST /v1/messages/:messageId/delete
Authorization: Bearer <token>
Content-Type: application/json
```

### Request

**Path Parameter:**
- `messageId` (UUID) - ID của tin nhắn cần xóa

**Body:** Empty

```http
POST /v1/messages/550e8400-e29b-41d4-a716-446655440000/delete
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Response (200 OK)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "conversationId": "conv-uuid",
    "senderId": "user-uuid",
    "type": "text",
    "text": "Original message text",
    "deletedForUserIds": ["current-user-uuid"],
    "createdAt": "2026-04-13T09:30:00.000Z"
  }
}
```

### Behavior & Rules

| Aspect | Details |
|--------|---------|
| **Type change** | ❌ No change (stays original) |
| **Text display** | Unchanged |
| **Media** | Unchanged |
| **Visible to** | ❌ Only hidden for current user |
| **Other members see** | ✅ Message visible normally |
| **Time limit** | ❌ None (anytime delete) |
| **Who can** | 👤 **Any conversation member** (not just sender) |
| **Data stored** | `deletedForUserIds` array updated |
| **Socket event** | `message:deleted` |

### Error Responses

```json
// 403 - Not conversation member
{
  "error": "You are not a member of this conversation",
  "code": "NOT_MEMBER"
}

// 404 - Message not found
{
  "error": "Message not found",
  "code": "NOT_FOUND"
}
```

### Use Case

- User muốn xóa message khỏi view của họ
- VD: Xóa spam, unwanted message
- Message còn hiển thị cho người khác - chỉ tôi ko thấy
- Anytime xóa được (không có time limit)
- Bất kỳ ai cũng xóa được (không chỉ sender)

---

## 📊 Comparison Table

| Feature | Revoke | Delete for Everyone | Delete for Me |
|---------|--------|--------------------|----|
| **Endpoint** | `/revoke` | `/delete-for-everyone` | `/delete` |
| **Time limit** | 24h | 24h | ❌ None |
| **Who can?** | Only sender | Only sender | Any member |
| **Display text** | "[Đã thu hồi]" | "[Tin nhắn đã bị xóa]" | Unchanged |
| **Type** | → SYSTEM | → SYSTEM | Unchanged |
| **Visible to?** | Everyone | Everyone | Only hidden for self |
| **Socket event** | `message:revoked` | `message:deleted_for_everyone` | `message:deleted` |
| **Use case** | Undo mistake | Remove sensitive | Personal cleanup |

---

## Frontend Integration Examples

### Long-press Message Menu

```typescript
const handleMessageLongPress = (message: Message) => {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Cancel', 'Quote', 'Forward', 'Delete for Me', 'Delete for Everyone', 'Revoke'],
      destructiveButtonIndex: [4, 5],
      cancelButtonIndex: 0,
    },
    buttonIndex => {
      switch (buttonIndex) {
        case 3:
          deleteMessageForMe(message.id);
          break;
        case 4:
          deleteMessageForEveryone(message.id);
          break;
        case 5:
          revokeMessage(message.id);
          break;
      }
    }
  );
};
```

### Service Functions

```typescript
// Delete for me
async function deleteMessageForMe(messageId: string, conversationId: string) {
  try {
    const response = await fetch(
      `http://192.168.1.6:3000/v1/messages/${messageId}/delete`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    if (response.ok) {
      console.log('✅ Deleted for me');
      // Remove from UI
      removeMessageFromView(messageId);
    }
  } catch (error) {
    console.error('❌ Delete failed:', error);
  }
}

// Delete for everyone
async function deleteMessageForEveryone(messageId: string) {
  try {
    const response = await fetch(
      `http://192.168.1.6:3000/v1/messages/${messageId}/delete-for-everyone`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Deleted for everyone');
      // Update message display to "[Tin nhắn đã bị xóa]"
      updateMessageDisplay(data.data);
    }
  } catch (error) {
    console.error('❌ Delete failed:', error);
  }
}

// Revoke
async function revokeMessage(messageId: string) {
  try {
    const response = await fetch(
      `http://192.168.1.6:3000/v1/messages/${messageId}/revoke`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Message revoked');
      // Update message display to "[Đã thu hồi]"
      updateMessageDisplay(data.data);
    }
  } catch (error) {
    console.error('❌ Revoke failed:', error);
  }
}
```

### Socket.io Listeners

```typescript
socket.on('message:deleted', ({ conversationId, messageId, deletedBy }) => {
  console.log(`${deletedBy} deleted message for themselves`);
  // Handle UI update if needed
});

socket.on('message:deleted_for_everyone', ({ conversationId, message }) => {
  console.log('Message deleted for everyone');
  // Update message in UI to show "[Tin nhắn đã bị xóa]"
  updateMessageInList(message);
});

socket.on('message:revoked', ({ conversationId, message }) => {
  console.log('Message revoked');
  // Update message in UI to show "[Đã thu hồi]"
  updateMessageInList(message);
});
```

---

## Permissions & Access Control

### Revoke Message

```
✅ Can revoke: Message sender
❌ Cannot revoke:
   - Other users' messages
   - Messages older than 24h
   - Already deleted messages
   - User not in conversation
```

### Delete for Everyone

```
✅ Can delete: Message sender
❌ Cannot delete:
   - Other users' messages
   - Messages older than 24h
   - Already deleted messages
   - User not in conversation
```

### Delete for Me

```
✅ Can delete: Any conversation member (sender or not)
❌ Cannot delete:
   - User not in conversation
   - Message doesn't exist
```

---

## Error Handling

### Time Limit Exceeded (24h)

```typescript
if (error.code === 'RECALL_TIME_EXPIRED') {
  showAlert(
    'Cannot delete',
    'You can only delete messages within 24 hours of sending'
  );
}
```

### Unauthorized (Not Sender for revoke/delete-for-everyone)

```typescript
if (error.code === 'UNAUTHORIZED') {
  showAlert(
    'Cannot delete',
    'Only the sender can delete this message'
  );
}
```

### Not Member

```typescript
if (error.code === 'NOT_MEMBER') {
  showAlert(
    'Error',
    'You are no longer a member of this conversation'
  );
}
```

---

## UI/UX Guidelines

### Delete for Me
- Shows only for messages visible to current user
- Always available (no time limit)
- Small icon/option in menu
- Silently removes from view (no socket notification)

### Delete for Everyone / Revoke
- Shows "[Tin nhắn đã bị xóa]" or "[Đã thu hồi]" to everyone
- Only available for own messages
- Only within 24 hours
- Warn user: "This will delete for everyone"
- After 24h: disable/hide option

### Display in UI

```typescript
renderMessage = (message: Message) => {
  // If deleted for me, don't show
  if (message.deletedForUserIds?.includes(currentUserId)) {
    return null; // Hidden
  }

  // If system message showing deletion
  if (message.type === 'SYSTEM' && message.text?.includes('xóa')) {
    return (
      <View style={styles.systemMessage}>
        <Text style={styles.italicGray}>{message.text}</Text>
      </View>
    );
  }

  // Normal message
  return <MessageBubble message={message} />;
};
```

---

## Testing Checklist

- [ ] Delete for me - message hidden from current user
- [ ] Delete for me - other users still see message
- [ ] Delete for everyone - shows system message "[Tin nhắn đã bị xóa]"
- [ ] Delete for everyone - only available to sender
- [ ] Delete for everyone - cannot delete after 24h
- [ ] Revoke - shows system message "[Đã thu hồi]"
- [ ] Revoke - only available to sender
- [ ] Revoke - cannot revoke after 24h
- [ ] Socket event triggers UI update
- [ ] Error handling for all cases
- [ ] Menu option hidden/disabled after 24h
- [ ] Multiple deletions on same message handled
- [ ] Verify media is cleared on revoke/delete-for-everyone

---

## Summary

| Method | When to use | Visibility |
|--------|------------|-----------|
| **Delete for Me** | Clean up personal inbox | Hidden only to me |
| **Delete for Everyone** | Remove sensitive content | Everyone sees "[Tin nhắn đã bị xóa]" |
| **Revoke** | Undo recent mistake | Everyone sees "[Đã thu hồi]" |

---

**Status:** ✅ Backend Ready  
**Auth:** ✅ Required  
**Last Updated:** 2026-04-13
