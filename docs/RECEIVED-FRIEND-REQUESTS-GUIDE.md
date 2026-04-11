# 📬 Hướng Dẫn: Xem & Phản Hồi Lời Mời Kết Bạn - Frontend

**Target:** Frontend Team  
**Feature:** Received Friend Requests Management  
**Version:** 1.0

---

## 📋 Mục Lục

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Implementation Flow](#implementation-flow)
4. [Code Examples](#code-examples)
5. [UI/UX Design](#uiux-design)
6. [Testing Checklist](#testing-checklist)

---

## Overview

**Chức năng:** 
- Người nhận lời mời kết bạn có thể xem danh sách lời mời
- Có thể chấp nhận hoặc từ chối lời mời
- Tự động cập nhật danh sách bạn bè khi chấp nhận

**Luồng:**
```
Người A gửi lời mời
         ↓
Người B nhận được notification
         ↓
Người B mở app → Thấy danh sách lời mời
         ↓
Người B chọn "Chấp nhận" hoặc "Từ chối"
         ↓
Status thay đổi → Cập nhật UI
         ↓
✅ Hoặc ❌ Kết thúc
```

---

## API Endpoints

### **Endpoint 1: Lấy Danh Sách Lời Mời Nhận Được**

```http
GET /v1/friend-requests/received
Authorization: Bearer <token>
```

**Query Parameters:**
- Không có (có thể thêm pagination nếu cần)

**Response (200) - Thành công:**
```json
{
  "data": [
    {
      "_id": "request-id-123abc",
      "senderId": "user-id-456def",
      "senderInfo": {
        "displayName": "Nguyễn Văn A",
        "phoneNumber": "0912345678",
        "avatar": "https://bucket.s3.../avatar-456def.jpg",
        "status": "online"
      },
      "status": "PENDING",
      "createdAt": "2026-04-11T09:30:00Z"
    },
    {
      "_id": "request-id-456xyz",
      "senderId": "user-id-789uvw",
      "senderInfo": {
        "displayName": "Nguyễn Thị B",
        "phoneNumber": "0987654321",
        "avatar": "https://bucket.s3.../avatar-789uvw.jpg",
        "status": "offline"
      },
      "status": "PENDING",
      "createdAt": "2026-04-10T14:20:00Z"
    }
  ]
}
```

**Error (401) - Unauthorized:**
```json
{
  "message": "Unauthorized"
}
```

---

### **Endpoint 2: Chấp Nhận Lời Mời**

```http
PATCH /v1/friend-requests/<requestId>
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "status": "ACCEPTED"
}
```

**Path Parameters:**
- `requestId` (string, required): ID của lời mời kết bạn

**Response (200) - Thành công:**
```json
{
  "data": {
    "_id": "request-id-123abc",
    "status": "ACCEPTED",
    "createdAt": "2026-04-11T09:30:00Z",
    "acceptedAt": "2026-04-11T10:15:00Z",
    "senderInfo": {
      "displayName": "Nguyễn Văn A",
      "phoneNumber": "0912345678"
    }
  }
}
```

**Error (404) - Not found:**
```json
{
  "message": "Request not found"
}
```

**Error (422) - Invalid status:**
```json
{
  "message": "Invalid status value"
}
```

---

### **Endpoint 3: Từ Chối Lời Mời (Optional)**

```http
PATCH /v1/friend-requests/<requestId>
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "status": "DECLINED"
}
```

**Response (200) - Thành công:**
```json
{
  "data": {
    "_id": "request-id-123abc",
    "status": "DECLINED"
  }
}
```

---

## Implementation Flow

### **Flow Diagram:**

```
┌─────────────────────────────────┐
│   App Mounted / Tab Focused     │
└────────────────┬────────────────┘
                 ↓
         loadReceivedRequests()
                 ↓
    GET /v1/friend-requests/received
                 ↓
    ┌────────────┴────────────┐
    ↓ Success               ↓ Error
  Set State          Show Error Toast
    ↓
┌──────────────────────────────┐
│ Display Friend Requests List │
│ ┌──────────────────────────┐ │
│ │ [Avatar] Nguyễn Văn A    │ │
│ │ 0912345678 | Online      │ │
│ │ [Chấp nhận] [Từ chối]    │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
         ↓         ↓
    [Accept]  [Decline]
         ↓         ↓
    PATCH API   PATCH API
    (ACCEPTED) (DECLINED)
         ↓         ↓
    ┌────┴────────┴────┐
    ↓ Success     ↓ Error
   Update      Show Error
   State         Toast
    ↓
┌──────────────────┐
│ Remove from list │
│ OR               │
│ Change status    │
└──────────────────┘
    ↓
  Notify User ✅
```

---

## Code Examples

### **Service Layer**

```typescript
// src/services/friendRequestService.ts

import { apiClient } from './apiClient';

export class FriendRequestService {
  /**
   * Lấy danh sách lời mời nhận được
   */
  async getReceivedRequests() {
    try {
      console.log('[friendRequestService] Getting received requests...');
      const response = await apiClient.get('/v1/friend-requests/received');
      console.log('[friendRequestService] Received requests loaded:', response);
      return response;
    } catch (error) {
      console.error('[friendRequestService] Get received error:', error);
      throw error;
    }
  }

  /**
   * Chấp nhận lời mời kết bạn
   */
  async acceptFriendRequest(requestId: string) {
    if (!requestId) {
      throw new Error('requestId is required');
    }

    try {
      console.log(`[friendRequestService] Accepting request ${requestId}...`);
      const response = await apiClient.patch(
        `/v1/friend-requests/${requestId}`,
        { status: 'ACCEPTED' }
      );
      console.log('[friendRequestService] Request accepted:', response);
      return response;
    } catch (error) {
      console.error('[friendRequestService] Accept error:', error);
      throw error;
    }
  }

  /**
   * Từ chối lời mời kết bạn
   */
  async declineFriendRequest(requestId: string) {
    if (!requestId) {
      throw new Error('requestId is required');
    }

    try {
      console.log(`[friendRequestService] Declining request ${requestId}...`);
      const response = await apiClient.patch(
        `/v1/friend-requests/${requestId}`,
        { status: 'DECLINED' }
      );
      console.log('[friendRequestService] Request declined:', response);
      return response;
    } catch (error) {
      console.error('[friendRequestService] Decline error:', error);
      throw error;
    }
  }
}

export const friendRequestService = new FriendRequestService();
```

---

### **Custom Hook**

```typescript
// src/hooks/useFriendRequests.ts

import { useState, useEffect, useCallback } from 'react';
import { friendRequestService } from '../services/friendRequestService';

export interface FriendRequest {
  _id: string;
  senderId: string;
  senderInfo: {
    displayName: string;
    phoneNumber: string;
    avatar: string;
    status: 'online' | 'offline';
  };
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export function useFriendRequests() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  /**
   * Load received requests
   */
  const loadReceivedRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendRequestService.getReceivedRequests();
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load requests';
      setError(errorMessage);
      console.error('[useFriendRequests] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Accept friend request
   */
  const acceptRequest = useCallback(
    async (requestId: string) => {
      try {
        await friendRequestService.acceptFriendRequest(requestId);
        
        // Remove from list
        setRequests(requests.filter(r => r._id !== requestId));
        
        console.log('[useFriendRequests] Request accepted successfully');
        return true;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to accept request';
        setError(errorMessage);
        console.error('[useFriendRequests] Accept error:', err);
        return false;
      }
    },
    [requests]
  );

  /**
   * Decline friend request
   */
  const declineRequest = useCallback(
    async (requestId: string) => {
      try {
        await friendRequestService.declineFriendRequest(requestId);
        
        // Remove from list
        setRequests(requests.filter(r => r._id !== requestId));
        
        console.log('[useFriendRequests] Request declined successfully');
        return true;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to decline request';
        setError(errorMessage);
        console.error('[useFriendRequests] Decline error:', err);
        return false;
      }
    },
    [requests]
  );

  /**
   * Refresh requests
   */
  const refresh = useCallback(async () => {
    setRefreshCount(prev => prev + 1);
    await loadReceivedRequests();
  }, [loadReceivedRequests]);

  /**
   * Load on mount
   */
  useEffect(() => {
    loadReceivedRequests();
  }, [loadReceivedRequests]);

  return {
    requests,
    loading,
    error,
    acceptRequest,
    declineRequest,
    refresh,
    loadReceivedRequests,
    pendingCount: requests.length,
  };
}
```

---

### **Component Example (React Native)**

```typescript
// src/screens/FriendRequestsScreen.tsx

import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFriendRequests } from '../hooks/useFriendRequests';
import { Toast } from '../components/Toast';

export function FriendRequestsScreen() {
  const {
    requests,
    loading,
    error,
    acceptRequest,
    declineRequest,
    refresh,
  } = useFriendRequests();

  const [loadingRequestId, setLoadingRequestId] = React.useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    setLoadingRequestId(requestId);
    const success = await acceptRequest(requestId);
    setLoadingRequestId(null);

    if (success) {
      Toast.show({
        type: 'success',
        text1: 'Accepted',
        text2: 'Lời mời đã được chấp nhận',
      });
    }
  };

  const handleDecline = async (requestId: string) => {
    Alert.alert('Từ chối lời mời', 'Bạn chắc chắn muốn từ chối?', [
      { text: 'Huỷ', onPress: () => {} },
      {
        text: 'Từ chối',
        onPress: async () => {
          setLoadingRequestId(requestId);
          const success = await declineRequest(requestId);
          setLoadingRequestId(null);

          if (success) {
            Toast.show({
              type: 'info',
              text1: 'Đã từ chối',
              text2: 'Lời mời đã được từ chối',
            });
          }
        },
        style: 'destructive',
      },
    ]);
  };

  if (loading && requests.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3a86ff" />
        <Text style={{ marginTop: 10 }}>Đang tải lời mời...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#d32f2f', marginBottom: 10 }}>Lỗi: {error}</Text>
        <TouchableOpacity
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            backgroundColor: '#3a86ff',
            borderRadius: 8,
          }}
          onPress={refresh}
        >
          <Text style={{ color: '#fff' }}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (requests.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#999', fontSize: 16 }}>
          Không có lời mời kết bạn
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={(item) => item._id}
      refreshControl={
        <RefreshControl
          refreshing={loading && requests.length > 0}
          onRefresh={refresh}
        />
      }
      renderItem={({ item }) => (
        <FriendRequestItem
          request={item}
          loading={loadingRequestId === item._id}
          onAccept={() => handleAccept(item._id)}
          onDecline={() => handleDecline(item._id)}
        />
      )}
      contentContainerStyle={{ padding: 10 }}
    />
  );
}

/**
 * Friend Request Item Component
 */
function FriendRequestItem({
  request,
  loading,
  onAccept,
  onDecline,
}: {
  request: FriendRequest;
  loading: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      {/* Avatar */}
      <Image
        source={{ uri: request.senderInfo.avatar }}
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          marginRight: 12,
        }}
      />

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>
          {request.senderInfo.displayName}
        </Text>
        <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {request.senderInfo.phoneNumber}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 4, alignItems: 'center' }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: 
                request.senderInfo.status === 'online' ? '#4caf50' : '#ccc',
              marginRight: 4,
            }}
          />
          <Text style={{ fontSize: 11, color: '#999' }}>
            {request.senderInfo.status === 'online' ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Buttons */}
      {loading ? (
        <ActivityIndicator size="small" color="#3a86ff" />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: '#3a86ff',
              borderRadius: 6,
            }}
            onPress={onAccept}
            disabled={loading}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              Chấp nhận
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 6,
            }}
            onPress={onDecline}
            disabled={loading}
          >
            <Text style={{ color: '#333', fontSize: 12, fontWeight: '600' }}>
              Từ chối
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
```

---

### **Component Example (Web - React)**

```typescript
// src/pages/FriendRequestsPage.tsx

import React from 'react';
import { useFriendRequests } from '../hooks/useFriendRequests';
import './FriendRequestsPage.css';

export function FriendRequestsPage() {
  const {
    requests,
    loading,
    error,
    acceptRequest,
    declineRequest,
    refresh,
  } = useFriendRequests();

  const [loadingRequestId, setLoadingRequestId] = React.useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    setLoadingRequestId(requestId);
    const success = await acceptRequest(requestId);
    setLoadingRequestId(null);

    if (success) {
      alert('✅ Lời mời đã được chấp nhận!');
    }
  };

  const handleDecline = async (requestId: string) => {
    if (window.confirm('Bạn chắc chắn muốn từ chối?')) {
      setLoadingRequestId(requestId);
      const success = await declineRequest(requestId);
      setLoadingRequestId(null);

      if (success) {
        alert('✅ Lời mời đã được từ chối!');
      }
    }
  };

  return (
    <div className="friend-requests-page">
      <div className="header">
        <h1>Lời Mời Kết Bạn ({requests.length})</h1>
        <button
          className="btn-refresh"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
          <button onClick={refresh}>Thử lại</button>
        </div>
      )}

      {loading && requests.length === 0 && (
        <div className="loading">
          <p>⏳ Đang tải lời mời...</p>
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div className="empty-state">
          <p>📭 Không có lời mời kết bạn</p>
        </div>
      )}

      <div className="requests-list">
        {requests.map((request) => (
          <div key={request._id} className="request-item">
            <img
              src={request.senderInfo.avatar}
              alt={request.senderInfo.displayName}
              className="avatar"
            />

            <div className="info">
              <h3>{request.senderInfo.displayName}</h3>
              <p className="phone">{request.senderInfo.phoneNumber}</p>
              <span className={`status ${request.senderInfo.status}`}>
                {request.senderInfo.status === 'online' ? '🟢 Online' : '🔴 Offline'}
              </span>
            </div>

            <div className="actions">
              <button
                className="btn btn-accept"
                onClick={() => handleAccept(request._id)}
                disabled={loadingRequestId === request._id}
              >
                {loadingRequestId === request._id ? '...' : 'Chấp nhận'}
              </button>
              <button
                className="btn btn-decline"
                onClick={() => handleDecline(request._id)}
                disabled={loadingRequestId === request._id}
              >
                Từ chối
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## UI/UX Design

### **Layout Suggestions:**

```
┌─────────────────────────────────┐
│ Lời Mời Kết Bạn (3)       [🔄] │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ [Avatar]               │   │
│  │ Nguyễn Văn A           │   │
│  │ 0912345678 | 🟢 Online │   │
│  │                         │   │
│  │ [Chấp nhận] [Từ chối]   │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ [Avatar]               │   │
│  │ Nguyễn Thị B           │   │
│  │ 0987654321 | 🔴 Offline│   │
│  │                         │   │
│  │ [Chấp nhận] [Từ chối]   │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ [Avatar]               │   │
│  │ Trần Văn C             │   │
│  │ 0933333333 | 🟢 Online │   │
│  │                         │   │
│  │ [Chấp nhận] [Từ chối]   │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

### **Color Scheme:**
- Primary (Accept): `#3a86ff` (Blue)
- Secondary (Decline): `#666` (Gray)
- Online Status: `#4caf50` (Green)
- Offline Status: `#999` (Gray)
- Error: `#d32f2f` (Red)

### **States to Handle:**
- ✅ Loading state → Show spinner
- ✅ Error state → Show error message + retry button
- ✅ Empty state → Show "Không có lời mời"
- ✅ Accepting → Disable buttons, show loader
- ✅ Success → Remove from list
- ✅ Network error → Show toast/alert

---

## Testing Checklist

### **Unit Tests:**
- [ ] `loadReceivedRequests()` returns array of requests
- [ ] `acceptRequest(id)` sends PATCH with correct payload
- [ ] `declineRequest(id)` sends PATCH with correct payload
- [ ] Error handling works correctly
- [ ] Empty array handling works

### **Integration Tests:**
- [ ] Load friend requests on mount
- [ ] Display requests in list
- [ ] Accept request updates UI
- [ ] Decline request updates UI
- [ ] Refresh loads new data
- [ ] Error displays correctly
- [ ] Retry after error works

### **Manual Tests:**
- [ ] **Test 1: Load Requests**
  - Open app
  - Navigate to Friend Requests
  - ✅ Should see list of pending requests
  - ✅ Each request shows avatar, name, phone, status

- [ ] **Test 2: Accept Request**
  - Click "Chấp nhận" button
  - ✅ Button shows loading state
  - ✅ Request disappears from list
  - ✅ Success toast appears
  - ✅ User/sender gets notification

- [ ] **Test 3: Decline Request**
  - Click "Từ chối" button
  - ✅ Confirmation dialog appears
  - ✅ Button shows loading state
  - ✅ Request disappears from list
  - ✅ Info toast appears

- [ ] **Test 4: Network Error**
  - Turn off network
  - Try to accept request
  - ✅ Error message displays
  - ✅ "Thử lại" button is available
  - ✅ Restore network + retry works

- [ ] **Test 5: Refresh**
  - Pull to refresh
  - ✅ Loading spinner shows
  - ✅ List reloads
  - ✅ New requests appear (if any)

---

## Error Handling Guide

### **Possible Errors:**

```typescript
const errorMap: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ',
  401: 'Chưa đăng nhập hoặc token hết hạn',
  404: 'Lời mời không tồn tại (có thể đã bị xóa)',
  422: 'Dữ liệu không hợp lệ',
  500: 'Lỗi server, vui lòng thử lại',
};
```

### **Error Handling Template:**

```typescript
catch (error: any) {
  const statusCode = error.response?.status || 500;
  const errorMessage = errorMap[statusCode] || error.message;
  
  console.error(`[Error ${statusCode}]`, error);
  
  // Show user-friendly message
  Toast.show({
    type: 'error',
    text1: 'Lỗi',
    text2: errorMessage,
  });

  // Handle special cases
  if (statusCode === 401) {
    // Redirect to login
  } else if (statusCode === 404) {
    // Remove request from list
  }
}
```

---

## Real-time Updates (Socket)

**Recommended:** Listen for socket events:

```typescript
// When component mounts
useEffect(() => {
  const socket = getSocketConnection();

  // When someone accepts your request
  socket.on('friend-request:accepted', (data) => {
    console.log('Friend request accepted:', data);
    // Update friends list
  });

  // When receiving a new request
  socket.on('friend-request:received', (data) => {
    console.log('New friend request:', data);
    // Refresh requests list
    loadReceivedRequests();
  });

  return () => {
    socket.off('friend-request:accepted');
    socket.off('friend-request:received');
  };
}, []);
```

---

## Checklist Implementation

- [ ] Create `friendRequestService.ts`
- [ ] Create `useFriendRequests.ts` hook
- [ ] Create FriendRequestsScreen/Page component
- [ ] Create FriendRequestItem component
- [ ] Handle loading state
- [ ] Handle error state
- [ ] Handle empty state
- [ ] Add refresh functionality
- [ ] Add accept functionality
- [ ] Add decline functionality
- [ ] Add error toast/alert
- [ ] Add success toast/alert
- [ ] Test all flows
- [ ] Handle network errors
- [ ] Add socket event listeners (optional)

---

## Support & Debugging

### **Common Issues:**

**Issue: Requests not loading**
```typescript
// Debug:
console.log('Token:', localStorage.getItem('accessToken'));
console.log('API response:', await apiClient.get('/v1/friend-requests/received'));
```

**Issue: Accept button not working**
```typescript
// Check:
- Is requestId valid?
- Is API call being made?
- Check Network tab for response
- Check browser console for errors
```

**Issue: List not updating after action**
```typescript
// Solution:
// Make sure to update state after successful API call:
setRequests(requests.filter(r => r._id !== requestId));
```

---

## API Docs Reference

- **Swagger:** http://192.168.1.6:3000/api-docs
- **Socket Events:** docs/socket-events.md
- **Friend Requests:** docs/swagger/paths/friend-requests.yaml

---

**Version:** 1.0  
**Last Updated:** April 11, 2026  
**Status:** ✅ Ready for Implementation
