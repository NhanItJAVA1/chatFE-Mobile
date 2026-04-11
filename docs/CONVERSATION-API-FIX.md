# 🔧 POST /v1/conversations/private - 422 Fix

## Problem
```
422 Unprocessable Entity on POST /v1/conversations/private
```

**Root Cause:** The endpoint expects `targetUserId` in the request body, but wasn't receiving it.

## Backend Requirements

The endpoint validates the request with `getOrCreatePrivateConversationDTOSchema`:

```typescript
export const getOrCreatePrivateConversationDTOSchema = z.object({
  currentUserId: z.string().uuid("Invalid current user ID"),
  targetUserId: z.string().uuid("Invalid target user ID"),
});
```

- **currentUserId**: Extracted from JWT token automatically (don't send in body)
- **targetUserId**: REQUIRED in request body (the friend user's ID)

## ✅ Correct Implementation

### ConversationService (Fixed)

```typescript
export class ConversationService {
  private static readonly API_BASE = 'http://192.168.1.6:3000';

  static async getOrCreatePrivateConversation(
    targetUserId: string,
    token: string
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.API_BASE}/v1/conversations/private`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          // ✅ IMPORTANT: Send targetUserId in body
          body: JSON.stringify({
            targetUserId,  // This is the friend's user ID
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API error: ${response.status} ${response.statusText} - ${
            errorData.error || errorData.details?.map((e: any) => e.message).join(', ')
          }`
        );
      }

      const data = await response.json();
      return data.data; // Response structure: { data: Conversation }
    } catch (error) {
      console.error('[ConversationService] Error:', error);
      throw error;
    }
  }

  static async getConversations(
    token: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.API_BASE}/v1/conversations?page=${page}&limit=${limit}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[ConversationService] Error:', error);
      throw error;
    }
  }

  static async getConversationDetail(
    conversationId: string,
    token: string
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.API_BASE}/v1/conversations/${conversationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[ConversationService] Error:', error);
      throw error;
    }
  }

  static async loadMessages(
    conversationId: string,
    token: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.API_BASE}/v1/conversations/${conversationId}/messages?page=${page}&limit=${limit}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[ConversationService] Error:', error);
      throw error;
    }
  }
}
```

## Key Points

✅ **Send only `targetUserId`** - Don't send currentUserId in body
✅ **targetUserId must be a UUID** - Valid format: `"550e8400-e29b-41d4-a716-446655440000"`
✅ **Must have Bearer token** - In Authorization header
✅ **Response structure** - Returns `{ data: Conversation }`, not direct object

## Example Usage

```typescript
// When user clicks to open chat with friend
const friendUserId = "550e8400-e29b-41d4-a716-446655440000"; // Friend's ID
const token = "eyJhbGciOiJIUzI1NiIs..."; // JWT token

try {
  const conversation = await ConversationService.getOrCreatePrivateConversation(
    friendUserId,
    token
  );
  console.log('Conversation created/fetched:', conversation.id);
  // Now proceed to connect Socket.IO and join the conversation room
} catch (error) {
  console.error('Failed to create conversation:', error.message);
}
```

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| 422 Validation error | Missing/wrong `targetUserId` | Send `{ targetUserId: "uuid" }` in body |
| 401 Unauthorized | No Bearer token | Add `Authorization: Bearer <token>` header |
| 400 Bad Request | Invalid UUID format | Ensure targetUserId is properly formatted UUID |
| 404 Not Found | User doesn't exist | Verify the targetUserId exists in database |
| 422 Validation error - Invalid UUID | targetUserId not a valid UUID | Check the user ID format from friendships API |

## Socket.IO Connection After Success

Once conversation is created, proceed with Socket.IO:

```typescript
const conversation = await ConversationService.getOrCreatePrivateConversation(
  friendUserId,
  token
);

// Step 2: Connect Socket.IO (see REALTIME-CHAT-GUIDE.md)
const socket = SocketService.connect(token);

// Step 3: Join the conversation room
socket.emit('joinGroup', {
  conversationId: conversation.id,
});
```
