Chào bạn, dựa vào tài liệu của dự án Backend (đặc biệt là API_SPEC.md và frontend-api.src.md), để thực hiện tính năng Poll cho Group, bạn cần sử dụng các endpoint (dưới dạng /v1/groups/{groupId}/polls...) và các luồng nghiệp vụ sau đây:

1. Quản lý chung (Tạo và Lấy danh sách Poll)
Tạo Poll mới:

Endpoint: POST /v1/groups/{groupId}/polls
Body (CreatePollRequest):
question (string): Câu hỏi khảo sát (bắt buộc, dài 1-500 ký tự).
options (string[]): Danh sách lựa chọn (bắt buộc, 2-10 items).
isMultipleChoice (boolean, mặc định: false): Có cho phép người dùng chọn nhiều hay không.
allowAddOption (boolean, mặc định: false): Có cho phép người dùng thêm lựa chọn mới vào Poll không.
expiresAt (ISO string): Thời gian hết hạn của Poll (không bắt buộc).
Lưu ý: Chỉ thành viên (thường hoặc quản trị) trong nhóm mới được quyền tạo phụ thuộc vào setting của nhóm.
Lấy danh sách Polls trong nhóm:

Endpoint: GET /v1/groups/{groupId}/polls
Có thể dùng pagination hoặc filter theo status nếu FE cần.
Lấy chi tiết 1 Poll:

Endpoint: GET /v1/groups/{groupId}/polls/{pollId}
2. Tương tác với Poll
Bình chọn (Vote):

Endpoint: POST /v1/groups/{groupId}/polls/{pollId}/vote
Body (VotePollRequest):
optionIds (string[]): Danh sách ID của các options mà người dùng chọn (chọn ít nhất 1).
Lưu ý: Return lỗi 400 nếu Poll đã hết hạn hoặc optionIds không hợp lệ.
Thêm phương án vào Poll:

Endpoint: POST /v1/groups/{groupId}/polls/{pollId}/options
Lưu ý: Chỉ thực hiện được nếu Poll được tạo với cờ allowAddOption = true.
Xem kết quả Poll (thống kê đầy đủ):

Endpoint: GET /v1/groups/{groupId}/polls/{pollId}/results
Lưu ý: Dùng để xem đầy đủ (tuỳ theo logic cấu hình ẩn/hiện kết quả mà Backend sẽ trả về chi tiết hoặc không).
3. Tác vụ của Manager/Creator với Poll
Khoá (Đóng) Poll:
Endpoint: POST /v1/groups/{groupId}/polls/{pollId}/lock
Lưu ý: Hủy khả năng vote thêm (thường chỉ người tạo hoặc admin nhóm mới được quyền khóa).
Ghim/Bỏ ghim Poll (Pin/Unpin):
Endpoint: POST /v1/groups/{groupId}/polls/{pollId}/pin (Ghim Poll)
Endpoint: DELETE /v1/groups/{groupId}/polls/{pollId}/pin (Bỏ ghim Poll)
Xóa Poll:
Endpoint: DELETE /v1/groups/{groupId}/polls/{pollId}
Lưu ý: Thường chỉ dành cho người tạo hoặc admin. Yêu cầu frontend confirm trước khi thực hiện.
4. Cập nhật theo thời gian thực (Realtime - Socket.IO)
Để tính năng này hoạt động mượt mà thì FE cần listen các events qua kết nối Socket (được định nghĩa trong chat-socket-events.md):

poll:new: Được gửi xuống kèm nội dung { conversationId, poll: PollObj } khi một bình chọn mới vừa được tạo.
poll:vote: Được gửi xuống kèm payload { conversationId, pollId, userId, poll: PollObj } mỗi khi có thành viên trong nhóm vote vào poll (giúp frontend cập nhật số liệu hiển thị tức thời mà không cần gọi API GET lần nữa).
Tóm lại Workflow phía Frontend:

Gọi API GET .../polls khi vào màn hình xem bình chọn của group.
Hiển thị UI tạo Poll qua API POST .../polls.
User click vào các option để vote -> Frontend gửi API POST .../polls/{pollId}/vote.
Lắng nghe qua socket poll:new và poll:vote để update lại store/state hiển thị cho user.


