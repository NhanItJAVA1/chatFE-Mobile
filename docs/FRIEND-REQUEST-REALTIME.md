# Nhận Lời Mời Kết Bạn Real-time (Socket.IO)

## 🔄 Flow

```
User A → POST /friend-requests/:receiverId → Backend
                                              ↓
                                    Backend xử lý
                                              ↓
                                  Socket.IO emit
                                    friend_request:received
                                              ↓
                                    User B nhận
                                    ngay lập tức (real-time)
                                              ↓
                                  User B hiển thị
                                  notification/badge
```

---

## Step 1: Connect Socket.IO (`/friends` namespace)

```typescript
import io from 'socket.io-client';

const token = 'your-jwt-token'; // JWT từ login

const friendSocket = io('http://192.168.1.6:3000/friends', {
  auth: { token },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

friendSocket.on('connect', () => {
  console.log('✅ Friends socket connected:', friendSocket.id);
});

friendSocket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  // Nếu 401 → token hết hạn → refresh token
});

export default friendSocket;
```

---

## Step 2: Lắng nghe sự kiện `friend_request:received`

```typescript
useEffect(() => {
  friendSocket.on('friend_request:received', (notification) => {
    console.log('📬 New friend request:', notification);
    
    // notification structure:
    // {
    //   type: 'FRIEND_REQUEST_RECEIVED',
    //   data: {
    //     requestId: '550e8400-e29b-41d4-a716-446655440000',
    //     fromUserId: 'friend-user-id',
    //     toUserId: 'your-user-id'
    //   },
    //   timestamp: '2026-04-12T10:30:00Z'
    // }

    // Update state
    setReceivedRequests(prev => [...prev, {
      id: notification.data.requestId,
      fromUserId: notification.data.fromUserId,
      status: 'pending',
      receivedAt: notification.timestamp
    }]);

    // Show notification/toast
    showNotification('Bạn nhận được lời mời kết bạn!');
    
    // Update badge count
    setUnreadCount(prev => prev + 1);
  });

  return () => {
    friendSocket.off('friend_request:received');
  };
}, []);
```

---

## Step 3: Hiển thị Notification cho User

### Option 1: Toast Notification
```typescript
const showNotification = (message: string) => {
  Toast.show({
    type: 'success',
    text1: 'Lời mời kết bạn',
    text2: message,
    duration: 3000,
  });
};

// Usage
friendSocket.on('friend_request:received', (notification) => {
  showNotification(`${notification.data.fromUserId} gửi lời mời kết bạn`);
});
```

### Option 2: Badge on Friend Icon
```typescript
const [unreadRequestCount, setUnreadRequestCount] = useState(0);

useEffect(() => {
  friendSocket.on('friend_request:received', (notification) => {
    setUnreadRequestCount(prev => prev + 1);
  });
}, []);

// In your navigation/header
<View>
  <Icon name="users" />
  {unreadRequestCount > 0 && (
    <Badge count={unreadRequestCount} />
  )}
</View>
```

### Option 3: In-app List Update
```typescript
const [receivedRequests, setReceivedRequests] = useState([]);

useEffect(() => {
  friendSocket.on('friend_request:received', (notification) => {
    setReceivedRequests(prev => [...prev, {
      id: notification.data.requestId,
      senderName: notification.data.fromUserId,
      senderAvatar: '...', // Need to fetch user info
      time: notification.timestamp,
    }]);
  });
}, []);

// Render nó ở FriendRequestsScreen
<FlatList
  data={receivedRequests}
  renderItem={({ item }) => (
    <FriendRequestCard
      id={item.id}
      name={item.senderName}
      avatar={item.senderAvatar}
      time={item.time}
      onAccept={() => handleAccept(item.id)}
      onReject={() => handleReject(item.id)}
    />
  )}
/>
```

---

## Complete Example - React Hook

