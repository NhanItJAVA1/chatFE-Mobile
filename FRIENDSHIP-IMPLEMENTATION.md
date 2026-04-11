# 👥 Friendship Feature - Mobile Implementation Guide

**Status:** ✅ IMPLEMENTED  
**Last Updated:** April 11, 2026

---

## 📋 What's Been Implemented

### 1. **Service Layer** (`friendService.ts`)

Complete API integration for all friendship operations:

```typescript
// User search
await searchUsers(query: string) → User[]
await searchUserByPhone(phone: string) → User[]

// Friend requests
await sendFriendRequest(userId: string) → FriendRequest
await getReceivedFriendRequests() → FriendRequest[]
await getSentFriendRequests() → FriendRequest[]
await acceptFriendRequest(requestId: string) → FriendRequest
await rejectFriendRequest(requestId: string) → FriendRequest
await cancelFriendRequest(requestId: string) → boolean

// Friends management
await getFriends() → Friend[]
await checkFriendshipStatus(userId: string) → FriendshipStatus
await getMutualFriends(userId: string) → User[]
await removeFriend(friendId: string) → boolean
```

### 2. **Types** (`src/types/message.ts`)

TypeScript definitions for friendship data:

```typescript
type Friend = {
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
};

type FriendRequest = {
    _id: string;
    senderId?: string;
    receiverId?: string;
    senderInfo?: UserInfo;
    receiverInfo?: UserInfo;
    status: "PENDING" | "ACCEPTED" | "DECLINED";
    createdAt: string;
};

type FriendshipStatus = {
    isFriend: boolean;
    status: "ACCEPTED" | "PENDING" | "DECLINED" | "NONE";
};
```

### 3. **Hook** (`useFriendship.ts`)

Complete state management hook with built-in caching:

```typescript
const { state, actions } = useFriendship({
    autoLoad: true  // Auto-load friends and requests on mount
});

// State
state.friends              // Friend[]
state.friendsLoading      // boolean
state.friendsError        // string | null
state.receivedRequests    // FriendRequest[]
state.sentRequests        // FriendRequest[]
state.searchResults       // User[]
state.mutualFriends       // User[]

// Actions
actions.loadFriends()
actions.sendRequest(userId)
actions.acceptRequest(requestId)
actions.rejectRequest(requestId)
actions.unfriend(friendId)
actions.searchUsersQuery(query)
actions.checkStatus(userId)
actions.loadMutualFriends(userId)
```

### 4. **Screens**

#### **AddFriendScreen** (`src/mobile/src/screens/AddFriendScreen.tsx`)

Search for users and send friend requests:

**Features:**
- Search by phone or name
- Real-time user results
- Send friend request in one tap
- Check friendship status (already friends/pending/none)
- Show user online status
- Display user bio

**Usage:**
```tsx
import { AddFriendScreen } from "./screens/AddFriendScreen";

// Add to navigation
<Stack.Screen name="AddFriend" component={AddFriendScreen} />
```

#### **FriendRequestsScreen** (`src/mobile/src/screens/FriendRequestsScreen.tsx`)

View and manage received friend requests:

**Features:**
- List all received requests
- Request count badge
- Accept or reject with one tap
- Show sender info and status
- Show request timestamp

**Usage:**
```tsx
import { FriendRequestsScreen } from "./screens/FriendRequestsScreen";

// Add to navigation
<Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
```

---

## 🚀 Quick Start

### Step 1: Import the Hook

```typescript
import { useFriendship } from "@/shared/hooks";
```

### Step 2: Initialize the Hook

```typescript
const { state, actions } = useFriendship();
```

### Step 3: Use in Your Component

```typescript
// Search users
const handleSearch = async (query: string) => {
    await actions.searchUsersQuery(query);
    console.log(state.searchResults);  // User[]
};

// Send friend request
const handleSendRequest = async (userId: string) => {
    try {
        await actions.sendRequest(userId);
        console.log("Request sent!");
    } catch (error) {
        console.error("Failed:", error.message);
    }
};

// Accept request
const handleAccept = async (requestId: string) => {
    await actions.acceptRequest(requestId);
};

// View friends
console.log(state.friends);  // Friend[]

// Reject request
const handleReject = async (requestId: string) => {
    await actions.rejectRequest(requestId);
};

// Unfriend
const handleUnfriend = async (friendId: string) => {
    await actions.unfriend(friendId);
};
```

---

## 📱 Screen Integration

### AddFriendScreen Example

```typescript
import { AddFriendScreen } from "@/mobile/src/screens/AddFriendScreen";

export const App = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator>
                <Stack.Screen 
                    name="AddFriend" 
                    component={AddFriendScreen}
                    options={{ title: "Thêm Bạn" }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};
```

### FriendRequestsScreen Example

```typescript
import { FriendRequestsScreen } from "@/mobile/src/screens/FriendRequestsScreen";

export const App = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator>
                <Stack.Screen 
                    name="Requests" 
                    component={FriendRequestsScreen}
                    options={{ title: "Lời Mời Kết Bạn" }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};
```

---

## 🔄 Data Flow

### Send Friend Request Flow

```
User Input
    ↓
SearchUsers()
    ↓
Display Results in UI
    ↓
sendRequest(userId)
    ↓
API: POST /v1/friend-requests/<userId>
    ↓
Update sentRequests state
    ↓
Update UI (button changes to "Pending")
```

### Accept Request Flow

```
FriendRequest shown in UI
    ↓
acceptRequest(requestId)
    ↓
API: PATCH /v1/friend-requests/<requestId> { status: ACCEPTED }
    ↓
Remove from receivedRequests
    ↓
Add to friends via loadFriends()
    ↓
Update UI
```