# Kế hoạch triển khai tính năng Group Poll (Bình chọn trong nhóm) - Frontend

Dưới đây là kế hoạch (plan) chi tiết để triển khai tính năng **Group Poll (Bình chọn trong nhóm)** ở phía Frontend, dựa trên các API và Socket events đã tìm hiểu từ phía Backend.

## Phase 1: Chuẩn bị & Khởi tạo (Preparation)
- [x] **1.1. Khởi tạo Types/Interfaces (TypeScript):**
  - Định nghĩa type `Poll`, `PollOption`, `CreatePollRequest`, `VotePollRequest` dựa trên cấu trúc DTO của API.
  - Poll pin field chuẩn từ BE là `pinned` (boolean), không phải `isPinned`; FE có thể giữ `isPinned` chỉ để backward compatible.
- [x] **1.2. Khởi tạo API Service (`poll.service.ts` / `api.ts`):** 
  - Khai báo các hàm gọi API REST bằng Axios hoặc Fetch (Tạo poll, Lấy danh sách, Vote, Lock, Pin, Delete...).
- [x] **1.3. Khởi tạo Socket Listener (`socket.service.ts`):**
  - Đăng ký các event listener: `poll:new`, `poll:vote`, `poll:closed`/`poll:locked`, `poll:pinned`, `poll:unpinned`, `poll:deleted`, `poll:option_added`.

## Phase 2: Xây dựng UI Components (UI Development)
- [x] **2.1. Nút "Tạo bình chọn":** 
  - Đặt ở thanh công cụ chat (chat toolbar) hoặc header nhóm.
- [x] **2.2. Modal "Tạo Bình chọn mới" (Create Poll Modal):**
  - Form nhập `question` (validate 1-500 ký tự).
  - List input cho `options` (validate 2-10 items, có nút thêm/xóa dòng).
  - Tùy chọn (Checkboxes): Cho phép chọn nhiều (`isMultipleChoice`), Cho phép thêm phương án (`allowAddOption`), Đặt thời hạn (`expiresAt`).
- [x] **2.3. Component hiển thị Poll Card (Message/Chat Feed):**
  - Poll **không render như bubble chat trái/phải theo người gửi**.
  - Render như một **interactive card / system widget** nằm chính giữa luồng chat.
  - Card nên có width tương đối lớn trên mobile (khoảng 88-94% màn hình), `alignSelf: "center"`, không dùng style `ownMessage` / `otherMessage`.
  - Giao diện hiển thị câu hỏi và danh sách các option.
  - Hiển thị thanh tiến trình (progress bar) thể hiện tỷ lệ/số lượng vote cho từng option.
  - Trạng thái Poll (Đang mở, Đã đóng, Đã hết hạn, Đang ghim).
  - Metadata nhỏ trong card: người tạo, thời gian tạo/hết hạn, tổng số vote.
  - Poll Card phải key/render identity theo `poll.id`, không dùng `lastVoteActivityMessageId`.
- [ ] **2.4. UI thêm phương án vào Poll (`allowAddOption`):**
  - Nếu `poll.allowAddOption === true` và poll chưa đóng/hết hạn, Poll Card hiển thị nút "Thêm phương án".
  - User nhập text và submit qua `POST /groups/{groupId}/polls/{pollId}/options`.
  - Body chuẩn BE yêu cầu: `{ text: string }`.
  - Sau khi thêm, cập nhật Poll Card bằng response API hoặc socket `poll:option_added`.
- [ ] **2.5. Component "Chi tiết người bình chọn" (Voters Modal):**
  - Hiển thị danh sách user đã vote khi ấn vào "Xem kết quả" (`GET .../results`).

## Phase 3: Tích hợp Logic & Kết nối API (Integration)
- [x] **3.1. Luồng Tạo Poll:**
  - Submit Form từ (2.2) -> Gọi API `POST /groups/{groupId}/polls`.
  - Handle loading state, báo lỗi UI nếu 400/403.
