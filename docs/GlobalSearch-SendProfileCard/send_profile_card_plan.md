# Kế Hoạch Triển Khai Tính Năng: Chia Sẻ Danh Thiếp (Send Profile Card)

Tính năng "Chia sẻ danh thiếp" (Profile Card) cho phép người dùng gửi thông tin liên hệ của một người dùng khác (hoặc chính mình) vào trong một cuộc trò chuyện. Khi người khác bấm vào danh thiếp, họ có thể xem thông tin và dễ dàng kết bạn hoặc nhắn tin.

Dưới đây là kế hoạch triển khai tính năng này dựa trên tài liệu Swagger (`chat-v2.yaml`).

---

## 1. Tích Hợp API Services

Tạo mới (hoặc bổ sung vào) file `src/services/messageService.ts` hàm gọi API gửi Profile Card:

```typescript
// Endpoint: POST /v1/conversations/{conversationId}/profile-cards
interface SendProfileCardPayload {
  userId: string; // ID của người dùng mà bạn muốn chia sẻ danh thiếp
}

export const sendProfileCard = async (conversationId: string, payload: SendProfileCardPayload) => {
  // Gửi request kèm Bearer token
  return apiClient.post(`/v1/conversations/${conversationId}/profile-cards`, payload);
};
```
*Lưu ý từ Swagger:* Target user (người được chia sẻ) phải không chặn (block) người gửi. Nếu chặn sẽ trả về lỗi `403 Profile card is hidden by user relationship`.

---

## 2. Kiến Trúc Giao Diện (UI Components)

Tính năng này cần xuất hiện ở 2 luồng thao tác chính (User Flows):

### 2.1. Luồng 1: Chia sẻ từ Menu Đính kèm trong Chat (Chat Attachment Menu)
- **Vị trí:** Nút dấu `+` (hoặc icon cái kẹp giấy 📎) ở khu vực nhập tin nhắn (`ChatInput`).
- **Thao tác:** Bấm nút `+` -> Chọn **"Chia sẻ liên hệ" (Share Contact)**.
- **`ContactPickerModal.tsx`**: 
  - Một Modal hiện lên danh sách bạn bè (Friends List) của người dùng hiện tại.
  - Có thanh tìm kiếm để lọc bạn bè.
  - Chọn một (hoặc nhiều) bạn bè và bấm "Gửi". Hành động này sẽ gọi API gửi Profile Card vào `conversationId` hiện tại.

### 2.2. Luồng 2: Chia sẻ từ Trang Thông tin Người Dùng (User Profile View)
- **Vị trí:** Khi click vào Avatar của một ai đó để xem Profile (Right Sidebar hoặc Modal).
- **Thao tác:** Có một nút icon **"Chia sẻ" (Share/Forward)** nằm cạnh nút "Nhắn tin" và "Kết bạn".
- **`ShareToConversationModal.tsx`**: 
  - Khi bấm chia sẻ, một Modal hiện lên danh sách các cuộc trò chuyện (Conversations/Groups) gần đây.
  - Chọn một nhóm/chat và bấm "Gửi". Hành động này sẽ gửi Profile Card của user đang xem vào nhóm đã chọn.

---

## 3. Chi Tiết Thiết Kế UI/UX (UI/UX Design Details)

### 3.1. Cấu Trúc Tin Nhắn Danh Thiếp (Profile Card Anatomy)
Khi tin nhắn `type: 'profile_card'` hiển thị trong khung chat, nó phải nổi bật và khác biệt hoàn toàn với tin nhắn Text bình thường:
- **Thẩm mỹ (Aesthetics):** Khung tin nhắn có nền kính mờ (Glassmorphism) `backdrop-blur-md bg-white/70 dark:bg-slate-800/70`, bo góc lớn `rounded-2xl`, viền mỏng `border border-slate-200 dark:border-slate-700`, đổ bóng nhẹ `shadow-sm`.
- **Bố cục (Layout):** 
  - Nửa trên (Header): Hiển thị Avatar lớn của user (`w-14 h-14 rounded-full border-2 border-primary/20`), Tên người dùng in đậm (`text-lg font-semibold`), và trạng thái Online (chấm xanh góc phải dưới Avatar). Dưới tên là một dòng chữ phụ màu xám (Ví dụ: *"Đã tham gia từ 2024"* hoặc chức vụ).
  - Nửa dưới (Actions): Nằm dưới một dải phân cách mờ (`border-t border-slate-200/50 pt-3`). Sẽ có 2 nút hành động (Buttons):
    - Nút **"Nhắn tin" (Message)**: Nổi bật nhất (`bg-primary text-white rounded-xl py-2 px-4 flex-1`).
    - Nút **"Xem hồ sơ" (View Profile)**: Nút dạng Outline (`border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl py-2 px-4 flex-1`).

