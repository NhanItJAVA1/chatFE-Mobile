# Kế hoạch triển khai tính năng Draft Message

Tính năng Draft Message giúp lưu lại văn bản đang gõ dở trong cuộc trò chuyện, tương tự Telegram, Zalo hay Messenger. Tính năng này yêu cầu cập nhật cả Backend và Frontend.

## Phạm vi thay đổi

### 1. Backend (API & Logic)

Cần bổ sung 2 API mới để lưu và xoá bản nháp. Cấu trúc bảng `DRAFTS` trong DynamoDB đã tồn tại với Partition Key là `CONV#<conversationId>#USER#<userId>` và Sort Key là `DRAFT#<draftId>`.

- **Cập nhật Swagger**: 
  - Thêm `POST /v1/conversations/{conversationId}/drafts` (Lưu/Cập nhật bản nháp).
  - Thêm `DELETE /v1/conversations/{conversationId}/drafts` (Xóa bản nháp).
  - Tệp chỉnh sửa: `chatBE/docs/swagger/paths/chat-conversations-base.yaml`.
- **Thêm Data Transfer Object (DTO)**:
  - Thêm `saveDraftSchema` vào `chatBE/src/modules/chat/model/dto/draft-dto.ts`.
- **Thêm Use Case**:
  - `SaveDraftCommandHandler` (`chatBE/src/modules/chat/usecase/save-draft.ts`).
  - `DeleteDraftCommandHandler` (`chatBE/src/modules/chat/usecase/delete-draft.ts`).
  - Đăng ký vào `MessagingUseCaseFacade`.
- **Cập nhật Controller & Router**:
  - Thêm method `saveDraftAPI` và `deleteDraftAPI` vào `ConversationActionsController`.
  - Export từ `MessagingHttpService` và thêm route vào `v2-chat.routes.ts`.

### 2. Frontend (Giao diện & State Management)

- **Custom Hook `useDraft`**:
  - Tạo hook `useDraft(conversationId: string)` tại thư mục hook của chat để quản lý trạng thái local storage và tự động đồng bộ (debounce 1.5s - 2s) lên server qua API.
  - Xử lý việc `saveDraft` chạy ngầm, không block UI, không hiện loading spinner.
- **`ActiveChatPane.tsx` (hoặc `ChatInput`)**:
  - Thay thế `useState` đang dùng cho text bằng state từ `useDraft`.
  - Ngay khi load conversation, fill nội dung bản nháp từ hook/cache.
  - Khi gửi tin nhắn thành công, gọi hook xoá draft ở cả local và trigger xoá ngầm trên server.
- **`ConversationItem.tsx` (Danh sách chat ở Sidebar)**:
  - Lấy thông tin draft (nếu có) thông qua state global / local cache hoặc API trả về trong danh sách cuộc trò chuyện.
  - Nếu có bản nháp, hiển thị đè lên `lastMessage` dòng chữ màu đỏ/nổi bật: `[Bản nháp] Nội dung nháp...` với CSS `truncate`.
  - Vẫn giữ nguyên hiển thị unread badge (số tin nhắn chưa đọc).

## User Review Required

> [!IMPORTANT]
> - Về mặt UX, khi người dùng xóa sạch text trong ô input, hành vi mong muốn là sẽ xóa bản nháp trên server ngay lập tức. Điều này có đúng ý bạn không?
> - Việc sử dụng Context API hoặc Zustand / Redux có bắt buộc không, hay chỉ cần Hook với LocalStorage + React Query (nếu app đang dùng) là đủ cho Sidebar và ChatPane giao tiếp? Hiện tại, việc Sidebar hiển thị chữ `[Bản nháp]` sẽ cần biết được state ở ô chat đang thay đổi, do đó nếu chỉ lưu trong hook cục bộ của ChatPane, Sidebar có thể không cập nhật realtime trừ khi dùng global state. Bạn muốn dùng giải pháp Global State nào? (Ví dụ: zustand store riêng cho draft).

## Các bước thực thi chi tiết (Roadmap)

1. **Backend**: Triển khai UseCase (`save-draft`, `delete-draft`), Controller, Routes và cập nhật file Swagger.
2. **Frontend - State Management**: Viết Zustand store hoặc Context (theo phản hồi ở trên) kết hợp Hook `useDraft` để xử lý debounce lưu trữ và giao tiếp Local Storage.
3. **Frontend - Giao diện**: Cập nhật `ActiveChatPane` để khôi phục trạng thái bản nháp.
4. **Frontend - Sidebar**: Sửa `ConversationItem` hiển thị thông báo bản nháp.
5. **Kiểm thử**: Đảm bảo UX mượt mà, gõ liên tục không lag, chuyển tab không mất nháp.

## Verification Plan

- Khởi chạy backend và frontend tại local.
- Nhập dữ liệu dở trong cuộc trò chuyện A, tắt trình duyệt/chuyển sang B, sau đó quay lại A -> Text phải còn nguyên.
- Kiểm tra danh sách chat hiển thị đúng `[Bản nháp]` và đồng bộ theo thời gian thực khi gõ.
- Nhấn Gửi -> Tin nhắn gửi đi và bản nháp được xoá hoàn toàn (cả UI và Server).
