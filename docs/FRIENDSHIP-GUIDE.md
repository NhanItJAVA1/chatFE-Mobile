# 👥 Hướng Dẫn Implement Chức Năng Kết Bạn - Frontend

**Target:** Frontend Team  
**Version:** 1.0  
**Last Updated:** April 11, 2026

---

## 📋 Mục Lục

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Quy Trình UI](#quy-trình-ui)
4. [State Management](#state-management)
5. [Kịch Bản Implement](#kịch-bản-implement)
6. [Error Handling](#error-handling)
7. [Real-time Updates](#real-time-updates-socket)
8. [Code Examples](#code-examples)

---

## Overview

Chức năng kết bạn gồm **2 luồng chính**:

1. **Gửi lời mời kết bạn** → Chờ người kia chấp nhận
2. **Phản hồi lời mời nhận được** → Chấp nhận hoặc từ chối

**Trạng thái Request có 3 loại:**
- `PENDING` - Đang chờ xử lý
- `ACCEPTED` - Đã chấp nhận → Trở thành bạn bè
- `DECLINED` - Đã từ chối → Request kết thúc

---

## API Endpoints

### 1️⃣ **Tìm kiếm người dùng**

```http
GET /v1/users/search?q=<phone_or_name>
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
- `q` (string, required): Số điện thoại hoặc tên người dùng

**Response (200):**
```json
{
  "data": [
    {
      "_id": "user-id-123",
      "displayName": "Nguyễn Văn A",
      "phoneNumber": "0912345678",
      "avatar": "https://bucket.s3.../avatar.jpg",
      "bio": "Hello world",
      "status": "online"
    }
  ]
}
```

**Error:**
- `400` - Query string không hợp lệ
- `401` - Unauthorized

---

### 2️⃣ **Gửi lời mời kết bạn**

```http
POST /v1/friend-requests/<receiverId>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body: {}
```

**Path Parameters:**
- `receiverId` (UUID): ID người dùng muốn kết bạn

**Response (200):**
```json
{
  "data": {
    "_id": "request-id-abc",
    "senderId": "current-user-id",
    "receiverId": "target-user-id",
    "status": "PENDING",
    "createdAt": "2026-04-11T10:00:00Z"
  }
}
```

**Errors:**
- `400` - receiverId không hợp lệ
- `401` - Unauthorized
- `404` - User không tồn tại
- `409` - Đã là bạn bè hoặc lời mời đã được gửi

---

### 3️⃣ **Xem lời mời nhận được**

```http
GET /v1/friend-requests/received
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": [
    {
      "_id": "request-id-123",
      "senderId": "user-456",
      "senderInfo": {
        "displayName": "Nguyễn Văn B",
        "phoneNumber": "0987654321",
        "avatar": "https://bucket.s3.../avatar.jpg",
        "status": "online"
      },
      "status": "PENDING",
      "createdAt": "2026-04-11T09:30:00Z"
    }
  ]
}
```

---

### 4️⃣ **Xem lời mời đã gửi**

```http
GET /v1/friend-requests/sent
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": [
    {
      "_id": "request-id-xyz",
      "receiverId": "user-789",
      "receiverInfo": {
        "displayName": "Nguyễn Thị C",
        "phoneNumber": "0901112222",
        "avatar": "https://bucket.s3.../avatar.jpg",
        "status": "offline"
      },
      "status": "PENDING",
      "createdAt": "2026-04-11T08:00:00Z"
    }
  ]
}
```

---

### 5️⃣ **Chấp nhận lời mời**

```http
PATCH /v1/friend-requests/<requestId>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "status": "ACCEPTED"
}
```

**Response (200):**
```json
{
  "data": {
    "_id": "request-id",
    "status": "ACCEPTED",
    "createdAt": "2026-04-11T09:30:00Z",
    "acceptedAt": "2026-04-11T10:15:00Z"
  }
}
```

---

### 6️⃣ **Từ chối lời mời**

```http
PATCH /v1/friend-requests/<requestId>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "status": "DECLINED"
}
```

**Response (200):**
```json
{
  "data": {
    "_id": "request-id",
    "status": "DECLINED"
  }
}
```

---

### 7️⃣ **Hủy lời mời đã gửi**

```http
DELETE /v1/friend-requests/<requestId>
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": true
}
```

---

### 8️⃣ **Xem danh sách bạn bè**

```http
GET /v1/friendships
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": [
    {
      "_id": "friendship-id",
      "friendId": "user-123",
      "friendInfo": {
        "displayName": "Nguyễn Văn A",
        "phoneNumber": "0912345678",
        "avatar": "https://bucket.s3.../avatar.jpg",
        "status": "online"
      },
      "status": "ACCEPTED",
      "createdAt": "2026-04-11T10:15:00Z"
    }
  ]
}
```

---

### 9️⃣ **Kiểm tra trạng thái bạn bè**

```http
GET /v1/friendships/<friendId>/check
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": {
    "isFriend": true,
    "status": "ACCEPTED"
  }
}
```

**Có thể trả về:**
- `ACCEPTED` - Đã là bạn bè
- `PENDING` - Lời mời đang chờ
- `DECLINED` - Lời mời bị từ chối
- `NONE` - Chưa có quan hệ

---

### 🔟 **Xem bạn chung**

```http
GET /v1/users/<userId>/mutual-friends
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": [
    {
      "_id": "user-id",
      "displayName": "Bạn chung 1",
      "avatar": "https://bucket.s3.../avatar.jpg",
      "phoneNumber": "0912345678"
    }
  ]
}
```

---

### 1️⃣1️⃣ **Gợi ý kết bạn**

```http
GET /v1/users/<userId>/suggestions
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": [
    {
      "_id": "user-id",
      "displayName": "Gợi ý kết bạn",
      "avatar": "https://bucket.s3.../avatar.jpg",
      "phoneNumber": "0912111111",
      "mutualFriendsCount": 5
    }
  ]
}
```

---

### 1️⃣2️⃣ **Hủy kết bạn (Unfriend)**

```http
DELETE /v1/friendships/<friendId>
Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**
```json
{
  "data": true
}
```