### 3.2. Trải Nghiệm Giao Diện Chọn Bạn Bè (Contact Picker Modal UX)
- **Thanh Tìm Kiếm Dính (Sticky Search Bar):** Trong `ContactPickerModal`, ô tìm kiếm sẽ luôn dính ở trên cùng (Sticky top) để người dùng có thể lướt danh sách bạn bè phía dưới mà không bị mất khung search. 
- **Thiết Kế Danh Sách (List Items):** Mỗi người bạn trong danh sách sẽ có Avatar, Tên, và một nút **"Gửi"** (màu `primary`) nằm bên phải. Khi bấm "Gửi", nút này sẽ xoay loading nhẹ, sau đó chuyển thành chữ "Đã gửi" màu xanh lá và vô hiệu hóa (Disabled) để tránh spam bấm 2 lần.

### 3.3. Vi Tương Tác & Hoạt Ảnh (Micro-interactions)
- **Framer Motion cho Modal:** 
  - Khi mở Modal chia sẻ: Fade-in và trượt từ dưới lên (`initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`).
  - Khi đóng Modal: Trượt xuống và mờ đi (`exit={{ opacity: 0, y: 20 }}`).
- **Hiệu Ứng Hover trên Card:** Khi người dùng rê chuột (hover) vào tin nhắn Danh Thiếp trong luồng chat, thẻ card sẽ hơi nhô lên một chút (`hover:-translate-y-0.5 transition-transform`) tạo cảm giác có thể bấm được.

### 3.4. Trải Nghiệm Trên Di Động (Mobile Ergonomics)
- **Bottom Sheet:** Trên điện thoại, mọi Modal chọn người/chọn nhóm để Share đều phải là dạng Bottom Sheet (Vuốt từ mép dưới màn hình lên), chiếm khoảng 70% chiều cao màn hình (`max-h-[70dvh]`).
- **Nút Bấm To Rõ:** Các nút "Gửi", "Nhắn tin", "Xem hồ sơ" trên giao diện Mobile phải có chiều cao tối thiểu `44px` (Theo chuẩn Apple UI) để ngón tay dễ chạm.

---

## 5. Quản Lý Trạng Thái (State Management)
- Tích hợp với **React Query** (`useMutation`):
  ```typescript
  const sendProfileCardMutation = useMutation({
    mutationFn: (userId: string) => sendProfileCard(conversationId, { userId }),
    onSuccess: (data) => {
      // Đóng modal
      // Toast thành công
    },
    onError: (error) => {
      // Xử lý báo lỗi 403 / 404
    }
  })
  ```
- Việc nhận tin nhắn real-time: Không cần xử lý quá đặc biệt. Khi gọi API thành công, Backend qua Socket.IO sẽ emit sự kiện `new_message` (với `type='profile_card'`), và ứng dụng Chat sẽ tự động re-render tin nhắn mới vào luồng chat nhờ kiến trúc Socket đã có sẵn.

---

## 6. Giải đáp Câu Hỏi Mở (Dựa trên phân tích Swagger)
1. **Về Dữ liệu Hydrate của Danh thiếp:** 
   - **Phân tích Swagger:** Trong `chat-schemas.yaml` (schema `MessageResponse`) và `chat-v2.yaml` (schema `MessageV2`), **KHÔNG CÓ** trường `profileCard` nào được trả về (không giống như `poll` hay `reminder` được hydrate sẵn).
   - **Kết luận kiến trúc:** Backend chỉ trả về ID của người được chia sẻ (khả năng cao được lưu ngầm trong `systemRefId` hoặc `text`). Do đó, Frontend sẽ phải tự chủ động gọi API `GET /v1/users/{userId}` (hoặc lấy từ Cache của React Query) để lấy được Tên và Avatar của người đó rồi mới render lên `ProfileCardMessage`.
2. **Về Quyền riêng tư chia sẻ (Chia sẻ người lạ):**
   - **Phân tích Swagger:** Endpoint `POST /profile-cards` có ghi chú rõ ràng: *"Target user must not have blocked the sender."* (Người đích không được phép là người đã chặn người gửi). Swagger hoàn toàn KHÔNG yêu cầu phải là bạn bè (`friends`).
   - **Kết luận kiến trúc:** **ĐƯỢC PHÉP** chia sẻ danh thiếp của người lạ (Ví dụ: một người cùng nhóm chat). Do đó, giao diện `ContactPickerModal` không nên chỉ giới hạn trong danh sách "Bạn bè", mà cần có thêm tab "Gần đây" (Recent) hoặc cho phép tìm kiếm Global Search để chia sẻ bất kỳ ai chưa chặn mình.
