# 🔧 FE Fix Guide: Friend Requests API Response Transform

**Target:** Frontend Team  
**Issue:** API response structure doesn't match expected format  
**Solution:** Transform API response in service layer  
**Version:** 1.0

---

## 📋 Mục Lục

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Service Layer Implementation](#service-layer-implementation)
4. [Custom Hook Implementation](#custom-hook-implementation)
5. [Component Implementation](#component-implementation)
6. [Key Changes](#key-changes)
7. [Implementation Steps](#implementation-steps)
8. [Testing](#testing)

---

## Problem Statement

### **Actual API Response:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "019d7d3f-c61b-766a-80d3-1ea33490ca5d",
        "senderId": "019d7d26-0557-766a-80d2-d2ef65c9faa2",
        "status": "pending",
        "createdAt": "2026-04-11T15:53:44.731Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1,
    "hasMore": false
  }
}
```

### **Expected Format (Documentation):**
```json
{
  "data": [
    {
      "_id": "request-id-123",
      "senderId": "user-456",
      "senderInfo": {
        "displayName": "Nguyễn Văn A",
        "phoneNumber": "0912345678",
        "avatar": "https://...",
        "status": "online"
      },
      "status": "PENDING",
      "createdAt": "2026-04-11T09:30:00Z"
    }
  ]
}
```

### **Issues:**
1. ❌ Response wrapped in `data.items` instead of direct array
2. ❌ Field name `id` instead of `_id`
3. ❌ Status lowercase `pending` instead of `PENDING`
4. ❌ Missing `senderInfo` (need to fetch user separately)
5. ❌ Pagination fields mixed with actual data

---

## Solution Overview

**Transform API response to match expected format in service layer:**

```
API Response
    ↓
Transform in FriendRequestService
    ↓
  - Extract items from data.items
  - Transform id → _id
  - Transform pending → PENDING
  - Fetch sender user info from /v1/users/{senderId}
  - Build senderInfo object
    ↓
Return normalized data to Hook
    ↓
Hook passes clean data to Component
    ↓
Component renders with expected format
```

---

## Service Layer Implementation

### **File: `src/services/friendRequestService.ts`**

```typescript
import { apiClient } from './apiClient';

export interface SenderInfo {
  displayName: string;
  phoneNumber: string;
  avatar: string;
  status: 'online' | 'offline';
}

export interface FriendRequest {
  _id: string;
  senderId: string;
  senderInfo: SenderInfo;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ReceivedRequestsResponse {
  items: FriendRequest[];
  pagination: PaginationInfo;
}

export class FriendRequestService {
  /**
   * Lấy danh sách lời mời nhận được
   * Transforms API response to match expected format
   */
  async getReceivedRequests(page: number = 1, limit: number = 20): Promise<ReceivedRequestsResponse> {
    try {
      console.log('[friendRequestService] Getting received requests...');
      
      // Call API
      const response = await apiClient.get(
        `/v1/friend-requests/received?page=${page}&limit=${limit}`
      );

      // API returns: { data: { items: [...], limit, page, total, hasMore } }
      const { items = [], limit: resLimit, page: resPage, total, hasMore } = response.data || {};

      console.log('[friendRequestService] Raw API response:', { items, resLimit, resPage, total, hasMore });

      // Transform each item
      const transformedItems = await Promise.all(
        items.map(async (item: any) => {
          try {
            // Fetch sender user info
            const sender = await this.getUserInfo(item.senderId);

            return {
              _id: item.id,  // Transform: id → _id
              senderId: item.senderId,
              senderInfo: {
                displayName: sender.displayName || 'Unknown User',
                phoneNumber: sender.phoneNumber || '',
                avatar: sender.avatar || '',
                status: (sender.status || 'offline') as 'online' | 'offline',
              },
              status: item.status.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'DECLINED',
              createdAt: item.createdAt,
            } as FriendRequest;
          } catch (error) {
            console.error(
              `[friendRequestService] Error fetching sender info for ${item.senderId}:`,
              error
            );
            
            // Fallback nếu fetch user info fail
            return {
              _id: item.id,
              senderId: item.senderId,
              senderInfo: {
                displayName: 'Unknown User',
                phoneNumber: item.senderId,
                avatar: '',
                status: 'offline',
              },
              status: item.status.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'DECLINED',
              createdAt: item.createdAt,
            } as FriendRequest;
          }
        })
      );

      console.log('[friendRequestService] Transformed items:', transformedItems);

      return {
        items: transformedItems,
        pagination: {
          page: resPage || 1,
          limit: resLimit || 20,
          total: total || 0,
          hasMore: hasMore || false,
        },
      };
    } catch (error) {
      console.error('[friendRequestService] Get received requests error:', error);
      throw error;
    }
  }

  /**
   * Get user info để lấy senderInfo
   * Calls: GET /v1/users/{userId}
   */
  private async getUserInfo(userId: string) {
    try {
      const response = await apiClient.get(`/v1/users/${userId}`);
      return response;
    } catch (error) {
      console.error(`[friendRequestService] Error fetching user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Chấp nhận lời mời kết bạn
   * Calls: PATCH /v1/friend-requests/{requestId} with status: ACCEPTED
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
      console.log('[friendRequestService] Request accepted successfully:', response);
      return response;
    } catch (error) {
      console.error('[friendRequestService] Accept error:', error);
      throw error;
    }
  }

  /**
   * Từ chối lời mời kết bạn
   * Calls: PATCH /v1/friend-requests/{requestId} with status: DECLINED
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
      console.log('[friendRequestService] Request declined successfully:', response);
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

## Custom Hook Implementation

### **File: `src/hooks/useFriendRequests.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { friendRequestService, FriendRequest } from '../services/friendRequestService';

export function useFriendRequests() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  /**
   * Load received requests
   */
  const loadReceivedRequests = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await friendRequestService.getReceivedRequests(pageNum, 20);
      
      setRequests(result.items);
      setPage(result.pagination.page);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
      
      console.log('[useFriendRequests] Loaded requests:', result.items.length);
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
        setTotal(Math.max(0, total - 1));
        
        console.log('[useFriendRequests] Request accepted and removed from list');
        return true;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to accept request';
        setError(errorMessage);
        console.error('[useFriendRequests] Accept error:', err);
        return false;
      }
    },
    [requests, total]
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
        setTotal(Math.max(0, total - 1));
        
        console.log('[useFriendRequests] Request declined and removed from list');
        return true;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to decline request';
        setError(errorMessage);
        console.error('[useFriendRequests] Decline error:', err);
        return false;
      }
    },
    [requests, total]
  );

  /**
   * Refresh all requests
   */
  const refresh = useCallback(async () => {
    await loadReceivedRequests(1);
  }, [loadReceivedRequests]);

  /**
   * Load next page
   */
  const loadMore = useCallback(async () => {
    if (hasMore && !loading) {
      await loadReceivedRequests(page + 1);
    }
  }, [hasMore, page, loading, loadReceivedRequests]);

  /**
   * Load on mount
   */
  useEffect(() => {
    loadReceivedRequests(1);
  }, [loadReceivedRequests]);

  return {
    requests,
    loading,
    error,
    acceptRequest,
    declineRequest,
    refresh,
    loadMore,
    loadReceivedRequests,
    pagination: {
      page,
      hasMore,
      total,
    },
    pendingCount: requests.length,
  };
}
```

---

## Component Implementation

### **File: `src/screens/FriendRequestsScreen.tsx` (React Native)**

```typescript
import React from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFriendRequests } from '../hooks/useFriendRequests';

export function FriendRequestsScreen() {
  const {
    requests,
    loading,
    error,
    acceptRequest,
    declineRequest,
    refresh,
    pagination,
  } = useFriendRequests();

  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);
  const [decliningId, setDecliningId] = React.useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    setAcceptingId(requestId);
    const success = await acceptRequest(requestId);
    setAcceptingId(null);
    
    if (success) {
      Alert.alert('Thành công', '✅ Lời mời đã được chấp nhận!');
    } else {
      Alert.alert('Lỗi', '❌ Vui lòng thử lại');
    }
  };

  const handleDecline = async (requestId: string) => {
    Alert.alert(
      'Xác nhận',
      'Bạn chắc chắn muốn từ chối?',
      [
        { text: 'Huỷ', onPress: () => {} },
        {
          text: 'Từ chối',
          onPress: async () => {
            setDecliningId(requestId);
            const success = await declineRequest(requestId);
            setDecliningId(null);
            
            if (success) {
              Alert.alert('Thành công', '✅ Lời mời đã được từ chối!');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Loading state
  if (loading && requests.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3a86ff" />
        <Text style={{ marginTop: 10, color: '#666' }}>Đang tải...</Text>
      </View>
    );
  }

  // Error state
  if (error && requests.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ color: '#d32f2f', marginBottom: 10, textAlign: 'center' }}>
          ❌ {error}
        </Text>
        <TouchableOpacity
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            backgroundColor: '#3a86ff',
            borderRadius: 8,
          }}
          onPress={refresh}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Empty state
  if (requests.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#999', fontSize: 16 }}>
          📭 Không có lời mời kết bạn
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
          onAccept={() => handleAccept(item._id)}
          onDecline={() => handleDecline(item._id)}
          acceptingId={acceptingId}
          decliningId={decliningId}
        />
      )}
      contentContainerStyle={{ paddingVertical: 10 }}
      scrollEnabled={requests.length > 3}
    />
  );
}