### Unfriend Flow

```
Friend shown in UI
    ↓
unfriend(friendId)
    ↓
API: DELETE /v1/friendships/<friendId>
    ↓
Remove from friends list
    ↓
Update UI
```

---

## 🎨 API Endpoints Reference

All endpoints require `Authorization: Bearer <TOKEN>` header.

| Method | Endpoint | Function |
|--------|----------|----------|
| GET | `/v1/users/search?q=<query>` | `searchUsers()` |
| POST | `/v1/friend-requests/<userId>` | `sendFriendRequest()` |
| GET | `/v1/friend-requests/received` | `getReceivedFriendRequests()` |
| GET | `/v1/friend-requests/sent` | `getSentFriendRequests()` |
| PATCH | `/v1/friend-requests/<id>` | `acceptFriendRequest()`, `rejectFriendRequest()` |
| DELETE | `/v1/friend-requests/<id>` | `cancelFriendRequest()` |
| GET | `/v1/friendships` | `getFriends()` |
| GET | `/v1/friendships/<id>/check` | `checkFriendshipStatus()` |
| GET | `/v1/users/<id>/mutual-friends` | `getMutualFriends()` |
| DELETE | `/v1/friendships/<id>` | `removeFriend()` |

---

## 🔧 Advanced Usage

### Custom Component with Hook

```typescript
import { useFriendship } from "@/shared/hooks";
import { View, Text, Button } from "react-native";

const MyCustomFriendComponent = ({ userId }: { userId: string }) => {
    const { state, actions } = useFriendship({ autoLoad: false });

    const handleAddFriend = async () => {
        try {
            await actions.sendRequest(userId);
            Alert.alert("✓ Sent", "Friend request sent!");
        } catch (error: any) {
            Alert.alert("✗ Error", error.message);
        }
    };

    return (
        <View>
            <Button title="Add Friend" onPress={handleAddFriend} />
            {state.sentLoading && <Text>Sending...</Text>}
            {state.sentError && <Text>{state.sentError}</Text>}
        </View>
    );
};
```

### Polling Friends List

```typescript
const { state, actions } = useFriendship();

useEffect(() => {
    const interval = setInterval(() => {
        actions.loadFriends();
    }, 30000);  // Refresh every 30 seconds

    return () => clearInterval(interval);
}, []);
```

### Check Multiple Users Status

```typescript
const { actions } = useFriendship();

const checkMultipleUsers = async (userIds: string[]) => {
    const statuses = await Promise.all(
        userIds.map(id => actions.checkStatus(id))
    );
    return statuses;
};
```

---

## 🧪 Testing Guide

### Test Case 1: Send Friend Request

```typescript
// 1. Open AddFriendScreen
// 2. Search for user (e.g., "0912345678")
// 3. Tap "Gửi lời mời" button
// 4. Verify: Toast "Lời mời đã được gửi"
// 5. Verify: Button changes to "Đã gửi lời mời"
```

### Test Case 2: Accept Friend Request

```typescript
// 1. Open FriendRequestsScreen
// 2. Tap "Chấp nhận" on a request
// 3. Verify: Request removed from list
// 4. Verify: Toast "Đã chấp nhận..."
// 5. Verify: User appears in friends list
```

### Test Case 3: Reject Friend Request

```typescript
// 1. Open FriendRequestsScreen
// 2. Tap "Từ chối" on a request
// 3. Confirm dialog
// 4. Verify: Request removed from list
```

---

## 🐛 Error Handling

The hook and services automatically handle errors:

| Error | Handling |
|-------|----------|
| 400 | Invalid request parameters |
| 401 | Token expired or missing (will throw) |
| 404 | User not found |
| 409 | Already friends or request already sent |
| 500 | Server error |

All errors propagate with meaningful messages. Wrap actions in try-catch:

```typescript
try {
    await actions.sendRequest(userId);
} catch (error: any) {
    console.error(error.message);  // Human-readable error
    Alert.alert("Error", error.message);
}
```

---

## 📝 Implementation Checklist

- ✅ Service layer (`friendService.ts`) - All functions
- ✅ Types defined (`message.ts`) - Friend, FriendRequest, FriendshipStatus
- ✅ Hook exported (`useFriendship.ts`)
- ✅ AddFriendScreen component
- ✅ FriendRequestsScreen component
- ⏳ Add to navigation/routing (depends on your app structure)
- ⏳ Add screens to tab navigation
- ⏳ Test with real backend
- ⏳ Real-time updates via Socket.io (optional)

---

## 🔗 Related Files

- `/src/shared/services/friendService.ts` - API integration
- `/src/shared/hooks/useFriendship.ts` - State management
- `/src/types/message.ts` - Type definitions
- `/src/mobile/src/screens/AddFriendScreen.tsx` - Search & add friends
- `/src/mobile/src/screens/FriendRequestsScreen.tsx` - Manage requests
- `/docs/FRIENDSHIP-GUIDE.md` - Original specification

---

## 💡 Tips

1. **Always wrap actions in try-catch** to handle errors gracefully
2. **Use `autoLoad: false`** if you don't want automatic loading
3. **Cache friendship status** to reduce API calls
4. **Debounce search** if implementing real-time search
5. **Handle 409 conflicts** for duplicate requests gracefully

---

## 🎯 Next Steps

1. Add screens to app navigation
2. Test with real backend API
3. Implement Socket.io for real-time updates
4. Add friend suggestions feature
5. Add "Mutual Friends" view
6. Add offline support with local caching
