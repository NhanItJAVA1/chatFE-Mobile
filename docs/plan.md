# Plan: Tinh nang Block (BE/FE)

## 1. Muc tieu
- Cho phep nguoi dung block/unblock nguoi dung khac.
- Danh sach cac user da block va kiem tra trang thai block voi 1 user.
- Ap dung block rules vao cac luong nhay cam: chat 1-1, tao conversation, profile/presence, gui profile card.
- Dong bo trang thai block qua Socket.IO de UI cap nhat realtime.

## 2. Scope
### In scope
- HTTP endpoints Block/Unblock/List/Check.
- Cursor pagination cho list (neu can).
- Socket.IO namespace /blocks cho thong bao block/unblock.
- UX/logic FE: nut block/unblock, trang danh sach block, kiem tra block status.
- Xu ly loi/permission khi bi block trong cac luong chat va friend request.

### Out of scope (neu chua can)
- Group block (block member trong group).
- Thay doi schema DB.
- Thay doi policy privacy khac.

## 3. Reference nhanh (tu source)
- HTTP routes mount: /v1/blocks*.
- Use case: block se xoa friendship va friend requests pending 2 chieu.
- Socket: namespace /blocks voi event block:blocked, block:unblocked.

## 4. Backend (hien co)
### 4.1 Endpoints
- POST /v1/blocks/{blockedUserId}
- DELETE /v1/blocks/{blockedUserId}
- GET /v1/blocks
- GET /v1/blocks/cursor
- GET /v1/blocks/{blockedUserId}/check

### 4.2 Behavior chi tiet
- Block:
  - Khong cho block chinh minh.
  - 404 neu user bi block khong ton tai.
  - 400 neu da block.
  - Soft delete friendship (neu co).
  - Xoa friend request pending 2 chieu (neu co).
  - Tao record block moi.
  - Emit socket event block:blocked toi user bi block.

- Unblock:
  - Xoa record block theo cap blockerId/blockedUserId.
  - 404 neu khong ton tai.
  - Emit socket event block:unblocked toi user bi unblock.

- List:
  - Tra ve block items kem blockedUser summary + blockedUserUnavailable.
  - Paging theo page/limit (list).
  - Cursor pagination neu dung /blocks/cursor.

- Check:
  - Tra ve { isBlocked: boolean } theo cap blockerId/blockedUserId.

### 4.3 Error codes can nho
- 401: chua auth.
- 400: invalid, block minh, da block.
- 404: user khong ton tai hoac block not found (unblock).

## 5. Frontend (can lam)

### 5.1 UI/UX
- Man hinh profile user:
  - Nut "Block" neu chua block.
  - Nut "Unblock" neu dang block.
  - Confirm dialog truoc khi block/unblock.

- Man hinh danh sach block:
  - List cac user da block.
  - Cho phep unblock ngay tren list.
  - Ho tro paging (page/limit) hoac cursor.

- Trong chat 1-1:
  - Neu bi block hoac dang block, disable input va hien thong bao.
  - Neu bi block, han che nhin thay profile/presence neu BE tra ve cho context.

### 5.2 API integration
#### A. Block user
- Request: POST /v1/blocks/{blockedUserId}
- Headers: Authorization
- Body: none
- Success (200): { data: { id, message } }
- Failure: 400/401/404

#### B. Unblock user
- Request: DELETE /v1/blocks/{blockedUserId}
- Headers: Authorization
- Body: none
- Success (204)
- Failure: 401/404

#### C. List blocked users
- Request: GET /v1/blocks?page=1&limit=20
- Headers: Authorization
- Success: { data: { items, total, page, limit, hasMore } }

#### D. Check block status
- Request: GET /v1/blocks/{blockedUserId}/check
- Headers: Authorization
- Success: { data: { isBlocked } }

### 5.3 Socket integration
- Namespace: /blocks
- Server events:
  - block:blocked
  - block:unblocked
- FE su dung de cap nhat UI realtime (neu user bi block/unblock).

### 5.4 UI state rules
- Neu dang block user B:
  - Khong cho gui friend request toi B.
  - Khong cho chat 1-1 (input disable, thong bao).
- Neu bi user B block:
  - Neu BE tra ve loi 403/blocked cho message, hien banner "User has blocked you".

## 6. Flow chi tiet

### 6.1 Block flow
1) User bam "Block" tren profile.
2) FE call POST /v1/blocks/{blockedUserId}.
3) BE thuc hien block + emit socket.
4) FE cap nhat UI: status = blocked, disable chat input.
5) Neu co chat dang mo, hien thong bao.

### 6.2 Unblock flow
1) User bam "Unblock".
2) FE call DELETE /v1/blocks/{blockedUserId}.
3) BE xoa block + emit socket.
4) FE cap nhat UI: status = normal, enable chat input (neu khong co rule khac).

### 6.3 Realtime flow
1) User B bi block boi A.
2) B nhan event block:blocked trong /blocks.
3) FE cua B cap nhat UI (disable chat to A, cap nhat danh sach/hien thong bao).

## 7. Test plan