/**
 * Friend Request Item Component
 */
interface FriendRequestItemProps {
  request: any;
  onAccept: () => void;
  onDecline: () => void;
  acceptingId: string | null;
  decliningId: string | null;
}

function FriendRequestItem({
  request,
  onAccept,
  onDecline,
  acceptingId,
  decliningId,
}: FriendRequestItemProps) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 10,
        marginVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
      }}
    >
      {/* Avatar */}
      <Image
        source={{
          uri: request.senderInfo.avatar || 'https://via.placeholder.com/50',
        }}
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          marginRight: 12,
          backgroundColor: '#e8f0fe',
        }}
      />

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>
          {request.senderInfo.displayName}
        </Text>
        <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {request.senderInfo.phoneNumber}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            marginTop: 4,
            alignItems: 'center',
          }}
        >
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

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Accept Button */}
        <TouchableOpacity
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor:
              acceptingId === request._id ? '#aaaaaa' : '#3a86ff',
            borderRadius: 6,
            minWidth: 50,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={onAccept}
          disabled={acceptingId === request._id || decliningId === request._id}
        >
          {acceptingId === request._id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={{
                color: '#fff',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              Chấp nhận
            </Text>
          )}
        </TouchableOpacity>

        {/* Decline Button */}
        <TouchableOpacity
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor:
              decliningId === request._id ? '#aaaaaa' : '#ddd',
            borderRadius: 6,
            minWidth: 50,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={onDecline}
          disabled={acceptingId === request._id || decliningId === request._id}
        >
          {decliningId === request._id ? (
            <ActivityIndicator size="small" color="#333" />
          ) : (
            <Text
              style={{
                color: '#333',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              Từ chối
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

---

## Key Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Response format** | `data.items[]` | Normalized array in service |
| **ID field** | `item.id` | Transformed to `_id` |
| **Status value** | `"pending"` | Transformed to `"PENDING"` |
| **Sender info** | Missing | Fetched separately + included |
| **Pagination** | Ignored | Captured in pagination object |
| **Component data** | Raw API response | Clean, normalized data |

---

## Implementation Steps

### **Step 1: Create Service Layer**
```bash
# Create file: src/services/friendRequestService.ts
# Copy-paste the service code above
```

### **Step 2: Create Custom Hook**
```bash
# Create file: src/hooks/useFriendRequests.ts
# Copy-paste the hook code above
```

### **Step 3: Update Component**
```bash
# Update file: src/screens/FriendRequestsScreen.tsx
# Replace with the component code above
```

### **Step 4: Test**
```bash
# 1. Clear app cache
# 2. Login with test account
# 3. Navigate to Friend Requests
# 4. Verify list loads correctly
# 5. Test Accept/Decline buttons
```

---

## Testing

### **Manual Test Cases:**

**Test 1: Load Requests**
- [ ] Open app
- [ ] Navigate to Friend Requests
- [ ] Verify requests load without errors
- [ ] Check that senderInfo displays correctly

**Test 2: Accept Request**
- [ ] Click "Chấp nhận" button
- [ ] Verify loading state shows
- [ ] Verify request removed from list
- [ ] Verify success message appears

**Test 3: Decline Request**
- [ ] Click "Từ chối" button
- [ ] Verify confirmation dialog appears
- [ ] Confirm to decline
- [ ] Verify request removed from list
- [ ] Verify info message appears

**Test 4: Error Handling**
- [ ] Turn off network
- [ ] Try to accept request
- [ ] Verify error message displays
- [ ] Verify "Thử lại" button is available
- [ ] Turn on network + retry

**Test 5: Empty State**
- [ ] Clear all friend requests
- [ ] Verify "Không có lời mời" message
- [ ] Verify no errors

---

## Debugging Tips

### **Check Console Logs:**
```
[friendRequestService] Raw API response: {...}
[friendRequestService] Transformed items: [...]
[useFriendRequests] Loaded requests: 5
```

### **Verify Data Structure:**
```typescript
// In component:
console.log('Request data:', request);
console.log('Sender info:', request.senderInfo);
console.log('ID:', request._id);
```

### **Network Tab:**
- Check API response structure
- Verify `/v1/users/{userId}` calls for senderInfo
- Check for any 404 errors

---

## Checklist

- [ ] Create `friendRequestService.ts`
- [ ] Create `useFriendRequests.ts`
- [ ] Update `FriendRequestsScreen.tsx`
- [ ] Test load requests
- [ ] Test accept request
- [ ] Test decline request
- [ ] Test error handling
- [ ] Test empty state
- [ ] Verify console logs
- [ ] Remove debug logs before production

---

## Support

**If issues occur:**

1. Check console logs for transformation errors
2. Verify API response in Network tab
3. Check that `/v1/users/{userId}` API exists
4. Verify token is valid (friend requests need auth)
5. Check that senderInfo fetch doesn't fail

**Contact Backend team if:**
- API response structure changes
- `/v1/users/{userId}` returns different fields
- Pagination structure changes

---

**Version:** 1.0  
**Date:** April 11, 2026  
**Status:** ✅ Ready for Implementation