---

## Quy Trình UI

### **Scenario 1: Profile View - Người chưa kết bạn**

```
┌─────────────────────────────────────┐
│  User Profile (Nguyễn Văn A)       │
│                                     │
│  Avatar                             │
│  Name: Nguyễn Văn A                 │
│  Phone: 0912345678                  │
│  Status: Online                     │
│                                     │
│  [Gửi lời mời kết bạn]             │
│                                     │
│  Bạn chung: 5 người                 │
└─────────────────────────────────────┘

Quy trình:
1. GET /v1/users/<userId> → Hiển thị thông tin
2. GET /v1/friendships/<userId>/check → Kiểm tra trạng thái
3. Bấm nút → POST /v1/friend-requests/<userId>
4. Nút đổi thành "Hủy lời mời"
5. GET /v1/users/<userId>/mutual-friends → Hiển thị bạn chung
```

---

### **Scenario 2: Lời mời nhận được**

```
┌─────────────────────────────────────┐
│  LỜI MỜI KẾT BẠN (3 yêu cầu)       │
│                                     │
│  ┌─────────────────────────┐       │
│  │ Nguyễn Văn B            │       │
│  │ Online • 5 bạn chung    │       │
│  │ [Chấp nhận] [Từ chối]   │       │
│  └─────────────────────────┘       │
│                                     │
│  ┌─────────────────────────┐       │
│  │ Nguyễn Thị C            │       │
│  │ Offline • 2 bạn chung   │       │
│  │ [Chấp nhận] [Từ chối]   │       │
│  └─────────────────────────┘       │
│                                     │
└─────────────────────────────────────┘

Quy trình:
1. GET /v1/friend-requests/received → Load danh sách
2. Bấm "Chấp nhận" → PATCH /v1/friend-requests/<requestId> {status: ACCEPTED}
3. Request bị xóa khỏi danh sách hoặc đổi trạng thái
4. Có thể thêm người đó vào danh sách bạn bè
5. Real-time: Người gửi sẽ nhận được socket event
```

---

### **Scenario 3: Danh sách bạn bè**

```
┌─────────────────────────────────────┐
│  DANH SÁCH BẠN BÈ (12 người)       │
│                                     │
│  ┌─────────────────────────┐       │
│  │ Nguyễn Văn A            │       │
│  │ 🟢 Online               │       │
│  │ [Chat] [View] [Unfriend]│       │
│  └─────────────────────────┘       │
│                                     │
│  ┌─────────────────────────┐       │
│  │ Nguyễn Thị B            │       │
│  │ 🔴 Offline              │       │
│  │ [Chat] [View] [Unfriend]│       │
│  └─────────────────────────┘       │
│                                     │
└─────────────────────────────────────┘

Quy trình:
1. GET /v1/friendships → Load danh sách
2. Hiển thị status online/offline từ friendInfo.status
3. Bấm "Unfriend" → DELETE /v1/friendships/<friendId>
4. Xóa từ danh sách hoặc refetch data
5. Real-time: Cập nhật status khi user online/offline (socket event)
```