```typescript
import { useEffect, useState } from 'react';
import friendSocket from '../services/friendSocket';

interface FriendRequest {
  id: string;
  fromUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  receivedAt: string;
}

const useFriendRequests = () => {
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Listen for new requests
    friendSocket.on('friend_request:received', (notification) => {
      console.log('📬 Friend request received:', notification);

      const newRequest: FriendRequest = {
        id: notification.data.requestId,
        fromUserId: notification.data.fromUserId,
        status: 'pending',
        receivedAt: notification.timestamp,
      };

      setReceivedRequests(prev => [newRequest, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Optional: Show toast
      notifyUser('New friend request from ' + notification.data.fromUserId);
    });

    // Listen for rejected (by sender)
    friendSocket.on('friend_request:canceled', (notification) => {
      setReceivedRequests(prev => 
        prev.filter(req => req.id !== notification.data.requestId)
      );
    });

    // Cleanup
    return () => {
      friendSocket.off('friend_request:received');
      friendSocket.off('friend_request:canceled');
    };
  }, []);

  const acceptRequest = async (requestId: string, token: string) => {
    try {
      const response = await fetch(
        `http://192.168.1.6:3000/v1/friend-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'accepted' }),
        }
      );

      if (response.ok) {
        setReceivedRequests(prev => 
          prev.filter(req => req.id !== requestId)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        notifyUser('Bạn đã chấp nhận lời mời');
      }
    } catch (error) {
      console.error('Accept failed:', error);
    }
  };

  const rejectRequest = async (requestId: string, token: string) => {
    try {
      const response = await fetch(
        `http://192.168.1.6:3000/v1/friend-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'rejected' }),
        }
      );

      if (response.ok) {
        setReceivedRequests(prev => 
          prev.filter(req => req.id !== requestId)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Reject failed:', error);
    }
  };

  return {
    receivedRequests,
    unreadCount,
    acceptRequest,
    rejectRequest,
  };
};

export default useFriendRequests;
```

---

## Complete Example - React Component

```typescript
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import useFriendRequests from '../hooks/useFriendRequests';

interface FriendRequestCardProps {
  id: string;
  senderName: string;
  senderAvatar: string;
  onAccept: () => void;
  onReject: () => void;
  isLoading?: boolean;
}

const FriendRequestCard: React.FC<FriendRequestCardProps> = ({
  id,
  senderName,
  senderAvatar,
  onAccept,
  onReject,
  isLoading,
}) => {
  return (
    <View style={styles.card}>
      <Image source={{ uri: senderAvatar }} style={styles.avatar} />
      
      <View style={styles.info}>
        <Text style={styles.name}>{senderName}</Text>
        <Text style={styles.subtitle}>Gửi lời mời kết bạn</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.acceptBtn} 
          onPress={onAccept}
          disabled={isLoading}
        >
          <Text style={styles.btnText}>Chấp nhận</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.rejectBtn}
          onPress={onReject}
          disabled={isLoading}
        >
          <Text style={styles.rejectBtnText}>Từ chối</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const FriendRequestsScreen: React.FC<{ token: string }> = ({ token }) => {
  const { receivedRequests, unreadCount, acceptRequest, rejectRequest } = 
    useFriendRequests();
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    setLoadingId(requestId);
    await acceptRequest(requestId, token);
    setLoadingId(null);
  };

  const handleReject = async (requestId: string) => {
    setLoadingId(requestId);
    await rejectRequest(requestId, token);
    setLoadingId(null);
  };

  return (
    <View style={styles.container}>
      {/* Header with badge */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Lời mời kết bạn ({receivedRequests.length})
        </Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* List of requests */}
      {receivedRequests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Không có lời mời nào</Text>
        </View>
      ) : (
        <FlatList
          data={receivedRequests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <FriendRequestCard
              id={item.id}
              senderName={item.fromUserId} // Should fetch real name + avatar
              senderAvatar="https://via.placeholder.com/50"
              onAccept={() => handleAccept(item.id)}
              onReject={() => handleReject(item.id)}
              isLoading={loadingId === item.id}
            />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  badge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 50,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  rejectBtn: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  rejectBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 13,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

export default FriendRequestsScreen;
```

---

## Socket Events Có Liên Quan

| Event | Khi nào | Payload |
|-------|---------|---------|
| `friend_request:received` | Bạn nhận lời mời | `{ type, data: { requestId, fromUserId }, timestamp }` |
| `friend_request:canceled` | Người khác hủy lời mời | `{ type, data: { requestId, canceledBy }, timestamp }` |
| `friend_request:accepted` | Lời mời của bạn được chấp nhận | `{ type, data: { requestId, acceptedBy }, timestamp }` |
| `friend_request:rejected` | Lời mời của bạn bị từ chối | `{ type, data: { requestId, rejectedBy }, timestamp }` |

---

## Key Points

✅ **Phải làm:**
- Kết nối Socket.IO khi app load
- Lắng nghe `friend_request:received` event
- Cập nhật UI ngay khi nhận được
- Cleanup event listeners
- Handle disconnection/reconnection

❌ **Không nên:**
- Ignore socket errors
- Spam API calls
- Forget to cleanup listeners
- Keep old requests in state forever
- Send auth token lại lần nữa sau khi connected

---

## Testing

### Test Real-time (2 Browser Tabs)
1. Mở browser 1 ở localhost:3000 → login User A
2. Mở browser 2 ở localhost:3000 → login User B
3. User A gửi lời mời cho User B
4. **User B sẽ nhận thông báo ngay lập tức** → Không cần refresh ✅

### Debug
```typescript
friendSocket.on('friend_request:received', (notification) => {
  console.log('📬 Full notification:', notification);
  console.log('Request ID:', notification.data.requestId);
  console.log('From User:', notification.data.fromUserId);
  console.log('Timestamp:', notification.timestamp);
});
```