- [x] **3.2. Luồng Hiển thị & Lấy danh sách:**
  - Khi mở group, gọi `GET /groups/{groupId}/polls`.
  - Render Poll Card (2.3) vào luồng chat như một centered widget/system event, không căn trái/phải như tin nhắn thường.
  - Nếu backend gửi message có `messageType: "poll"`, FE cần branch riêng trong message renderer để render `PollCard` thay vì message bubble mặc định.
- [x] **3.3. Luồng Vote:**
  - User click vào option(s) -> Gọi `POST /polls/{pollId}/vote`.
  - Xử lý UX `optimistic update` (hiển thị UI đã vote ngay lập tức trước khi api response về để cảm giác nhanh) hoặc display loading spinner trên option.
- [x] **3.4. Luồng xử lý Socket (Realtime):**
  - Nhận `poll:new`: Cập nhật state list poll, render Poll Card mới ra màn hình.
  - Nhận `poll:vote`: Cập nhật lại số liệu voteCount, thanh progress bar, và danh sách người vote của đúng `pollId` đang hiển thị.
  - Nhận `poll:option_added`: Cập nhật danh sách option theo object poll BE trả về.
  - Nhận `poll:deleted`: Xóa poll khỏi UI bằng `pollId` trong payload `{ conversationId, pollId, deletedBy }`; event này không có full object poll.
  - BE tự gửi system/activity message qua `receiveMessage` hoặc kèm `systemMessage/activityMessage` trong poll socket. FE không tự sinh synthetic notification message để tránh duplicate.
- [x] **3.5. Tác vụ nâng cao (Cho Admin/Creator):**
  - Tích hợp API Lock / Pin / Delete Poll vào menu (dấu 3 chấm) trên Poll Card.
  - FE cập nhật pin/unpin bằng field `pinned`.
  - Manage Poll permission theo BE: `isGroupManager(member) || poll.createdBy === myId`. GroupManager là owner hoặc admin.
- [ ] **3.6. Cài đặt quyền tạo Poll trong Group Settings:**
  - Thêm option trong màn hình cài đặt nhóm: "Ai được tạo bình chọn".
  - Giá trị lưu vào `settings.utilityPermissions.poll`.
  - Payload update chuẩn: `{ utilityPermissions: { poll: "all" | "admins" } }`.
  - `"all"`: member/admin/owner đều tạo được.
  - `"admins"`: chỉ owner/admin tạo được.

## Phase 4: Kiểm thử & Tối ưu (Testing & Polish)
- [ ] **4.1. Edge Cases (Các trường hợp đặc biệt):**
  - Poll hết hạn nhưng user vẫn cố ấn vote -> Hiện toast thông báo.
  - Người dùng add thêm option vào Poll (nếu `allowAddOption` = true).
  - Role check: Ẩn nút Xóa/Lock nếu người dùng không phải creator, admin hoặc owner.
  - Delete idempotent: nếu poll đã bị người khác xóa và API trả not found, FE vẫn remove poll local để tránh UI kẹt.
  - Vote activity không tạo thêm Poll Card; Poll Card chỉ có một instance theo `poll.id`.
- [ ] **4.2. UI/UX Refinement:**
  - Xử lý giao diện cho thiết bị di động (Responsive).
  - Thêm Skeleton Loading khi đang fetch danh sách poll hoặc fetch chi tiết poll.
  - Format Datetime thân thiện (VD: "Hết hạn trong 2 giờ tới", "Đã đóng lúc 10:00").

## Trạng thái triển khai FE hiện tại
- [x] Poll render như centered interactive card/system widget trong chat feed.
- [x] Tạo Poll qua modal và API `POST /groups/{groupId}/polls`.
- [x] Load Poll khi mở group và merge vào chat feed theo `messageType: "poll"` hoặc synthetic poll message.
- [x] Vote Poll qua API `POST /groups/{groupId}/polls/{pollId}/vote`.
- [x] Listen realtime: `poll:new`, `poll:vote`, `poll:closed`, `poll:pinned`, `poll:unpinned`, `poll:deleted`.
- [x] Lock / Pin / Unpin / Delete Poll qua menu quản lý trên Poll Card.
- [x] Permission tạo Poll theo `settings.utilityPermissions.poll`.
- [ ] Cần sửa duplicate PollCard khi vote: không dùng `lastVoteActivityMessageId`, chỉ key theo `poll.id`.
- [ ] Cần sửa pin/unpin UI đọc field `pinned` và optimistic update ngay.
- [ ] Cần sửa delete realtime theo payload `{ conversationId, pollId, deletedBy }`.
- [ ] Cần thêm listener `poll:option_added`.
- [ ] Cần thêm UI add option trong Poll Card.
- [ ] Cần thêm setting UI cho `utilityPermissions.poll`.
- [ ] Voters/results modal riêng chưa triển khai UI chi tiết.
- [ ] UI thêm phương án vào Poll (`allowAddOption`) chưa triển khai.

  ## Điểm cần xác nhận/rủi ro trước khi làm sâu (Risks & Open Questions - Đã xác nhận)