---

## State Management

### **Recommended State Structure (TypeScript)**

```typescript
// Store hoặc Context API
interface FriendshipState {
  // Danh sách bạn bè
  friends: Friend[];
  friendsLoading: boolean;
  friendsError: string | null;

  // Lời mời nhận được
  receivedRequests: FriendRequest[];
  receivedLoading: boolean;
  receivedError: string | null;

  // Lời mời gửi đi
  sentRequests: FriendRequest[];
  sentLoading: boolean;
  sentError: string | null;

  // Gợi ý kết bạn
  suggestions: User[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;

  // Cache trạng thái bạn bè
  friendshipStatuses: Map<string, FriendshipStatus>;
}

interface Friend {
  _id: string;
  friendId: string;
  friendInfo: {
    displayName: string;
    phoneNumber: string;
    avatar: string;
    status: "online" | "offline";
  };
  status: "ACCEPTED";
  createdAt: string;
}

interface FriendRequest {
  _id: string;
  senderId?: string;
  receiverId?: string;
  senderInfo?: {
    displayName: string;
    phoneNumber: string;
    avatar: string;
    status: "online" | "offline";
  };
  receiverInfo?: {
    displayName: string;
    phoneNumber: string;
    avatar: string;
    status: "online" | "offline";
  };
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
}

interface FriendshipStatus {
  isFriend: boolean;
  status: "ACCEPTED" | "PENDING" | "DECLINED" | "NONE";
}

interface User {
  _id: string;
  displayName: string;
  phoneNumber: string;
  avatar: string;
  status: "online" | "offline";
  bio?: string;
  mutualFriendsCount?: number;
}
```

---

## Kịch Bản Implement

### **Kịch bản 1: Gửi lời mời kết bạn**

