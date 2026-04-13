# 📤 Forward Messages Feature - Frontend Implementation Guide

## Overview

Forward messages cho phép user copy một hoặc nhiều tin nhắn từ cuộc trò chuyện hiện tại đến một hoặc nhiều cuộc trò chuyện khác.

**Status:** ✅ Backend đã support đầy đủ  
**Effort:** ~ 3-4 tiếng code  
**Priority:** Medium (niceto-have)

---

## 1. API Endpoint

### POST /v1/messages/forward

**Authentication:** ✅ Required (Bearer token)

**Request Body:**

```json
{
  "userId": "current-user-uuid",
  "messageIds": ["msg-uuid-1", "msg-uuid-2", "msg-uuid-3"],
  "targetConversationIds": ["conv-uuid-a", "conv-uuid-b"]
}
```

**Parameters:**

| Field | Type | Required | Rules | Example |
|-------|------|----------|-------|---------|
| `userId` | UUID | Yes | Must be current user | `550e8400-e29b-41d4-a716-446655440001` |
| `messageIds` | UUID[] | Yes | Min 1 item, max 100 | `["msg1", "msg2"]` |
| `targetConversationIds` | UUID[] | Yes | Min 1 item, max 20 | `["conv1", "conv2"]` |

**Response (201 Created):**

```json
{
  "data": [
    {
      "id": "forwarded-msg-uuid-1",
      "conversationId": "conv-uuid-a",
      "senderId": "current-user-uuid",
      "type": "text",
      "text": "Original message text",
      "media": null,
      "links": [],
      "createdAt": "2026-04-13T10:00:00.000Z"
    },
    {
      "id": "forwarded-msg-uuid-2",
      "conversationId": "conv-uuid-a",
      "senderId": "current-user-uuid",
      "type": "image",
      "text": null,
      "media": [{ "url": "...", "name": "photo.jpg", "size": 102400 }],
      "createdAt": "2026-04-13T10:00:00.001Z"
    }
  ]
}
```

**Error Responses:**

```json
// 400 - Validation error
{
  "error": "At least one message is required",
  "code": "VALIDATION_ERROR"
}

// 403 - Not authorized
{
  "error": "You are not a member of the source conversation",
  "code": "UNAUTHORIZED"
}

// 404 - Message/conversation not found
{
  "error": "Message not found",
  "code": "NOT_FOUND"
}
```

---

## 2. Backend Behavior (thông tin cho FE)

### What backend handles:

✅ **Validates:**
- User là member của source conversation
- Tất cả messageIds tồn tại
- Tất cả targetConversationIds tồn tại
- User không forward message của người khác 
- User là member của tất cả target conversations

✅ **Processing:**
- Copy messages giữ nguyên nội dung + media
- Forward user = current user (senderId), không phải original sender
- Giữ lại message type (text/image/file/link)
- Tọa mark messages được forward

✅ **Side effects:**
- Emit socket event `receiveMessage` tới tất cả target rooms
- Tăng unread count cho other members trong target conversations
- Insert classification records nếu có media

### Restrictions:

❌ **Cannot forward:**
- System messages
- Deleted messages (404 error)
- Messages user không có quyền access
- Quay lại source conversation (ko sense)

### Best practices:

- Forward nhiều messages lúc 1 lần (hơn là 1 cái 1 cái)
- Max 100 messages / lần forward
- Max 20 target conversations / lần forward

---

## 3. Frontend Architecture

### File Structure

```
services/
  forwardService.ts         # API layer

hooks/
  useForwardMessage.ts      # Business logic

components/
  ForwardDialog.tsx         # UI dialog
  ConversationSelector.tsx  # List của target conversations

screens/
  ChatScreen.tsx            # Main screen - integrate forward
```

---

## 4. Service Layer - forwardService.ts

