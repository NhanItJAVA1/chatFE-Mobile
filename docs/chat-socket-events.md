# Hướng dẫn Socket.io Events - Module Chat

Tài liệu này cung cấp chi tiết các sự kiện (events) Socket.io để Frontend tích hợp các tính năng thời gian thực (real-time) cho mô-đun Chat.

## 1. Thông tin kết nối
- **Namespace**: `/messages`
- **Cơ chế xác thực**:
    - Truyền `token` qua `auth` object hoặc `query` string hoặc `Authorization` header.
    - Token được sử dụng là Bearer Token (JWT).
    - Khuyên dùng: `socket = io('/messages', { auth: { token: 'YOUR_JWT_TOKEN', deviceId: 'DEVICE_ID' } })`.

## 2. Các sự kiện Client gửi (Emit)
Các sự kiện này được Frontend gửi lên Server để thực hiện hành động.

| Sự kiện | Payload | Mô tả |
| :--- | :--- | :--- |
| `joinGroup` | `{ conversationId: string }` | Tham gia vào phòng chat (room) của một hội thoại/nhóm. |
| `leaveGroup` | `{ conversationId: string }` | Rời khỏi phòng chat của hội thoại/nhóm. |
| `sendMessage` | `{ conversationId: string, text?: string, media?: MediaItem[] }` | Gửi tin nhắn mới. `MediaItem` gồm `url`, `type`. |
| `editMessage` | `{ messageId: string, text: string }` | Chỉnh sửa nội dung tin nhắn đã gửi. |
| `deleteMessage` | `{ messageId: string }` | Xóa tin nhắn ở phía người gửi (Delete for me). |
| `revokeMessage` | `{ messageId: string }` | Thu hồi tin nhắn (Revoke). |
| `deleteMessageForEveryone` | `{ messageId: string }` | Xóa tin nhắn đối với tất cả mọi người. |
| `messageSeen` | `{ conversationId: string, lastSeenMessageId: string }` | Đánh dấu đã xem đến tin nhắn nào. |
| `messageDelivered` | `{ conversationId: string, lastDeliveredMessageId: string }` | Đánh dấu tin nhắn đã được nhận đến máy điện thoại/web. |
| `markAllSeen` | `{ conversationId: string }` | Đánh dấu xem tất cả tin nhắn trong hội thoại. |
| `typing:start` | `{ toUserId?: string, groupId?: string }` | Bắt đầu trạng thái đang gõ phím. |
| `typing:stop` | `{ toUserId?: string, groupId?: string }` | Kết thúc trạng thái đang gõ phím. |
| `addReaction` | `{ messageId: string, emoji: string }` | Thả cảm xúc vào tin nhắn. |
| `removeReaction` | `{ messageId: string, emoji?: string }` | Gỡ cảm xúc khỏi tin nhắn. |
| `forwardMessages` | `{ messageIds: string[], targetConversationIds: string[] }` | Chuyển tiếp các tin nhắn sang các hội thoại khác. |
| `quoteMessage` | `{ conversationId: string, quotedMessageId: string, text?: string, media?: MediaItem[] }` | Trả lời (quote) một tin nhắn. |

## 3. Các sự kiện Client lắng nghe (Listen)
Các sự kiện này Server gửi về để Frontend cập nhật giao diện thời gian thực.

| Sự kiện | Data Structure | Mô tả |
| :--- | :--- | :--- |
| `receiveMessage` | `{ message: MessageObj, conversationId: string }` | Nhận tin nhắn mới từ người khác. |
| `messageSeen` | `{ conversationId: string, userId: string, lastSeenMessageId: string }` | Có người vừa xem tin nhắn. |
| `messageDelivered` | `{ conversationId: string, userId: string, lastDeliveredMessageId: string }` | Tin nhắn đã được nhận bởi thiết bị của ai đó. |
| `message:edited` | `{ conversationId: string, message: MessageObj }` | Một tin nhắn vừa được chỉnh sửa nội dung. |
| `message:deleted` | `{ conversationId: string, messageId: string, deletedBy: string }` | Một tin nhắn vừa bị xóa (phía cá nhân). |
| `message:revoked` | `{ conversationId: string, messageId: string, revokedBy: string }` | Một tin nhắn vừa bị thu hồi. |
| `message:deleted_for_everyone` | `{ conversationId: string, messageId: string, deletedBy: string }` | Tin nhắn bị xóa đối với tất cả thành viên. |
| `message:reaction` | `{ messageId: string, reaction: ReactionObj }` | Người dùng khác vừa thả cảm xúc. |
| `message:reaction:remove` | `{ messageId: string, userId: string, emoji?: string }` | Người dùng vừa gỡ cảm xúc. |
| `typing:start` | `{ userId: string, toUserId?: string, groupId?: string }` | Ai đó đang gõ phím. |
| `typing:stop` | `{ userId: string, toUserId?: string, groupId?: string }` | Ai đó đã ngừng gõ. |
| `conversation:created` | `GroupDataObj` | Khi bạn được thêm vào một nhóm mới hoặc nhóm mới được tạo. |
| `conversation:members_added` | `{ conversationId: string, newMembers: MemberObj[] }` | Thành viên mới vừa được thêm vào nhóm. |
| `conversation:member_removed` | `{ conversationId: string, removedUserId: string }` | Có thành viên vừa bị xóa khỏi nhóm. |
| `conversation:updated` | `{ conversationId: string, data: any }` | Thông tin nhóm (tên, ảnh đại diện...) vừa được cập nhật. |
| `group:admin_changed` | `{ conversationId: string, targetUserId: string, isAdmin: boolean }` | Quyền quản trị viên của ai đó thay đổi. |
| `group:owner_transferred` | `{ conversationId: string, oldOwnerId: string, newOwnerId: string }` | Quyền trưởng nhóm được chuyển giao. |
| `group:member_approved` | `{ conversationId: string, userId: string, member: MemberObj }` | Một thành viên chờ duyệt đã được chấp nhận vào nhóm. |
| `group:member_rejected` | `{ conversationId: string, userId: string }` | Yêu cầu vào nhóm bị từ chối. |
| `group:settings_updated` | `{ conversationId: string, settings: any }` | Cấu hình nhóm (quyền nhắn tin, quyền duyệt thành viên...) thay đổi. |
| `poll:new` | `{ conversationId: string, poll: PollObj }` | Một cuộc bình chọn mới vừa được tạo. |
| `poll:vote` | `{ conversationId: string, pollId: string, userId: string, poll: PollObj }` | Có người vừa thực hiện bình chọn. |

---
**Ghi chú**: Các Object như `MessageObj`, `MemberObj`, `PollObj` tuân theo cấu trúc DTO được định nghĩa trong mã nguồn backend Chat.
