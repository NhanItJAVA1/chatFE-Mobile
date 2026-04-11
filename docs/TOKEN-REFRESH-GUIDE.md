# 🔐 Hướng Dẫn Implement Auto-Refresh Token - Frontend

**Target:** Frontend Team  
**Problem:** 401 Unauthorized errors do token hết hạn  
**Solution:** Auto-refresh token khi token hết hạn  
**Version:** 1.0

---

## 📋 Mục Lục

1. [Problem Analysis](#problem-analysis)
2. [Solution Overview](#solution-overview)
3. [API Endpoints](#api-endpoints)
4. [Implementation Steps](#implementation-steps)
5. [Code Examples](#code-examples)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Problem Analysis

### **Hiện tượng:**
```
GET /v1/friendships → 401 Unauthorized
```

### **Nguyên nhân:**
- AccessToken hết hạn (mặc định 15 phút)
- FE không có cơ chế refresh token
- Mỗi khi token hết, user phải login lại

### **Hậu quả:**
- ❌ User experience kém
- ❌ Mất session giữa các thao tác
- ❌ Phải login nhiều lần

---

## Solution Overview

**Implement Auto-Refresh Token:**

```
User Action (API Call)
         ↓
   Is AccessToken expired?
    ↙ (No)        ↘ (Yes)
  Call API    Refresh Token (+ Queue requests)
              ↓
         Get New Token
         ↓
    Retry Original Request
         ↓
        Response
```

---

## API Endpoints

### **Login API** (Đã có)
```http
POST /v1/auth/login
Content-Type: application/json

Body:
{
  "phoneNumber": "0912345678",
  "password": "password123"
}

Response (200):
{
  "data": {
    "accessToken": "eyJhbGci...",      // Token hết hạn sau 15 phút
    "refreshToken": "eyJhbGci...",     // Token hết hạn sau 7 ngày
    "user": { ... }
  }
}
```

**⚠️ LƯU Ý:** Lưu **CẢ 2 TOKENS** vào localStorage!

---

### **Refresh Token API** (Backend support)
```http
POST /v1/auth/refresh
Content-Type: application/json

Body:
{
  "refreshToken": "eyJhbGci..."
}

Response (200):
{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}

Error (401):
{
  "message": "Invalid or expired refresh token"
}
```

**⚠️ Nếu 401:** Redirect to login

---

## Implementation Steps

### **Step 1: Tạo API Client (HTTP Client)"**

```typescript
// src/services/apiClient.ts

export class APIClient {
  private baseUrl: string;
  private isRefreshing: boolean = false;
  private refreshQueue: Array<() => void> = [];

  constructor(baseUrl: string = process.env.REACT_APP_API_URL || 'http://192.168.1.6:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Lưu tokens vào localStorage
   */
  public setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  /**
   * Lấy access token
   */
  public getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  /**
   * Lấy refresh token
   */
  public getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  /**
   * Xóa tokens (logout)
   */
  public clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  /**
   * Làm mới access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      
      if (!refreshToken) {
        this.handleUnauthorized();
        return false;
      }

      console.log('[APIClient] Refreshing access token...');

      const response = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const result = await response.json();
        const { accessToken, refreshToken: newRefreshToken } = result.data;
        
        this.setTokens(accessToken, newRefreshToken);
        console.log('[APIClient] Access token refreshed successfully');
        return true;
      } else {
        console.error('[APIClient] Refresh token failed:', response.status);
        this.handleUnauthorized();
        return false;
      }
    } catch (error) {
      console.error('[APIClient] Refresh token error:', error);
      this.handleUnauthorized();
      return false;
    }
  }

  /**
   * Main HTTP request method với auto-retry on 401
   */
  public async request<T = any>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Chuẩn bị headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Thêm auth header
    const accessToken = this.getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Gọi API
    let response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers,
    });

    // Nếu 401 → cố gắng refresh token
    if (response.status === 401) {
      console.log(`[APIClient] Got 401 on ${options.method || 'GET'} ${url}`);

      // Nếu đang refresh → chờ queue
      if (this.isRefreshing) {
        console.log('[APIClient] Token refresh in progress, waiting...');
        return new Promise((resolve, reject) => {
          this.refreshQueue.push(async () => {
            try {
              const result = await this.request<T>(url, options);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        });
      }

      // Bắt đầu refresh
      this.isRefreshing = true;
      console.log('[APIClient] Starting token refresh...');

      const refreshed = await this.refreshAccessToken();

      this.isRefreshing = false;

      // Xử lý pending requests
      const queue = this.refreshQueue;
      this.refreshQueue = [];
      console.log(`[APIClient] Processing ${queue.length} queued requests`);
      queue.forEach((callback) => callback());

      if (refreshed) {
        // Retry với token mới
        console.log('[APIClient] Retrying request with new token...');
        const newAccessToken = this.getAccessToken();
        if (newAccessToken) {
          headers['Authorization'] = `Bearer ${newAccessToken}`;
        }

        response = await fetch(`${this.baseUrl}${url}`, {
          ...options,
          headers,
        });
      } else {
        throw new Error('Token refresh failed. Please login again.');
      }
    }

    // Parse response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || `HTTP ${response.status}`;
      console.error(`[APIClient] Error on ${options.method || 'GET'} ${url}:`, errorMessage);
      throw new Error(errorMessage);
    }

    const data: any = await response.json();
    return data.data || data;
  }

  /**
   * POST request
   */
  public post<T = any>(url: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * GET request
   */
  public get<T = any>(url: string, options?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'GET',
    });
  }

  /**
   * PATCH request
   */
  public patch<T = any>(url: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  public delete<T = any>(url: string, options?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'DELETE',
    });
  }

  /**
   * Handle unauthorized (redirect to login)
   */
  private handleUnauthorized(): void {
    this.clearTokens();
    // Redirect to login page
    console.log('[APIClient] Redirecting to login...');
    window.location.href = '/login';
  }
}

// Export singleton instance
export const apiClient = new APIClient();
```

---

### **Step 2: Cập nhật Login Flow**

```typescript
// src/screens/LoginScreen.tsx (hoặc tương tự)

import { apiClient } from '../services/apiClient';

async function handleLogin(phoneNumber: string, password: string) {
  try {
    const response = await apiClient.post('/v1/auth/login', {
      phoneNumber,
      password,
    });

    // ✅ Lưu 2 tokens
    apiClient.setTokens(response.accessToken, response.refreshToken);

    console.log('Login successful!');
    // Navigate to home
    navigation.navigate('Home');
  } catch (error) {
    console.error('Login failed:', error);
    Alert.alert('Login Error', error.message);
  }
}
```

---

### **Step 3: Cập nhật Friendship Service**

```typescript
// src/services/friendshipService.ts

import { apiClient } from './apiClient';

export class FriendshipService {
  async getFriends() {
    return apiClient.get('/v1/friendships');
  }

  async getReceivedRequests() {
    return apiClient.get('/v1/friend-requests/received');
  }

  async getSentRequests() {
    return apiClient.get('/v1/friend-requests/sent');
  }

  async sendFriendRequest(userId: string) {
    return apiClient.post(`/v1/friend-requests/${userId}`, {});
  }

  async acceptFriendRequest(requestId: string) {
    return apiClient.patch(`/v1/friend-requests/${requestId}`, {
      status: 'ACCEPTED',
    });
  }

  async declineFriendRequest(requestId: string) {
    return apiClient.patch(`/v1/friend-requests/${requestId}`, {
      status: 'DECLINED',
    });
  }

  async unfriend(friendId: string) {
    return apiClient.delete(`/v1/friendships/${friendId}`);
  }

  async checkFriendshipStatus(friendId: string) {
    return apiClient.get(`/v1/friendships/${friendId}/check`);
  }

  async getMutualFriends(userId: string) {
    return apiClient.get(`/v1/users/${userId}/mutual-friends`);
  }

  async getFriendSuggestions(userId: string) {
    return apiClient.get(`/v1/users/${userId}/suggestions`);
  }
}

export const friendshipService = new FriendshipService();
```

---

### **Step 4: Cập nhật Custom Hooks**

```typescript
// src/hooks/useFriendship.ts

import { useEffect, useState } from 'react';
import { friendshipService } from '../services/friendshipService';

export function useFriendship() {
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendshipService.getFriends();
      setFriends(data);
    } catch (err: any) {
      setError(err.message);
      console.error('loadFriends error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReceivedRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendshipService.getReceivedRequests();
      setReceivedRequests(data);
    } catch (err: any) {
      setError(err.message);
      console.error('loadReceivedRequests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSentRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await friendshipService.getSentRequests();
      setSentRequests(data);
    } catch (err: any) {
      setError(err.message);
      console.error('loadSentRequests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (userId: string) => {
    try {
      await friendshipService.sendFriendRequest(userId);
      await loadSentRequests();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const acceptFriendRequest = async (requestId: string) => {
    try {
      await friendshipService.acceptFriendRequest(requestId);
      setReceivedRequests(
        receivedRequests.filter((r: any) => r._id !== requestId)
      );
      await loadFriends();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const declineFriendRequest = async (requestId: string) => {
    try {
      await friendshipService.declineFriendRequest(requestId);
      setReceivedRequests(
        receivedRequests.filter((r: any) => r._id !== requestId)
      );
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const unfriend = async (friendId: string) => {
    try {
      await friendshipService.unfriend(friendId);
      setFriends(friends.filter((f: any) => f.friendId !== friendId));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  useEffect(() => {
    loadFriends();
    loadReceivedRequests();
    loadSentRequests();
  }, []);

  return {
    friends,
    receivedRequests,
    sentRequests,
    loading,
    error,
    loadFriends,
    loadReceivedRequests,
    loadSentRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    unfriend,
  };
}
```

---

## Code Examples

### **Example 1: Login & Set Tokens**

```typescript
import { apiClient } from './services/apiClient';

const handleLogin = async () => {
  try {
    const response = await apiClient.post('/v1/auth/login', {
      phoneNumber: '0912345678',
      password: 'password123',
    });

    // ✅ Lưu tokens
    apiClient.setTokens(
      response.accessToken,
      response.refreshToken
    );

    console.log('✅ Login success!');
    // Navigate to home
  } catch (error) {
    console.error('❌ Login failed:', error.message);
  }
};
```

---

### **Example 2: API Call with Auto-Refresh**

```typescript
import { apiClient } from './services/apiClient';

const handleLoadFriends = async () => {
  try {
    // Gọi API bình thường
    const friends = await apiClient.get('/v1/friendships');

    // Nếu token hết hạn → auto-refresh & retry
    // Nếu refreshToken hết hạn → redirect to login
    
    console.log('✅ Friends loaded:', friends);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};
```

---

### **Example 3: Using useFriendship Hook**

```typescript
import { useFriendship } from './hooks/useFriendship';

function FriendsScreen() {
  const {
    friends,
    receivedRequests,
    loading,
    error,
    loadFriends,
    sendFriendRequest,
    acceptFriendRequest,
    unfriend,
  } = useFriendship();

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View>
      <FlatList
        data={friends}
        renderItem={({ item }) => (
          <View>
            <Text>{item.friendInfo.displayName}</Text>
            <TouchableOpacity onPress={() => unfriend(item.friendId)}>
              <Text>Unfriend</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}
```

---

## Testing

### **Test 1: Login & Token Storage**

```
1. Mở app
2. Login với: 0912345678 / Test123456!
3. Check DevTools → Application → localStorage
4. Kiểm tra:
   - accessToken có trong localStorage? ✓
   - refreshToken có trong localStorage? ✓
```

### **Test 2: Auto-Refresh on 401**

```
1. Login thành công
2. Mở DevTools → Network
3. Gọi GET /v1/friendships
4. Kiểm tra:
   - Request 1: GET /v1/friendships → 401? ✓
   - Request 2: POST /v1/auth/refresh → 200? ✓
   - Request 3: GET /v1/friendships (retry) → 200? ✓
5. Kiểm tra localStorage:
   - accessToken đã update? ✓
   - refreshToken đã update? ✓
```

### **Test 3: Expired Refresh Token**

```
1. Delete refreshToken from localStorage
2. Gọi API bất kỳ
3. Kiểm tra:
   - Auto-redirect to /login? ✓
   - localStorage bị xóa? ✓
```

---

## Troubleshooting

### **Problem: Vẫn bị 401 sau refresh**

**Nguyên nhân:**
- refreshToken không hợp lệ
- Refresh API không hoạt động

**Fix:**
```typescript
// Thêm console.log để debug
const refreshed = await this.refreshAccessToken(); // Check response
console.log('Refresh result:', refreshed);

// Nếu fail → kiểm tra network tab
```

---

### **Problem: Infinite loop retry**

**Nguyên nhân:**
- Retry request lại return 401
- Token refresh loop

**Fix:**
```typescript
// Thêm max retry count
private retryCount = 0;
private MAX_RETRIES = 1;

if (response.status === 401 && this.retryCount < this.MAX_RETRIES) {
  this.retryCount++;
  // retry...
} else {
  this.handleUnauthorized();
}
```

---

### **Problem: localStorage không sync**

**Nguyên nhân:**
- setTokens được gọi từ worker thread
- Concurrent access conflict

**Fix:**
```typescript
// Sử dụng mutex/lock
private tokenLock = false;

public async setTokens(accessToken: string, refreshToken: string) {
  while (this.tokenLock) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  this.tokenLock = true;
  try {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  } finally {
    this.tokenLock = false;
  }
}
```

---

## Checklist

- [ ] Tạo `src/services/apiClient.ts`
- [ ] Export singleton `apiClient`
- [ ] Cập nhật login screen để lưu tokens
- [ ] Cập nhật `friendshipService` dùng `apiClient`
- [ ] Test login & token storage
- [ ] Test API với auto-refresh
- [ ] Test expired refresh token (redirect to login)
- [ ] Add error handling & logging
- [ ] Add retry count limit
- [ ] Test concurrent requests (queue)

---

## Support

Nếu gặp vấn đề:
1. Check console logs (tìm `[APIClient]` prefix)
2. Check Network tab (mấy request được gửi?)
3. Check localStorage (tokens có lưu đúng không?)
4. Báo lại Backend team kèm:
   - Screenshot Network tab
   - Console logs
   - localStorage values

**Swagger API Docs:** http://192.168.1.6:3000/api-docs
