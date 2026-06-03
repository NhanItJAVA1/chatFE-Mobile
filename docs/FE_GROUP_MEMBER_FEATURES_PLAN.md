# FE Plan: Group Member Features

## Bối Cảnh BE Sau Khi Sửa

BE đã tách rõ hai lớp xử lý:

- HTTP API dùng cho business logic thêm thành viên, đuổi thành viên, rời nhóm thật.
- Socket dùng để subscribe room và nhận realtime event.

FE không dùng socket để thay đổi membership nhóm nữa, trừ khi cần tương thích với flow cũ. Flow chuẩn mới là gọi HTTP trước, sau đó cập nhật UI bằng response và/hoặc socket event từ BE.

## Socket Events FE Cần Listen

### `conversation:members_added`

BE emit khi có thành viên mới được thêm vào nhóm.

Payload:

```ts
type MembersAddedEvent = {
  conversationId: string;
  newMembers: Array<{
    id: string;
    conversationId: string;
    userId: string;
    role?: string;
    status?: string;
    joinedAt?: string;
    [key: string]: any;
  }>;
  addedBy?: string;
};
```

FE xử lý:

- Nếu đang ở màn group detail/chat của `conversationId`, thêm `newMembers` vào state danh sách thành viên.
- Nếu `newMembers` có current user, fetch lại conversation detail hoặc thêm conversation vào list chat.
- Có thể hiển thị system toast hoặc system row: thành viên mới đã được thêm.

### `conversation:member_removed`

BE emit khi thành viên bị đuổi hoặc tự rời nhóm.

Payload:

```ts
type MemberRemovedEvent = {
  conversationId: string;
  removedUserId: string;
  removedBy?: string;
  reason: "removed" | "left";
};
```

FE xử lý:

- Nếu `removedUserId !== currentUserId`, xóa user khỏi danh sách thành viên của group.
- Nếu `removedUserId === currentUserId`, xóa group khỏi local conversation list/cache và navigate ra khỏi màn chat group.
- `reason === "removed"`: user bị owner/admin đuổi.
- `reason === "left"`: user tự rời nhóm.

### `group:member_left`

Event cũ vẫn còn để tương thích.

Khuyến nghị FE mới chỉ cần dùng `conversation:member_removed`. Nếu code hiện tại đã listen `group:member_left`, có thể giữ tạm nhưng tránh xử lý trùng bằng cách dedupe theo `conversationId + userId + timestamp gần nhất`.

## Socket Room Subscription

Khi mở màn chat nhóm:

```ts
socket.emit("joinGroup", { conversationId: groupId }, callback);
```

Khi đóng/unmount màn chat nhóm:

```ts
socket.emit("leaveGroup", { conversationId: groupId }, callback);
```

Lưu ý: `leaveGroup` socket chỉ là rời socket room, không phải rời nhóm thật.

## 1. Owner Thêm Thành Viên Mới Vào Nhóm Chat Đã Tạo

### API

```http
POST /groups/:groupId/members
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "memberIds": ["userId1", "userId2"]
}
```

Response thành công:

```ts
{
  data: ConversationMember[];
}
```

### FE Flow

1. Owner mở màn hình quản lý thành viên nhóm.
2. FE hiển thị danh sách bạn bè/người có thể thêm.
3. FE loại bỏ các user đã là member hiện tại khỏi danh sách chọn.
4. Owner chọn một hoặc nhiều user.
5. FE gọi `POST /groups/:groupId/members`.
6. Khi API success:
   - Đóng modal chọn thành viên.
   - Có thể optimistic append `response.data` vào member list.
   - Hoặc invalidate/fetch lại group detail.
7. Socket `conversation:members_added` sẽ được nhận bởi:
   - Các member đang ở group room.
   - Các user mới được thêm qua `user:<id>`.

### UI State Cần Có

```ts
type AddMembersState = {
  selectedUserIds: string[];
  isSubmitting: boolean;
  error?: string;
};
```

### Error Handling

- `401`: token hết hạn, redirect login hoặc refresh token.
- `403`: owner không có quyền, user không phải bạn bè, hoặc bị block.
- `404`: group/user không tồn tại.
- `422`: body sai format.

### Acceptance Criteria

- Owner thêm được một hoặc nhiều thành viên.
- Thành viên mới thấy group xuất hiện realtime hoặc sau khi fetch list.
- Các member hiện tại thấy danh sách thành viên cập nhật realtime.
- Không cần emit socket `addMembers` từ FE.

## 2. Owner Đuổi Thành Viên Ra Khỏi Nhóm

### API

```http
DELETE /groups/:groupId/members/:targetUserId
Authorization: Bearer <token>
```

Response thành công:

```json
{
  "success": true
}
```

Sau khi remove thành công, BE emit:

```ts
conversation: member_removed;
```

Payload:

```json
{
  "conversationId": "groupId",
  "removedUserId": "targetUserId",
  "removedBy": "ownerUserId",
  "reason": "removed"
}
```

### FE Flow

1. Owner mở danh sách thành viên.
2. Với từng member không phải owner/current owner, hiển thị action remove/kick.
3. Khi owner chọn đuổi member, mở confirm dialog.
4. FE gọi `DELETE /groups/:groupId/members/:targetUserId`.
5. Khi API success:
   - Đóng dialog.
   - Remove member khỏi local state hoặc invalidate group detail.
6. Khi nhận socket `conversation:member_removed`:
   - Nếu `removedUserId` là user khác, xóa khỏi member list.
   - Nếu `removedUserId === currentUserId`, navigate ra khỏi group và xóa conversation khỏi list.

### UI State Cần Có

```ts
type RemoveMemberState = {
  targetUserId?: string;
  isConfirmOpen: boolean;
  isSubmitting: boolean;
  error?: string;
};
```

### Error Handling

- `403`: current user không phải owner/admin hoặc không có quyền đuổi.
- `400`: không thể đuổi owner, không thể tự đuổi bằng API kick.
- `404`: member/group không tồn tại.

### Acceptance Criteria

- Owner đuổi được member hợp lệ.
- Member bị đuổi nhận realtime event và bị đưa ra khỏi màn group.
- Các member còn lại thấy danh sách member cập nhật.
- FE không dùng socket `removeMember` cho flow chuẩn.

## 3. Thành Viên Tự Rời Khỏi Nhóm

### API

```http
POST /groups/:groupId/leave
Authorization: Bearer <token>
```

Body: không cần body.

Response thành công:

```json
{
  "success": true
}
```

### FE Flow

1. Member mở group settings.
2. User chọn `Rời nhóm`.
3. FE mở confirm dialog.
4. FE gọi `POST /groups/:groupId/leave`.
5. Khi API success:
   - Xóa group khỏi conversation list/cache.
   - Clear member/detail cache của group.
   - Navigate về conversation list hoặc màn trước đó.
6. Các member còn lại nhận `conversation:member_removed` với `reason: "left"`.

### UI State Cần Có

```ts
type LeaveGroupState = {
  isConfirmOpen: boolean;
  isSubmitting: boolean;
  error?: string;
};
```

### Error Handling

- `403`: user không có quyền rời, hoặc owner cần chuyển quyền trước nếu BE có rule này.
- `404`: group không tồn tại hoặc user không còn trong group.
- Network error: giữ dialog mở, cho retry.

### Acceptance Criteria

- Member tự rời nhóm bằng HTTP API.
- Sau khi rời, current user không còn thấy group trong list.
- Current user không còn ở lại màn chat group.
- Các member khác thấy member list cập nhật realtime.
- FE không dùng socket `leaveGroup` để rời nhóm thật.

## Service Layer Đề Xuất

```ts
class GroupChatService {
  static addMembers(groupId: string, memberIds: string[]) {
    return http.post(`/groups/${groupId}/members`, { memberIds });
  }

  static removeMember(groupId: string, targetUserId: string) {
    return http.delete(`/groups/${groupId}/members/${targetUserId}`);
  }

  static leaveGroup(groupId: string) {
    return http.post(`/groups/${groupId}/leave`);
  }
}
```

## Socket Subscription Đề Xuất

```ts
function subscribeGroupMemberEvents(currentUserId: string) {
  const onMembersAdded = (event: MembersAddedEvent) => {
    // update member list or invalidate group detail
  };

  const onMemberRemoved = (event: MemberRemovedEvent) => {
    if (event.removedUserId === currentUserId) {
      // remove conversation, clear group cache, navigate out
      return;
    }

    // remove member from group member list
  };

  socket.on("conversation:members_added", onMembersAdded);
  socket.on("conversation:member_removed", onMemberRemoved);

  return () => {
    socket.off("conversation:members_added", onMembersAdded);
    socket.off("conversation:member_removed", onMemberRemoved);
  };
}
```

## Checklist FE

- [ ] Tạo service `addMembers`.
- [ ] Tạo service `removeMember`.
- [ ] Tạo service `leaveGroup`.
- [ ] Thêm UI chọn bạn bè để owner add members.
- [ ] Thêm confirm dialog khi owner kick member.
- [ ] Thêm confirm dialog khi member leave group.
- [ ] Listen `conversation:members_added`.
- [ ] Listen `conversation:member_removed`.
- [ ] Khi current user bị removed/left, navigate ra khỏi group.
- [ ] Đảm bảo `socket.leaveGroup` chỉ gọi khi unmount màn chat, không dùng cho action rời nhóm thật.