- **Backend response shape của `PollObj`:** 
  - `id` là `id` (string).
  - Vị trí `voteCount`: Nằm trong từng object của mảng `options` (`PollOption.voteCount`). Tổng số vote nằm ở `Poll.totalVotes`.
  - Vị trí `votedUserIds`: Nằm trong từng object của mảng `options` (`PollOption.votedUserIds`). 
- **Vị trí hiển thị:** Trong code không có enum `MessageType.POLL`. Tuy nhiên `PollType` có Message tương ứng lưu lại `lastVoteActivityMessageId` trong entity Poll. FE hiện tại đang để tuỳ biến (có thể hiển thị trong feed bằng `poll:new` thông qua socket, BE có `messageType: "poll"` theo model schema). => Sẽ triển khai render như một **Poll Card / interactive system widget nằm chính giữa chat feed**, không phải bubble chat thông thường và không căn trái/phải theo người gửi.
- **Realtime (Socket):** Backend cung cấp `poll:new`, `poll:vote`, `poll:closed`/`poll:locked`, `poll:pinned`, `poll:unpinned`, `poll:deleted`, `poll:option_added`. FE cần lắng nghe đầy đủ các event này để tự động cập nhật Poll Card.
- **Phân quyền (Permissions):** Setting cho phép tạo Poll/Notes thuộc về `settings.utilityPermissions.poll` của group (có 2 giá trị `"all"` hoặc `"admins"`). FE phải check role của user xem có khớp với cấu hình này không để cho phép tạo. Lock/Pin/Delete theo rule BE: owner/admin hoặc poll creator.

# BE trả lời
## Điểm cần xác nhận/rủi ro trước khi làm sâu (Risks & Open Questions - Đã xác nhận)
- **1. Backend response shape của `PollObj`:** 
  - `id` là `id` (string).
  - Vị trí `voteCount`: Nằm trong từng object của mảng `options` (`PollOption.voteCount`). Tổng số vote nằm ở `Poll.totalVotes`.
  - Vị trí `votedUserIds`: Nằm trong từng object của mảng `options` (`PollOption.votedUserIds`). 

- **2. Vị trí hiển thị & Message ID (`lastVoteActivityMessageId`):** 
  - Poll hiển thị như một **message trong chat feed** (kết hợp với luồng tin nhắn).
  - *Lưu ý quan trọng:* KHÔNG dùng `lastVoteActivityMessageId` làm ID cho Poll Card. Trường này BE dùng để gộp (merge) các hành động vote trong khoảng 5 phút thành một tin nhắn system hiển thị chung. Poll Card phải luôn fetch và key theo `poll.id`.

- **3. Payload Socket chính xác (FE tham khảo):** 
  - Toàn bộ các sự kiện `poll:new`, `poll:閉`, `poll:pinned`, `poll:unpinned`, `poll:vote`, `poll:option_added` đều trả trọn vẹn object poll: `{ conversationId, pollId, poll, systemMessage/activityMessage... }`. Nhờ đó UI tự reload mà không gọi thêm API GET.
  - **RIÊNG `poll:deleted`:** Payload chỉ trả `{ conversationId, pollId, deletedBy }` (Không trả object Poll). Do đó Frontend bắt buộc phải tìm và xóa theo `pollId` được nhận trong payload này, không dùng `poll.id` như vài event.
  - Về System message: BE **tự tạo** bằng API (`emitToGroupRoom` với event message) gửi về `receiveMessage` + đính kèm `systemMessage` / `activityMessage` trong socket poll. **FE không cần (và không được) tự sinh tin nhắn Notification ảo** để tránh bị dup.