```typescript
import { Message } from '@/types/chat';

const API_BASE = 'http://192.168.1.6:3000/v1';

interface ForwardRequest {
  userId: string;
  messageIds: string[];
  targetConversationIds: string[];
}

interface ForwardResult {
  messages: Message[];
  sentToCount: number;
  failedConversationIds?: string[];
}

class ForwardService {
  /**
   * Forward messages to one or more conversations
   */
  async forwardMessages(
    request: ForwardRequest,
    token: string
  ): Promise<ForwardResult> {
    // Validation
    if (!request.messageIds || request.messageIds.length === 0) {
      throw new Error('At least one message is required');
    }

    if (!request.targetConversationIds || request.targetConversationIds.length === 0) {
      throw new Error('At least one target conversation is required');
    }

    if (request.messageIds.length > 100) {
      throw new Error('Maximum 100 messages per forward');
    }

    if (request.targetConversationIds.length > 20) {
      throw new Error('Maximum 20 target conversations per forward');
    }

    try {
      const response = await fetch(`${API_BASE}/messages/forward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: request.userId,
          messageIds: request.messageIds,
          targetConversationIds: request.targetConversationIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || `Forward failed: ${response.statusText}`
        );
      }

      const data = await response.json();

      return {
        messages: data.data || [],
        sentToCount: request.targetConversationIds.length,
      };
    } catch (error) {
      console.error('Forward messages error:', error);
      throw error instanceof Error
        ? error
        : new Error('Failed to forward messages');
    }
  }

  /**
   * Validate before forward (FE-side check)
   */
  validateForward(
    messageIds: string[],
    targetConversationIds: string[],
    currentConversationId: string
  ): { valid: boolean; error?: string } {
    if (messageIds.length === 0) {
      return { valid: false, error: 'Select at least one message' };
    }

    if (targetConversationIds.length === 0) {
      return { valid: false, error: 'Select at least one conversation' };
    }

    // Prevent forward to same conversation
    if (targetConversationIds.includes(currentConversationId)) {
      return {
        valid: false,
        error: 'Cannot forward to the same conversation',
      };
    }

    if (messageIds.length > 100) {
      return { valid: false, error: 'Maximum 100 messages per forward' };
    }

    if (targetConversationIds.length > 20) {
      return {
        valid: false,
        error: 'Maximum 20 target conversations per forward',
      };
    }

    return { valid: true };
  }
}

export default new ForwardService();
```

---

## 5. Hook - useForwardMessage.ts

```typescript
import { useState, useCallback } from 'react';
import forwardService from '@/services/forwardService';
import { Message } from '@/types/chat';

interface UseForwardMessageOptions {
  currentConversationId: string;
  currentUserId: string;
  token: string;
}

interface UseForwardMessageReturn {
  isLoading: boolean;
  error: string | null;
  selectedMessages: Set<string>;
  selectedConversations: Set<string>;
  toggleMessage: (messageId: string) => void;
  toggleConversation: (conversationId: string) => void;
  clearSelections: () => void;
  forward: () => Promise<void>;
  canForward: boolean;
}

