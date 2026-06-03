# Hướng Dẫn Kích Hoạt & Lắng Nghe Socket Cho Chức Năng Tham Gia / Rời Nhóm (Join / Leave Group)

Tài liệu này mô tả chi tiết cách hệ thống xử lý các sự kiện socket liên quan đến việc tham gia (join) và rời khỏi (leave) nhóm trong ứng dụng chat. Quá trình này được chia làm hai phần: **Gửi Sự Kiện (Emit)** khi người dùng mở/đóng màn hình chat và **Lắng Nghe Sự Kiện (Listen)** từ server khi có sự thay đổi về thành viên trong nhóm.

---

## 1. Gửi (Emit) Sự Kiện Join và Leave Group

Phần này giúp client tham gia vào Socket Room của nhóm để có thể nhận tin nhắn realtime và các sự kiện liên quan.

### 1.1. Tham gia phòng trò chuyện (Join Group)

Khi người dùng mở một cuộc hội thoại nhóm (hoặc khi component chat được mount), frontend sẽ gửi sự kiện `joinGroup` qua socket.

- **Nơi thực hiện (Services):** `src/shared/services/socketService.ts`
- **Hàm xử lý:** `SocketService.joinConversation(conversationId)`
- **Sự kiện Socket:** `joinGroup`
- **Data payload:** `{ conversationId }`

**Ví dụ mã trong `SocketService`:**
```typescript
static async joinConversation(conversationId: string): Promise<any> {
    // ...
    this.socket.emit("joinGroup", { conversationId }, (response: any) => {
        if (response?.success) {
            console.log('[SocketService] ✓ Joined conversation:', conversationId);
            resolve(response);
        } else {
            reject(new Error(response?.error || "Failed to join"));
        }
    });
}
```

*Sử dụng trong UI:* Các File như `GroupChatScreen.tsx` hoặc hooks `useChat.ts`, `useGroupChatMessage.ts` sẽ tự động gọi hàm này. Ví dụ:
```typescript
await SocketService.joinConversation(groupId);
```

### 1.2. Rời khỏi phòng trò chuyện (Leave Group Room)

Khi người dùng thoát khỏi màn hình chat (component unmount), frontend sẽ giải phóng kết nối tới Socket Room đó bằng cách emit sự kiện `leaveGroup`.

- **Nơi thực hiện (Services):** `src/shared/services/socketService.ts`
- **Hàm xử lý:** `SocketService.leaveConversation(conversationId)`
- **Sự kiện Socket:** `leaveGroup`
- **Data payload:** `{ conversationId }`

**Ví dụ mã trong `SocketService`:**
```typescript
static leaveConversation(conversationId: string): Promise<any> {
    // ...
    this.socket.emit("leaveGroup", { conversationId }, (response: any) => {
        // ...
    });
}
```
*Sử dụng trong UI:* Thường được gọi tại hàm `useEffect` cleanup trong `GroupChatScreen.tsx` hoặc `useChat.ts`.

---

## 2. API Thực Sự Cho Tính Năng Leave Group (Xử lý Business Logic)

Lưu ý: Sự kiện `leaveGroup` qua Socket ở trên **CHỈ LÀ** để hủy theo dõi room. Nếu một thành viên muốn thực sự rời khỏi tổ chức / nhóm (không còn là thành viên nữa), họ phải gọi API backend.

- **Nơi gọi API Server:** `GroupChatService.leaveGroup` (`src/shared/services/groupChatService.ts`). Thực hiện `POST /groups/:groupId/leave`.
- **Nơi dùng (Hooks):** Tích hợp vào `useGroupChat`.
- **UI Action:** `GroupSettingsScreen.tsx` kích hoạt hàm này khi bấm nút "Rời nhóm".

---

## 3. Bắt (Listen) Sự Kiện Thay Đổi Thành Viên Do Server Trả Về

Khi có người trong nhóm (bao gồm hoặc một thành viên bất kỳ) vừa hoàn thành hành động Rời nhóm (leave) hoặc được mời vào nhóm (join/added), phía server sẽ trigger event xuống tất cả client đang có trong Socket Room của nhóm đó.

### 3.1. Bắt sự kiện có thành viên mới vào nhóm
- **Sự kiện nhận:** `conversation:members_added`
- **Hàm hứng trong `SocketService`:** `onGroupMembersAdded(callback)`
- **Cách áp dụng:** Cập nhật lại danh sách thành viên trong state (`useGroupChat` v.v...) hoặc render dòng tin nhắn hệ thống "Ai đó đã tham gia nhóm".

```typescript
static onGroupMembersAdded(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on("conversation:members_added", (data: any) => {
        console.log("[SocketService] Members added to group:", data);
        callback(data);
    });
}
```

### 3.2. Bắt sự kiện có thành viên rời khỏi / bị kick khỏi nhóm
- **Sự kiện nhận:** `conversation:member_removed`
- **Hàm hứng trong `SocketService`:** `onGroupMemberRemoved(callback)` hoặc `subscribeGroupMemberRemoved(callback)`
- **Cách áp dụng:** Loại bỏ user bị kick/rời đi khỏi hiển thị danh sách thành viên hiện tại ở UI, hoặc redirect màn hình ra ngoài nếu thành viên bị kick chính là người dùng (Current User).

```typescript
static subscribeGroupMemberRemoved(
    callback: (data: GroupMemberEvent) => void
): () => void {
    const handler = (data: any) => {
        console.log("[SocketService] Member removed from group:", data);
        callback(data);
    };
    this.socket.on("conversation:member_removed", handler);
    // Trả về hàm cleanup
    return () => this.socket?.off("conversation:member_removed", handler);
}
```

> **Tổng Kết Workflow:**  
> - Frontend vào màn hình chat => Emit `joinGroup` (socket)
> - Có 1 thành viên bấm "Rời nhóm" => Gửi HTTP POST tới Server API
> - Backend xử lý logic rời nhóm thành công => Phát Socket event `conversation:member_removed` đến toàn bộ những người còn trong Group Socket Room
> - Người dùng thoát khỏi màn hình chat => Emit `leaveGroup` (socket)