- **4. Request/Response các API thành phần:**
  - POST `/polls/{pollId}/pin` hay `DELETE /pin`: Response về 200 `{ data: poll }` - chứa full object poll với cờ boolean mới tên là **`pinned`** (không phải `isPinned`).
  - POST `/polls/{pollId}/options`: Body yêu cầu gửi `{ text: string }`.

- **5. Phân quyền Group Setting (Permissions):**
  - Group settings update gửi format chuẩn nesting: `{ utilityPermissions: { poll: "all" | "admins" } }`.
  - Check role tự tạo Poll: Nếu check bằng code BE (`canUseGroupUtility`) thì logic là `permission === "all" || isGroupManager(member)`.
  - Ai là **GroupManager**: Là `owner` (người tạo ra nhóm, ID lưu ở `conversation.ownerId`) HOẶC người mang role `ADMIN`. 
  - Manage Poll (Lock/Pin/Delete): Logic BE là `isGroupManager(member) || poll.createdBy === myId`. Có nghĩa là **ADMIN NHÓM TẦM QUYỀN CHUNG VỚI OWNER** vẫn hoàn toàn có thể xóa/lock poll của người khác chứ không giới hạn chỉ 'owner và creator'. Giao diện hiện tại hiển thị Menu Option cho Admin là ĐÚNG.

## Plan sửa lỗi sau QA theo contract BE
- [ ] **Fix duplicate PollCard khi vote**
  - Sửa `createPollMessage()` để message id/key luôn là `poll-${poll.id}`.
  - Không dùng `lastVoteActivityMessageId` cho PollCard identity.
  - `lastVoteActivityMessageId` chỉ thuộc về system/activity message do BE tạo/gộp trong khoảng 5 phút.
  - Khi nhận `poll:vote`, chỉ update data của PollCard hiện có theo `poll.id`.

- [ ] **Không tự tạo system message vote ở FE**
  - BE đã tự gửi system/activity message qua `receiveMessage` hoặc kèm `systemMessage/activityMessage`.
  - FE không sinh synthetic message "User A đã bình chọn" để tránh duplicate.
  - FE chỉ render system message nếu nó đi qua luồng message bình thường từ BE.

- [ ] **Fix realtime delete**
  - Normalize `poll:deleted` payload theo `{ conversationId, pollId, deletedBy }`.
  - Gọi `removePollFromState(pollId)` bằng `pollId`, không phụ thuộc `event.poll`.
  - `deletePoll()` ở FE xử lý idempotent: nếu API trả not found vì người khác đã xóa trước, vẫn remove poll local.

- [ ] **Fix pin/unpin immediate UI**
  - Dùng field chuẩn `poll.pinned`.
  - PollCard hiển thị trạng thái ghim theo `poll.pinned || poll.isPinned`.
  - `pinPoll()` optimistic set `pinned: true`.
  - `unpinPoll()` optimistic set `pinned: false`.
  - Sau API/socket, merge lại full poll từ BE.

- [ ] **Thêm add option flow**
  - Thêm action `addPollOption(pollId, text)` trong `useGroupChatMessage`.
  - `PollCard` hiển thị "Thêm phương án" khi `poll.allowAddOption === true` và poll đang mở.
  - Submit body `{ text: string }`.
  - Listen `poll:option_added` để update PollCard realtime cho các user khác.

- [ ] **Thêm Group Settings cho quyền tạo Poll**
  - Extend `settingForm.utilityPermissions.poll`.
  - Thêm UI chọn:
    - `"all"`: Mọi thành viên.
    - `"admins"`: Chỉ chủ nhóm/phó nhóm.
  - Save nested payload `{ utilityPermissions: { poll: "all" | "admins" } }`.
  - `GroupChatScreen` dùng setting này để hiện/ẩn nút tạo poll.

- [ ] **Verification**
  - Chạy `npx tsc --noEmit`.
  - Test 2 user: create, add option, vote, pin/unpin, delete realtime.
  - Xác nhận vote không tạo thêm PollCard, chỉ có PollCard cũ update và system/activity message từ BE.