const useForwardMessage = (
  options: UseForwardMessageOptions
): UseForwardMessageReturn => {
  const { currentConversationId, currentUserId, token } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(
    new Set()
  );
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(
    new Set()
  );

  const toggleMessage = useCallback((messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const toggleConversation = useCallback((conversationId: string) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  }, []);

  const clearSelections = useCallback(() => {
    setSelectedMessages(new Set());
    setSelectedConversations(new Set());
    setError(null);
  }, []);

  const forward = useCallback(async () => {
    // Validate
    const validation = forwardService.validateForward(
      Array.from(selectedMessages),
      Array.from(selectedConversations),
      currentConversationId
    );

    if (!validation.valid) {
      setError(validation.error || 'Validation failed');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await forwardService.forwardMessages(
        {
          userId: currentUserId,
          messageIds: Array.from(selectedMessages),
          targetConversationIds: Array.from(selectedConversations),
        },
        token
      );

      console.log(`✅ Forwarded to ${result.sentToCount} conversations`);

      // Cleanup
      clearSelections();

      // Return result nếu cần update UI
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Forward failed';
      setError(errorMessage);
      console.error('Forward error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [selectedMessages, selectedConversations, currentConversationId, currentUserId, token]);

  const canForward =
    selectedMessages.size > 0 && selectedConversations.size > 0;

  return {
    isLoading,
    error,
    selectedMessages,
    selectedConversations,
    toggleMessage,
    toggleConversation,
    clearSelections,
    forward,
    canForward,
  };
};

export default useForwardMessage;
```

---

## 6. UI Component - ForwardDialog.tsx

```typescript
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';

interface ForwardDialogProps {
  visible: boolean;
  conversations: any[]; // Available conversations
  selectedConversations: Set<string>;
  onSelectConversation: (conversationId: string) => void;
  onDismiss: () => void;
  onForward: () => Promise<void>;
  isLoading: boolean;
  error?: string | null;
  messageCount: number;
}

const ForwardDialog: React.FC<ForwardDialogProps> = ({
  visible,
  conversations,
  selectedConversations,
  onSelectConversation,
  onDismiss,
  onForward,
  isLoading,
  error,
  messageCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectAll, setSelectAll] = useState(false);

  const filteredConversations = conversations.filter(conv =>
    (conv.name || conv.otherUser?.displayName || 'Unknown')
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectAll) {
      // Deselect all
      filteredConversations.forEach(conv => {
        if (selectedConversations.has(conv.id)) {
          onSelectConversation(conv.id);
        }
      });
      setSelectAll(false);
    } else {
      // Select all
      filteredConversations.forEach(conv => {
        if (!selectedConversations.has(conv.id)) {
          onSelectConversation(conv.id);
        }
      });
      setSelectAll(true);
    }
  };

  const renderConversation = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.conversationItem,
        selectedConversations.has(item.id) && styles.selectedItem,
      ]}
      onPress={() => onSelectConversation(item.id)}
    >
      <View
        style={[
          styles.checkbox,
          selectedConversations.has(item.id) && styles.checkedBox,
        ]}
      >
        {selectedConversations.has(item.id) && (
          <Text style={styles.checkmark}>✓</Text>
        )}
      </View>

      <View style={styles.conversationInfo}>
        <Text style={styles.conversationName} numberOfLines={1}>
          {item.name || item.otherUser?.displayName || 'Unknown'}
        </Text>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage?.text || 'No messages'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onDismiss}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>
              Forward {messageCount} message{messageCount > 1 ? 's' : ''}
            </Text>
            <Text style={styles.subtitle}>
              to {selectedConversations.size} conversation{selectedConversations.size !== 1 ? 's' : ''}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={onForward}
              disabled={isLoading || selectedConversations.size === 0}
            >
              <Text
                style={[
                  styles.forwardBtn,
                  (isLoading || selectedConversations.size === 0) &&
                    styles.disabledBtn,
                ]}
              >
                {isLoading ? 'Sending...' : 'Forward'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error message */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Select all option */}
        <View style={styles.selectAllContainer}>
          <Text style={styles.selectAllText}>
            Select All ({filteredConversations.length})
          </Text>
          <Switch
            value={selectAll}
            onValueChange={handleSelectAll}
            trackColor={{ false: '#ccc', true: '#81c784' }}
            thumbColor={selectAll ? '#4caf50' : '#f0f0f0'}
          />
        </View>

        {/* Conversations list */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : filteredConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No conversations found</Text>
          </View>
        ) : (
          <FlatList
            data={filteredConversations}
            renderItem={renderConversation}
            keyExtractor={item => item.id}
            style={styles.list}
          />
        )}
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerLeft: {
    flex: 1,
  },
  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  cancelBtn: {
    fontSize: 16,
    color: '#999',
  },
  forwardBtn: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  disabledBtn: {
    color: '#ccc',
  },
  errorBanner: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffcdd2',
  },
  errorText: {
    color: '#c62828',
    fontSize: 12,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#000',
  },
  selectAllContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  list: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  selectedItem: {
    backgroundColor: '#f0f7ff',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkedBox: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  lastMessage: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});

export default ForwardDialog;
```

---

## 7. Integration into ChatScreen

```typescript
// In ChatScreen.tsx

import { useState } from 'react';
import ForwardDialog from '@/components/ForwardDialog';
import useForwardMessage from '@/hooks/useForwardMessage';

const ChatScreen: React.FC<ChatScreenProps> = ({
  conversationId,
  token,
  allConversations,
  currentUserId,
}) => {
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set()
  );

  const {
    isLoading,
    error,
    selectedConversations,
    toggleConversation,
    forward,
    canForward,
  } = useForwardMessage({
    currentConversationId: conversationId,
    currentUserId,
    token,
  });

  const handleMessageLongPress = (message: any) => {
    // Show action sheet with Quote, Forward, Delete, Copy
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Quote Reply', 'Forward', 'Copy', 'Delete'],
        destructiveButtonIndex: 4,
        cancelButtonIndex: 0,
      },
      buttonIndex => {
        switch (buttonIndex) {
          case 1:
            // Quote
            handleQuoteMessage(message);
            break;
          case 2:
            // Forward
            setSelectedMessageIds(new Set([message.id]));
            setShowForwardDialog(true);
            break;
          case 3:
            // Copy
            handleCopyMessage(message);
            break;
          case 4:
            // Delete
            handleDeleteMessage(message);
            break;
        }
      }
    );
  };

  const handleForward = async () => {
    try {
      await forward();
      setShowForwardDialog(false);
      setSelectedMessageIds(new Set());
      
      // Show success toast
      showToast(`✅ Forwarded to ${selectedConversations.size} conversations`);
    } catch (err) {
      showToast('❌ Forward failed');
    }
  };

  // Filter conversations (exclude current)
  const availableConversations = allConversations.filter(
    conv => conv.id !== conversationId
  );

  return (
    <View style={styles.container}>
      {/* Messages list */}
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isSender={item.senderId === currentUserId}
            onLongPress={() => handleMessageLongPress(item)}
          />
        )}
        keyExtractor={item => item.id}
      />

      {/* Forward Dialog */}
      <ForwardDialog
        visible={showForwardDialog}
        conversations={availableConversations}
        selectedConversations={selectedConversations}
        onSelectConversation={toggleConversation}
        onDismiss={() => setShowForwardDialog(false)}
        onForward={handleForward}
        isLoading={isLoading}
        error={error}
        messageCount={selectedMessageIds.size}
      />
    </View>
  );
};
```

---

## 8. UX Flow Diagram

```
User long-press message
         ↓
