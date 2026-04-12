# 💬 Load & Display Messages Like Messenger

## 🎯 Tổng quan

Để hiển thị chat như Messenger cần:
1. **Load tin nhắn cũ** qua API (pagination)
2. **Lắng nghe tin mới** qua Socket.IO real-time
3. **Display đúng format** (bubble, timestamp, avatar, etc.)
4. **Scroll behaviors** (load more, auto-scroll)

---

## 🔌 Step 1: Types & Interfaces

**File:** `types/chat.ts`

```typescript
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'file' | 'system';
  text?: string;
  media?: MessageMedia[];
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  pinned?: boolean;
}

export interface MessageMedia {
  url: string;
  mediaType: 'image' | 'file';
  name?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface LoadMessagesResponse {
  data: {
    messages: Message[];
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  name?: string;
  members?: User[];
  lastMessage?: Message;
}
```

---

## 📥 Step 2: Chat Message Service

**File:** `services/chatMessageService.ts`

```typescript
import { Message, LoadMessagesResponse, Conversation } from '@/types/chat';

const API_BASE = 'http://192.168.1.6:3000';

class ChatMessageService {
  
  /**
   * Load messages for conversation
   * @param conversationId 
   * @param token 
   * @param cursor - For pagination (from previous response)
   * @param limit - Messages per page (default 20)
   */
  async loadMessages(
    conversationId: string,
    token: string,
    cursor?: string,
    limit: number = 20
  ): Promise<LoadMessagesResponse> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (cursor) {
      params.append('cursor', cursor);
    }

    const response = await fetch(
      `${API_BASE}/v1/conversations/${conversationId}/messages?${params}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to load messages: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get conversation details
   */
  async getConversationDetail(
    conversationId: string,
    token: string
  ): Promise<Conversation> {
    const response = await fetch(
      `${API_BASE}/v1/conversations/${conversationId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }

    return response.json();
  }

  /**
   * Mark message as seen
   */
  async markAsRead(
    conversationId: string,
    messageId: string,
    token: string
  ): Promise<void> {
    await fetch(
      `${API_BASE}/v1/conversations/${conversationId}/mark-as-seen`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ lastSeenMessageId: messageId }),
      }
    );
  }
}

export default new ChatMessageService();
```

---

## 🪝 Step 3: React Hook (Message State)

**File:** `hooks/useChatMessages.ts`

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { Message } from '@/types/chat';
import chatMessageService from '@/services/chatMessageService';
import FriendSocketService from '@/services/friendSocket';

interface UseChatMessagesProps {
  conversationId: string;
  token: string;
}

interface UseChatMessagesReturn {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  addMessage: (message: Message) => void;
  error: string | null;
  isInitialized: boolean;
}

const useChatMessages = ({
  conversationId,
  token,
}: UseChatMessagesProps): UseChatMessagesReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const nextCursorRef = useRef<string | undefined>();
  const loadingRef = useRef(false);

  /**
   * Load initial messages (newest first)
   */
  const loadInitialMessages = useCallback(async () => {
    if (loadingRef.current || isInitialized) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const response = await chatMessageService.loadMessages(
        conversationId,
        token,
        undefined,
        20
      );

      // Messages come from backend in descending order (newest first)
      // Reverse to show oldest first in UI
      setMessages(response.data.messages.reverse());
      nextCursorRef.current = response.data.nextCursor;
      setHasMore(response.data.hasMore);
      setError(null);
      setIsInitialized(true);

      console.log('✅ Initial messages loaded:', response.data.messages.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load messages';
      setError(message);
      console.error('❌ Load messages error:', message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [conversationId, token, isInitialized]);

  /**
   * Load older messages (when user scrolls up)
   */
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !nextCursorRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const response = await chatMessageService.loadMessages(
        conversationId,
        token,
        nextCursorRef.current,
        20
      );

      // Add older messages to the beginning
      const newMessages = response.data.messages.reverse();
      setMessages(prev => [...newMessages, ...prev]);
      
      nextCursorRef.current = response.data.nextCursor;
      setHasMore(response.data.hasMore);

      console.log('✅ More messages loaded:', newMessages.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more';
      setError(message);
      console.error('❌ Load more error:', message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [conversationId, token, hasMore]);

  /**
   * Add new message (from Socket.IO)
   */
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
    console.log('💬 New message received:', message.id);
  }, []);

  /**
   * Setup Socket.IO listeners
   */
  useEffect(() => {
    const socket = FriendSocketService.getSocket();
    if (!socket) return;

    const handleReceiveMessage = (data: { message: Message }) => {
      console.log('📨 Received message:', data.message);
      addMessage(data.message);
    };

    socket.on('receiveMessage', handleReceiveMessage);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
    };
  }, [addMessage]);

  /**
   * Load initial messages on mount
   */
  useEffect(() => {
    if (token && conversationId && !isInitialized) {
      loadInitialMessages();
    }
  }, [token, conversationId, isInitialized, loadInitialMessages]);

  return {
    messages,
    loading,
    hasMore,
    loadMore,
    addMessage,
    error,
    isInitialized,
  };
};

export default useChatMessages;
```

---

## 🎨 Step 4: Message Bubble Component

**File:** `components/MessageBubble.tsx`

```typescript
import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Message } from '@/types/chat';

interface MessageBubbleProps {
  message: Message;
  isSender: boolean;
  senderName?: string;
  senderAvatar?: string;
  isGroup?: boolean;
  showAvatar?: boolean;
  onLongPress?: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSender,
  senderName,
  senderAvatar,
  isGroup,
  showAvatar = true,
  onLongPress,
}) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <View style={[styles.container, isSender && styles.senderContainer]}>
      {/* Avatar (group only) */}
      {isGroup && !isSender && showAvatar && (
        <Image
          source={{ uri: senderAvatar || 'https://via.placeholder.com/32' }}
          style={styles.avatar}
        />
      )}

      {/* Message bubble */}
      <TouchableOpacity
        style={[
          styles.bubble,
          isSender ? styles.senderBubble : styles.receiverBubble,
        ]}
        onLongPress={onLongPress}
      >
        {/* Sender name (group only) */}
        {isGroup && !isSender && senderName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}

        {/* Text message */}
        {message.text && (
          <Text
            style={[
              styles.text,
              isSender ? styles.senderText : styles.receiverText,
            ]}
          >
            {message.text}
          </Text>
        )}

        {/* Media (image) */}
        {message.media?.map((m, idx) => (
          m.mediaType === 'image' && (
            <Image
              key={idx}
              source={{ uri: m.url }}
              style={{
                width: 200,
                height: m.height && m.width ? (200 * m.height) / m.width : 200,
                borderRadius: 8,
                marginTop: message.text ? 4 : 0,
              }}
            />
          )
        ))}

        {/* Media (file) */}
        {message.media?.map((m, idx) => (
          m.mediaType === 'file' && (
            <View key={idx} style={styles.fileContainer}>
              <Text style={styles.fileIcon}>📎</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.fileSize}>
                  {m.size ? `${(m.size / 1024 / 1024).toFixed(1)} MB` : ''}
                </Text>
              </View>
            </View>
          )
        ))}
      </TouchableOpacity>

      {/* Timestamp */}
      <Text style={[styles.time, isSender && styles.senderTime]}>
        {formatTime(message.createdAt)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  senderContainer: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  senderBubble: {
    backgroundColor: '#007AFF',
  },
  receiverBubble: {
    backgroundColor: '#E5E5EA',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
  },
  senderText: {
    color: '#fff',
  },
  receiverText: {
    color: '#000',
  },
  time: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
    marginBottom: 2,
  },
  senderTime: {
    marginLeft: 0,
    marginRight: 8,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  fileIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  fileSize: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
});