```typescript
async function sendFriendRequest(userId: string): Promise<void> {
  try {
    const response = await fetch(`/v1/friend-requests/${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.json();
      
      if (response.status === 409) {
        // Đã là bạn bè hoặc lời mời đã gửi
        toast.error("Lời mời đã được gửi hoặc đã là bạn bè");
        return;
      }
      
      throw new Error(error.message);
    }

    const data = await response.json();
    
    // Thêm vào sentRequests state
    setSentRequests([...sentRequests, data.data]);
    
    // Update button state
    updateFriendshipStatus(userId, {
      isFriend: false,
      status: "PENDING",
    });

    toast.success("Lời mời kết bạn đã được gửi!");
  } catch (error) {
    console.error("Error sending friend request:", error);
    toast.error("Gửi lời mời thất bại!");
  }
}
```

---

### **Kịch bản 2: Xem lời mời nhận được**

```typescript
async function loadReceivedRequests(): Promise<void> {
  setReceivedLoading(true);
  
  try {
    const response = await fetch("/v1/friend-requests/received", {
      headers: {
        "Authorization": `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) throw new Error("Failed to load requests");

    const data = await response.json();
    setReceivedRequests(data.data);
  } catch (error) {
    console.error("Error loading requests:", error);
    setReceivedError("Không thể tải lời mời!");
  } finally {
    setReceivedLoading(false);
  }
}
```

---

### **Kịch bản 3: Chấp nhận lời mời**

```typescript
async function acceptFriendRequest(requestId: string): Promise<void> {
  try {
    const response = await fetch(`/v1/friend-requests/${requestId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ status: "ACCEPTED" }),
    });

    if (!response.ok) throw new Error("Failed to accept request");

    // Xóa khỏi receivedRequests
    setReceivedRequests(
      receivedRequests.filter((r) => r._id !== requestId)
    );

    // Reload bạn bè danh sách
    await loadFriends();

    // Real-time update sẽ xảy ra qua socket event
    toast.success("Đã chấp nhận lời mời kết bạn!");
  } catch (error) {
    console.error("Error accepting request:", error);
    toast.error("Chấp nhận lời mời thất bại!");
  }
}
```

---

### **Kịch bản 4: Danh sách bạn bè**

```typescript
async function loadFriends(): Promise<void> {
  setFriendsLoading(true);

  try {
    const response = await fetch("/v1/friendships", {
      headers: {
        "Authorization": `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) throw new Error("Failed to load friends");

    const data = await response.json();
    setFriends(data.data);
  } catch (error) {
    console.error("Error loading friends:", error);
    setFriendsError("Không thể tải danh sách bạn bè!");
  } finally {
    setFriendsLoading(false);
  }
}

// Render component
function FriendItem({ friend }: { friend: Friend }) {
  const handleUnfriend = async () => {
    if (!window.confirm("Bạn chắc chắn muốn hủy kết bạn?")) return;

    try {
      const response = await fetch(`/v1/friendships/${friend.friendId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${getAuthToken()}`,
        },
      });

      if (!response.ok) throw new Error("Failed to unfriend");

      // Xóa khỏi danh sách
      setFriends(friends.filter((f) => f._id !== friend._id));
      toast.success("Đã hủy kết bạn!");
    } catch (error) {
      console.error("Error unfriending:", error);
      toast.error("Hủy kết bạn thất bại!");
    }
  };

  return (
    <div className="friend-item">
      <img src={friend.friendInfo.avatar} alt={friend.friendInfo.displayName} />
      <div className="friend-info">
        <h3>{friend.friendInfo.displayName}</h3>
        <p className={`status ${friend.friendInfo.status}`}>
          {friend.friendInfo.status === "online" ? "🟢 Online" : "🔴 Offline"}
        </p>
      </div>
      <button onClick={() => startChat(friend.friendId)}>Chat</button>
      <button onClick={handleUnfriend}>Hủy kết bạn</button>
    </div>
  );
}
```

---

## Error Handling

**Các error code cần xử lý:**

```typescript
const friendshipErrorMap: Record<number, string> = {
  400: "Request không hợp lệ",
  401: "Chưa đăng nhập hoặc token hết hạn",
  404: "Người dùng không tồn tại",
  409: "Không thể thực hiện hành động (đã là bạn bè / lời mời đã gửi / không thể kết bạn với chính mình)",
  500: "Lỗi server, vui lòng thử lại",
};

async function handleFriendshipError(status: number, message: string) {
  const errorMsg = friendshipErrorMap[status] || message;
  
  console.error(`[Friendship Error] ${status}: ${errorMsg}`);
  toast.error(errorMsg);

  // Handle special cases
  if (status === 401) {
    // Redirect to login
    redirectToLogin();
  }

  if (status === 409) {
    // Reload state
    await loadFriends();
    await loadReceivedRequests();
  }
}
```

---

## Real-time Updates (Socket)

**FE phải subscribe các socket events sau:**

```typescript
// Khi component mount
useEffect(() => {
  const socket = getSocketConnection();

  // Nhận được lời mời kết bạn mới
  socket.on("friend-request:received", (data) => {
    console.log("New friend request received:", data);
    // Thêm vào receivedRequests
    setReceivedRequests([
      ...receivedRequests,
      {
        _id: data.requestId,
        senderId: data.senderId,
        senderInfo: data.senderInfo,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      },
    ]);
    // Toast notification
    toast.info(`${data.senderInfo.displayName} đã gửi lời mời kết bạn`);
  });

  // Lời mời của bạn được chấp nhận
  socket.on("friend-request:accepted", (data) => {
    console.log("Friend request accepted:", data);
    // Xóa khỏi sentRequests
    setSentRequests(sentRequests.filter((r) => r._id !== data.requestId));
    // Thêm vào danh sách bạn bè
    loadFriends();
    toast.success(`${data.acceptorInfo.displayName} đã chấp nhận lời mời`);
  });

  // Bạn bè được thêm (sau khi accept request)
  socket.on("friend:added", (data) => {
    console.log("Friend added:", data);
    loadFriends();
  });

  // Bạn bè bị xóa (unfriend)
  socket.on("friend:removed", (data) => {
    console.log("Friend removed:", data);
    setFriends(friends.filter((f) => f.friendId !== data.friendId));
  });

  // Cập nhật trạng thái online/offline
  socket.on("user:status-changed", (data) => {
    if (data.status === "online" || data.status === "offline") {
      // Cập nhật status trong friendInfo
      updateFriendStatus(data.userId, data.status);
    }
  });

  return () => {
    socket.off("friend-request:received");
    socket.off("friend-request:accepted");
    socket.off("friend:added");
    socket.off("friend:removed");
    socket.off("user:status-changed");
  };
}, []);
```

---

## Code Examples

### **Example: API Service Layer**

```typescript
// friendshipService.ts

class FriendshipService {
  private baseUrl = process.env.REACT_APP_API_URL;
  private getHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${localStorage.getItem("accessToken")}`,
    };
  }

  // Get friends list
  async getFriends() {
    const response = await fetch(`${this.baseUrl}/friendships`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Check friendship status
  async checkFriendshipStatus(userId: string) {
    const response = await fetch(
      `${this.baseUrl}/friendships/${userId}/check`,
      { headers: this.getHeaders() }
    );
    return this.handleResponse(response);
  }

  // Send friend request
  async sendFriendRequest(userId: string) {
    const response = await fetch(
      `${this.baseUrl}/friend-requests/${userId}`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      }
    );
    return this.handleResponse(response);
  }

  // Get received requests
  async getReceivedRequests() {
    const response = await fetch(
      `${this.baseUrl}/friend-requests/received`,
      { headers: this.getHeaders() }
    );
    return this.handleResponse(response);
  }

  // Get sent requests
  async getSentRequests() {
    const response = await fetch(`${this.baseUrl}/friend-requests/sent`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Accept/Decline request
  async updateFriendRequest(
    requestId: string,
    status: "ACCEPTED" | "DECLINED"
  ) {
    const response = await fetch(
      `${this.baseUrl}/friend-requests/${requestId}`,
      {
        method: "PATCH",
        headers: this.getHeaders(),
        body: JSON.stringify({ status }),
      }
    );
    return this.handleResponse(response);
  }

  // Cancel sent request
  async cancelFriendRequest(requestId: string) {
    const response = await fetch(
      `${this.baseUrl}/friend-requests/${requestId}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    );
    return this.handleResponse(response);
  }

  // Unfriend
  async unfriend(friendId: string) {
    const response = await fetch(`${this.baseUrl}/friendships/${friendId}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Get mutual friends
  async getMutualFriends(userId: string) {
    const response = await fetch(
      `${this.baseUrl}/users/${userId}/mutual-friends`,
      { headers: this.getHeaders() }
    );
    return this.handleResponse(response);
  }

  // Get friend suggestions
  async getSuggestions(userId: string) {
    const response = await fetch(
      `${this.baseUrl}/users/${userId}/suggestions`,
      { headers: this.getHeaders() }
    );
    return this.handleResponse(response);
  }

  // Search users
  async searchUsers(query: string) {
    const response = await fetch(
      `${this.baseUrl}/users/search?q=${encodeURIComponent(query)}`,
      { headers: this.getHeaders() }
    );
    return this.handleResponse(response);
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      const error = await response.json();
      throw {
        status: response.status,
        message: error.message || "An error occurred",
      };
    }
    const data = await response.json();
    return data.data;
  }
}

export const friendshipService = new FriendshipService();
```

---

### **Example: React Hook**

```typescript
// useFriendship.ts

function useFriendship() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const data = await friendshipService.getFriends();
      setFriends(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReceivedRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await friendshipService.getReceivedRequests();
      setReceivedRequests(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendFriendRequest = useCallback(async (userId: string) => {
    try {
      await friendshipService.sendFriendRequest(userId);
      await loadSentRequests();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const acceptRequest = useCallback(async (requestId: string) => {
    try {
      await friendshipService.updateFriendRequest(requestId, "ACCEPTED");
      setReceivedRequests(
        receivedRequests.filter((r) => r._id !== requestId)
      );
      await loadFriends();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [receivedRequests]);

  const declineRequest = useCallback(async (requestId: string) => {
    try {
      await friendshipService.updateFriendRequest(requestId, "DECLINED");
      setReceivedRequests(
        receivedRequests.filter((r) => r._id !== requestId)
      );
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [receivedRequests]);

  const unfriend = useCallback(async (friendId: string) => {
    try {
      await friendshipService.unfriend(friendId);
      setFriends(friends.filter((f) => f.friendId !== friendId));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [friends]);

  useEffect(() => {
    loadFriends();
    loadReceivedRequests();
  }, []);

  return {
    friends,
    receivedRequests,
    sentRequests,
    loading,
    error,
    loadFriends,
    loadReceivedRequests,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    unfriend,
  };
}

export default useFriendship;
```

---

## Checklist Implement

- [ ] Implement `FriendshipService` class
- [ ] Implement `useFriendship` hook
- [ ] Create Search Users component
- [ ] Create User Profile component with friendship actions
- [ ] Create Friend Requests component (received & sent)
- [ ] Create Friends List component
- [ ] Connect Socket.IO events
- [ ] Add error handling & toast notifications
- [ ] Add loading states
- [ ] Test tất cả flows
- [ ] Add animations/transitions

---

## Support

Nếu gặp bất kỳ vấn đề, liên hệ Backend team hoặc check swagger docs:
- API Docs: `http://localhost:3000/api-docs`
- Swagger File: `docs/swagger/paths/friend-requests.yaml` & `docs/swagger/paths/friendships.yaml`