Show action sheet (Quote, Forward, Delete, Copy)
         ↓
   [Forward] tapped
         ↓
Open ForwardDialog
   - Show all conversations
   - User select target conversations
   - Option to select all
   - Search conversations
         ↓
   [Forward] button
         ↓
Loading...
         ↓
✅ Success: Dismiss dialog, show toast
   "Forwarded to X conversations"
    OR
❌ Error: Show error message in dialog
```

---

## 9. Error Handling & Edge Cases

### Validation

```typescript
// FE-side validation
1. ✅ At least 1 message selected
2. ✅ At least 1 target conversation selected
3. ✅ Cannot forward to same conversation
4. ✅ Max 100 messages per forward
5. ✅ Max 20 conversations per forward

// BE-side validation (FE should trust but handle errors)
1. ✅ Messages exist
2. ✅ User is member of source conversation
3. ✅ User is member of all target conversations
4. ✅ Messages not deleted
```

### Error Messages

| Error | Cause | Recovery |
|-------|-------|----------|
| "Select at least one message" | No messages selected | User select messages |
| "Select at least one conversation" | No conversations selected | User select conversations |
| "Cannot forward to the same conversation" | Forwarding to current chat | Remove current from list |
| "Message not found" | Message was deleted | Reload messages list |
| "You are not a member" | Lost access to conversation | Reload conversations |
| "Forward failed: Network error" | Network issue | Retry |

---

## 10. Testing Checklist

- [ ] Single message forward to 1 conversation
- [ ] Multiple messages forward to 1 conversation
- [ ] Single message forward to multiple conversations
- [ ] Multiple messages forward to multiple conversations
- [ ] Select all checkbox works
- [ ] Search filters conversations
- [ ] Error handling - invalid selections
- [ ] Error handling - network failure
- [ ] Loading state shows correctly
- [ ] Toast success message
- [ ] Dialog closes after successful forward
- [ ] Messages appear in target conversations (Socket.io)
- [ ] Cannot select current conversation
- [ ] Duplicate conversation IDs handled
- [ ] Max limits enforced (100 messages, 20 conversations)

---

## 11. Socket.io Integration

After forward succeeds, backend automatically emits `receiveMessage` event to target rooms:

```javascript
// FE doesn't need to do anything
// Backend handles:
// 1. Create new messages in target conversations
// 2. Emit receiveMessage to each room
// 3. Increase unread count for other members

socket.on('receiveMessage', ({ message, conversationId }) => {
  // This event will be triggered for forwarded messages
  // in target conversations
  console.log('New forwarded message:', message);
  addMessages([message]); // Add to conversation
});
```

---

## 12. Performance Considerations

**Do:**
- ✅ Batch forward multiple messages in one request
- ✅ Limit selection to max items (100 messages, 20 conversations)
- ✅ Use cursor pagination for conversation list

**Don't:**
- ❌ Don't make separate requests for each message
- ❌ Don't forward 1000+ messages
- ❌ Don't block UI while loading

---

## Summary

| Aspect | Details |
|--------|---------|
| API Endpoint | `POST /v1/messages/forward` |
| Auth | ✅ Required |
| Request Format | `{ userId, messageIds[], targetConversationIds[] }` |
| Response | `Message[]` (forwarded messages) |
| FE Effort | ~200-300 lines code |
| Backend Status | ✅ Ready |
| Testing | 14 test cases |
| Estimated Time | 3-4 hours |

---

**Last Updated:** 2026-04-13  
**Backend Status:** ✅ Production Ready  
**Frontend Status:** 📋 Ready to Implement