### 7.1 API tests (manual/automation)
- Block chinh minh -> 400.
- Block user khong ton tai -> 404.
- Block user hop le -> 200 va co id.
- Block user da block -> 400.
- Unblock user da block -> 204.
- Unblock user chua block -> 404.
- GET /blocks list -> paging dung.
- GET /blocks/check -> true/false dung.

### 7.2 UI tests
- Nut block/unblock state dung theo check status.
- Chat input disable neu blocked.
- Danh sach block load va paging OK.
- Realtime block/unblock cap nhat UI neu co socket.

## 8. Rollout/Release
- Backend da co san, chi can FE.
- Neu FE can tuong tac voi cursor list, xac nhan su dung /blocks hay /blocks/cursor.
- Update docs FE neu co thay doi UI.

## 9. Risk/Notes
- Cac luong chat/friend request bi block se tra loi 403 hoac message blocked tu BE. FE can hien thong bao ro rang.
- Email trong blockedUser summary chi tra neu du rule (self/active friend).
- Khi block, friendship va pending requests bi xoa, FE can lam moi cache friend/friend request neu can.

## 10. Huong dan tich hop FE chi tiet

### 10.1 Base config
- Base URL: https://{api-host}/v1
- Auth: Header Authorization: Bearer <access_token>
- Response wrapper: { data: ... } (neu thanh cong)

### 10.2 API contract (chi tiet)

#### POST /v1/blocks/{blockedUserId}
- Muc dich: Block user
- Params: blockedUserId (uuid)
- Headers: Authorization
- Body: none
- Success (200):
  - { data: { id: string, message: string } }
- Error:
  - 400: block minh / da block / invalid
  - 401: unauth
  - 404: user bi block khong ton tai

#### DELETE /v1/blocks/{blockedUserId}
- Muc dich: Unblock user
- Params: blockedUserId (uuid)
- Headers: Authorization
- Body: none
- Success (204): no content
- Error:
  - 401: unauth
  - 404: block not found

#### GET /v1/blocks
- Muc dich: List blocked users
- Query: page (default 1), limit (default 20)
- Headers: Authorization
- Success (200):
  - { data: { items: BlockWithUser[], total, page, limit, hasMore } }

#### GET /v1/blocks/cursor
- Muc dich: List blocked users by cursor
- Query: cursor (string | null), limit (int)
- Headers: Authorization
- Success (200):
  - { data: { items: BlockWithUser[], cursor, limit } }

#### GET /v1/blocks/{blockedUserId}/check
- Muc dich: Check block status
- Params: blockedUserId (uuid)
- Headers: Authorization
- Success (200):
  - { data: { isBlocked: boolean } }

### 10.3 Data shape (tham khao)

#### Block
- id: string
- blockerId: string
- blockedUserId: string
- createdAt: string (ISO)

#### BlockedUserSummary
- id, displayName, username, avatarUrl, coverUrl, bio, verified, status
- email: co the khong co (tuy rule)

#### BlockWithUser
- Block + blockedUser (BlockedUserSummary | null)
- blockedUserUnavailable: boolean

### 10.4 Socket.IO (realtime)

#### Namespace
- /blocks (authenticated)

#### Events
- Server -> Client:
  - block:blocked { type: "USER_BLOCKED", data: { blockedBy }, timestamp }
  - block:unblocked { type: "USER_UNBLOCKED", data: { unblockedBy }, timestamp }
- Client -> Server:
  - ping -> pong

#### FE handling
- Khi nhan block:blocked:
  - Neu blockedBy == user dang chat, disable input va hien banner.
  - Update cache block list (add relation) neu can.
- Khi nhan block:unblocked:
  - Neu unblockedBy == user dang chat, enable input (neu khong bi policy khac).
  - Update cache block list (remove relation) neu can.

### 10.5 UX/Behavior details

#### Profile screen
- Neu isBlocked == true: hien nut Unblock.
- Neu isBlocked == false: hien nut Block.
- Confirm dialog truoc khi thuc thi.

#### Chat 1-1 screen
- Neu blocked (minh block hoac bi block):
  - Disable input
  - Hien thong bao "Khong the nhan/gui tin nhan do da bi block"
  - An cac hanh dong nhay cam (goi call, gui profile card)

#### Friend request
- Neu bi block: backend se tra 403 hoac message blocked.
- FE can hien thong bao "Khong the gui ket ban do bi chan".

### 10.6 Cache va state
- Sau block/unblock:
  - Invalidate friends list (vi friendship bi soft delete khi block).
  - Invalidate friend requests (pending 2 chieu bi xoa).
  - Invalidate block list va check status cache.

### 10.7 Example pseudo flow

#### Block user
1) FE call POST /v1/blocks/{id}
2) Success -> update state isBlocked = true
3) Update UI (disable chat input)
4) Wait socket to sync other tabs

#### Unblock user
1) FE call DELETE /v1/blocks/{id}
2) Success -> update state isBlocked = false
3) Update UI (enable chat input neu du dieu kien)

### 10.8 QA checklist (FE)
- Block/unblock thanh cong va UI update dung.
- Block list load dung paging/cursor.
- Check status dung tren profile/chat.
- Realtime event update dung khi co nhieu tab.
- Error handling dung cho 400/401/403/404.