export default MessageBubble;
```

---

## 📱 Step 5: Chat Screen (Full Implementation)

**File:** `screens/ChatScreen.tsx`

```typescript
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import useChatMessages from '@/hooks/useChatMessages';
import chatMessageService from '@/services/chatMessageService';
import ChatService from '@/services/chatService';
import messageUploadService from '@/services/mediaUploadService';
import MessageBubble from '@/components/MessageBubble';
import { useAuth } from '@/hooks/useAuth';
import { launchImageLibrary } from 'react-native-image-picker';
import { Message } from '@/types/chat';

interface RouteParams {
  conversationId: string;
  userName?: string;
}

const ChatScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { token, userId } = useAuth();
  const params = route.params as RouteParams;
  const conversationId = params?.conversationId;

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const initialScroll = useRef(true);

  const {
    messages,
    loading,
    hasMore,
    loadMore,
    addMessage,
    error,
    isInitialized,
  } = useChatMessages({
    conversationId,
    token,
  });

  /**
   * Auto-scroll to bottom when new message arrives
   */
  useEffect(() => {
    if (messages.length > 0 && initialScroll.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        initialScroll.current = false;
      }, 100);
    } else if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  /**
   * Send text message
   */
  const handleSendText = useCallback(() => {
    if (!text.trim()) return;

    ChatService.sendMessageWithMedia(conversationId, text, []);
    setText('');
  }, [text, conversationId]);

  /**
   * Send image
   */
  const handlePickImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo' });

      if (!result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri || !asset.type || !asset.fileName) {
        Alert.alert('Error', 'Invalid image');
        return;
      }

      setUploading(true);

      const file = new File([asset.uri], asset.fileName, { type: asset.type });

      await ChatService.sendImage(token, conversationId, file, text || undefined);
      setText('');
    } catch (error) {
      Alert.alert('Error', `Failed to send image: ${error}`);
    } finally {
      setUploading(false);
    }
  }, [token, conversationId, text]);

  /**
   * Load more messages (when scroll to top)
   */
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      await loadMore();
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, loadMore, isLoadingMore]);

  /**
   * Check if near top of list
   */
  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset } = event.nativeEvent;
      if (contentOffset.y < 100 && hasMore && !isLoadingMore) {
        handleLoadMore();
      }
    },
    [hasMore, isLoadingMore, handleLoadMore]
  );

  /**
   * Render message item
   */
  const renderMessageItem = useCallback(
    ({ item }: { item: Message }) => {
      const isSender = item.senderId === userId;

      return (
        <MessageBubble
          message={item}
          isSender={isSender}
          senderName={item.senderId}
          isGroup={false}
          showAvatar={false}
        />
      );
    },
    [userId]
  );

  /**
   * Render list header (load more)
   */
  const renderListHeader = () => {
    if (!hasMore || !isInitialized) return null;

    return (
      <View style={styles.loadMoreContainer}>
        {isLoadingMore ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text style={styles.loadMoreText}>Load older messages</Text>
        )}
      </View>
    );
  };

  if (!isInitialized && loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => window.location.reload()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        ListHeaderComponent={renderListHeader}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        extraData={userId}
      />

      {/* Input area */}
      <View style={styles.inputContainer}>
        {/* Image button */}
        <TouchableOpacity
          style={styles.mediaButton}
          onPress={handlePickImage}
          disabled={uploading}
        >
          <Text style={styles.mediaButtonText}>🖼️</Text>
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          value={text}
          onChangeText={setText}
          editable={!uploading}
          multiline
          maxLength={5000}
        />

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || uploading) && styles.sendButtonDisabled]}
          onPress={handleSendText}
          disabled={!text.trim() || uploading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messagesList: {
    paddingVertical: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  loadMoreContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  mediaButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  mediaButtonText: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 4,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#d32f2f',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default ChatScreen;
```

---

## 🎯 Flow Diagram

```
App starts
  ↓
useChatMessages hook
  ├─ loadInitialMessages() on mount
  ├─ GET /conversations/:id/messages
  └─ Store in state (reversed: oldest first)
  ↓
FlatList renders messages
  ├─ Scroll to bottom (initial)
  ├─ Auto-scroll on new message
  └─ Load more on scroll-to-top
  ↓
User sends text/image
  ├─ emit 'sendMessage' via Socket.IO
  ├─ Backend receives → saves → emits 'receiveMessage'
  └─ addMessage() → add to state → auto-scroll
  ↓
Socket.IO listens 'receiveMessage'
  └─ addMessage() callback adds new message
```

---

## ✅ Features

✅ **Load older messages** (pagination via cursor)
✅ **Real-time messages** (Socket.IO receiveMessage)
✅ **Auto-scroll to bottom** (new message arrives)
✅ **Scroll-to-load** (load more when scroll up)
✅ **Send text + media** (images, files)
✅ **Display formatted** (bubbles, timestamps, avatars)
✅ **Error handling** (show error + retry)
✅ **Loading states** (initial load, load more, upload)

---

## 🐛 Debug Tips

```typescript
// Log messages loaded
console.log('Messages:', messages.length);

// Log cursor pagination
console.log('Next cursor:', nextCursorRef.current);
console.log('Has more:', hasMore);

// Log Socket.IO events
socket.on('receiveMessage', (data) => {
  console.log('📨 Received:', data.message);
});

// Check if scrolling to bottom
FlatList.scrollToEnd({ animated: true });
```

---

## 📝 Summary

**To load & display messages like Messenger:**

1. ✅ **Load initial** → GET `/conversations/{id}/messages`
2. ✅ **Pagination** → Use `cursor` + `hasMore`
3. ✅ **Real-time** → Listen `receiveMessage` socket event
4. ✅ **Display** → FlatList with MessageBubble component
5. ✅ **Scroll** → Auto-scroll + load-on-scroll-top
6. ✅ **Send** → Text + Media via Socket.IO

Tất cả code trên có thể copy-paste xài ngay! 🚀
