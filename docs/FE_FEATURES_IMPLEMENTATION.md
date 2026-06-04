# FE Feature Implementation Notes

Updated: 2026-06-01

This document summarizes what the backend already provides and what the frontend needs to implement for:
- Typing indicator for messages
- Online status (green dot)
- Device login management (auth profile)
- Friend management
- Delete conversation

Sources:
- FE integration guide: docs/FE_INTEGRATION_GUIDE_V2.md
- API catalog: docs/API_SPEC.md
- Socket overview: docs/SOCKET_IO_EVENTS_OVERVIEW.md
- Socket reference: docs/SOCKET_IO_BACKEND_REFERENCE.md

---

## 1) Typing indicator

### BE provides

Socket namespace:
- /messages (business typing events)

Client -> Server:
- typing:start
- typing:stop

Payload:
- Private typing: { toUserId }
- Group typing: { groupId }

Server -> Client:
- typing:start with { userId, toUserId? } or { userId, groupId }
- typing:stop with { userId, toUserId? } or { userId, groupId }

Notes:
- Root namespace typing only touches presence; do not use it for chat UI.
- /messages socket is auth-protected and already joins user rooms.

### FE needs to do

- Connect to /messages socket with JWT auth.
- When user starts typing, emit typing:start with toUserId (private) or groupId (group).
- Debounce typing:start (e.g., send once, then keepalive every 3-5s if still typing).
- On idle (e.g., 2-3s no keystroke), emit typing:stop.
- Listen for typing:start/typing:stop and show typing UI only within the active conversation.

### UI suggestion

- Private chat: show "User is typing..." under header or above input.
- Group chat: show compact "A, B are typing" with max 2 names and a +N suffix.

---

## 2) Online status (green dot)

### BE provides

Root namespace:
- user:online
- user:offline
- getOnlineStatus (ack)
- getBatchOnlineStatus (ack)

Payload includes:
- online / isOnline
- lastSeen
- visibility (privacy-aware)

REST:
- GET /v1/users/{id}/presence (privacy-aware)

Notes:
- Presence is filtered by privacy and relationship.
- /messages also re-emits user:online/user:offline, but root is the canonical presence helper.

### FE needs to do

- On app start, connect to root namespace and to /messages.
- For visible user lists (chat list, friend list, profile card), call getBatchOnlineStatus with userIds.
- Subscribe to user:online and user:offline to update dots in real time.
- Honor privacy: if response says not visible, show "last seen hidden" or no dot.

### UI suggestion

- Green dot for online, gray dot for offline if allowed, or hide if privacy says hidden.
- For lists, use subtle dot overlay on avatar; for profile page, use label + dot.

---

## 3) Device login management (auth profile)

### BE provides

Auth sessions:
- GET /v1/auth/sessions (list devices)
- DELETE /v1/auth/sessions (revoke all)
- DELETE /v1/auth/sessions/{deviceId} (revoke one device)

Auth profile:
- PATCH /v1/auth/avatar (update avatar tied to auth profile)

User profile:
- GET /v1/users/me/profile (current user profile + privacy)
- PATCH /v1/users/me/profile (update current user profile)
- PATCH /v1/users/me/privacy (update privacy)

Device/session headers used at login/register:
- x-device-id
- x-device-type
- x-device-platform
- x-display-label
- x-device-location
- user-agent

Socket:
- session:revoked event in root namespace

### FE needs to do

- Login/register: send device headers so backend can track sessions per device.
- Build a "Login devices" section in profile:
  - List sessions from GET /v1/auth/sessions.
  - Provide "Log out this device" and "Log out all".
- Listen for session:revoked; if current device revoked, force logout.
- Profile screen:
  - Load /v1/users/me/profile.
  - Allow editing displayName, avatar, bio, etc. per API schema.
  - Allow privacy settings via PATCH /v1/users/me/privacy.

### UI suggestion

- Device list row: icon + display label + location + last active time + "Revoke".
- Show "This device" badge for current deviceId.

---

## 4) Friend management (add, delete, block)

### BE provides

REST (add/delete):
- GET /v1/friendships (list friends)
- DELETE /v1/friendships/{friendId} (unfriend)
- GET /v1/friendships/search (search friends)
- GET /v1/friend-requests/received
- GET /v1/friend-requests/sent
- POST /v1/friend-requests/{receiverId} (send request)
- PATCH /v1/friend-requests/{requestId} (accept)
- DELETE /v1/friend-requests/{requestId} (reject/cancel)
- GET /v1/friend-requests/check/{targetUserId} (check status)
- GET /v1/friendships/count
- GET /v1/users/{id}/mutual-friends
- GET /v1/friends/suggestions

REST (block):
- POST /v1/blocks/{blockedUserId} (block)
- DELETE /v1/blocks/{blockedUserId} (unblock)
- GET /v1/blocks (list blocked)
- GET /v1/blocks/cursor (list blocked with cursor)
- GET /v1/blocks/{blockedUserId}/check (check block status)

Socket (/friends namespace):
- friend_request:received
- friend_request:accepted
- friend_request:rejected
- friend_request:canceled
- friendship:unfriended
- block:detected (notify if block affects relationships)

Socket (/blocks namespace):
- block:blocked
- block:unblocked

### Confirm
1. Block status cần phân biệt 2 chiều
Handler lấy blockerId = requester.sub và gọi usecase.isBlocked(blockerId, blockedUserId) rồi trả { isBlocked } nên chỉ là chiều “mình block họ”. Xem index.ts.
Usecase isBlocked chỉ tìm theo blockerId + blockedUserId, không check ngược. Xem index.ts.
Swagger chỉ mô tả { isBlocked }, không có field 2 chiều. Xem blocks.yaml.
FE phải suy luận từ lỗi 403/blocked và socket events.
2. Blocked list dùng page hay cursor: /v1/blocks/cursor.
3. Device ID lưu ở đâu: Phần này tôi không rành bạn hãy giúp tôi phương án tốt nhất.
4. Delete conversation khi đang mở chat: sau khi delete conversation đang mở thì quay về chat list, hay giữ màn chat trống. confirm xong thì remove khỏi list, clear message cache, navigate về chat list.
5. Friend/block cache: block user, BE xóa friendship và pending requests. FE cần invalidate friends, requests, suggestions, conversation/profile state.
### FE needs to do

- Implement 3 tabs: Friends, Requests (Received/Sent), Suggestions.
- Add Blocked list in settings or privacy area.
- Use REST for list and actions; keep counts in sync.
- Connect to /friends and /blocks sockets and update UI in real time.
- When blocked: remove or hide conversations, disable message/send/friend actions.
- When unblocked: allow re-add and restore UI actions.

### UI suggestion

- Requests: card with avatar + name + Accept/Reject.
- Suggestions: quick Add button, plus mutual friends count.
- Blocked list: compact rows with Unblock action and a short privacy note.

---

## 5) Delete conversation

### BE provides

REST:
- DELETE /v1/conversations/{conversationId}

Notes:
- Delete is per user and stored as deletedAt (history cutoff).
- Messages after deletedAt remain accessible when they are new.

Socket:
- No dedicated delete conversation socket event; rely on REST and refresh list.

### FE needs to do

- Add "Delete conversation" in conversation options.
- Call DELETE /v1/conversations/{conversationId}.
- Remove conversation from list locally; clear messages cache for that conversation.
- If user opens same conversation again, reload from server.

### UI suggestion

- Confirm dialog: "Delete only removes for you".
- Offer "Archive" or "Hide" as softer alternatives if needed.

---

## 6) Implementation checklist (summary)

- Socket connections:
  - Root: presence + session revoke
  - /messages: typing and chat events
  - /friends: friend request notifications
  - /blocks: block/unblock notifications
- Presence:
  - Use getBatchOnlineStatus for lists
  - Listen for user:online/user:offline
- Typing:
  - Emit typing:start/typing:stop with debounce
  - Show typing indicator only for active conversation
- Device management:
  - Use /v1/auth/sessions endpoints
  - Display current device and revoke actions
- Friend management:
  - Add/delete via friend requests + unfriend
  - Block/unblock via /v1/blocks and /blocks socket
- Delete conversation:
  - Call DELETE /v1/conversations/{id}
  - Update conversation list and local caches

---

## 7) Design direction (quick ideas)

- Layout: a two-column chat list + conversation panel; profile and friends in a separate left-side tab.
- Presence: keep online dots small (6-8px) and consistent across list + profile.
- Typing: use subtle animated ellipsis bubble, avoid oversized banners.
- Device list: emphasize safety with a clear "Sign out other devices" action.
- Friends: separate "Requests" into Received/Sent; keep top CTA for "Find friends".
