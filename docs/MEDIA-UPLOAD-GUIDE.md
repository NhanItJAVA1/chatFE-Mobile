# 📸 Chat Media Upload & Sending Guide

## 🎯 Tổng quan

Để gửi **ảnh, video, file, audio** trong chat real-time, cần 2 bước:
1. **Upload file** (lấy URL qua presigned URL hoặc direct upload)
2. **Gửi message** với media info qua Socket.IO

---

## 📊 Supported Media Types

| Type | Formats | Max Size | MIME Types |
|------|---------|----------|-----------|
| **IMAGE** | JPG, PNG, GIF, WebP | 100 MB | image/jpeg, image/png, image/gif, image/webp |
| **VIDEO** | MP4, WebM, MPEG, MOV | 1 GB | video/mp4, video/webm, video/mpeg, video/quicktime |
| **AUDIO** | MP3, WAV, OGG | 100 MB | audio/mpeg, audio/wav, audio/ogg |
| **DOCUMENT** | PDF, Word (docx) | 50 MB | application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document |

---

## 🔐 Types & Interfaces

**File:** `types/media.ts`

```typescript
// Media type enum
export enum MediaFileType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

// Presigned URL request
export interface RequestPresignedUrlPayload {
  fileType: MediaFileType;          // IMAGE | VIDEO | AUDIO | DOCUMENT
  mimeType: string;                 // e.g., 'image/jpeg'
  fileSize: number;                 // bytes
  originalName?: string;            // e.g., 'photo.jpg'
  expiresIn?: number;               // seconds (default: 300 = 5 min)
  conversationId?: string;          // optional
}

// Presigned URL response
export interface PresignedUrlResponse {
  fileId: string;
  filename: string;
  presignedUrl: string;             // Use this to upload
  uploadMethod: 'PUT' | 'POST';     // Usually PUT
  expiresAt: string;                // ISO date string
  headers: Record<string, string>;  // { 'Content-Type': 'image/jpeg' }
}

// For Socket.IO message
export interface MessageMedia {
  url: string;
  mediaType: 'image' | 'file';      // or 'image', 'file'
  name?: string;                    // Original filename
  size?: number;                    // bytes
  width?: number;                   // For images only
  height?: number;                  // For images only
}

// Full message with media
export interface ChatMessage {
  conversationId: string;
  text?: string;                    // Optional text with media
  media?: MessageMedia[];           // Array of media items
}
```

---

## 🔌 Step 1: Upload Media (3 Options)

### Option A: Presigned URL (AWS S3) - RECOMMENDED

**Lợi ích:** Upload trực tiếp lên S3, không qua backend (tiết kiệm bandwidth)

**File:** `services/mediaService.ts`

```typescript
import { 
  MediaFileType, 
  PresignedUrlResponse,
  RequestPresignedUrlPayload 
} from '@/types/media';

const API_BASE = 'http://192.168.1.6:3000';

class MediaUploadService {
  
  /**
   * Step 1: Request presigned URL from backend
   */
  async requestPresignedUrl(
    token: string,
    payload: RequestPresignedUrlPayload
  ): Promise<PresignedUrlResponse> {
    const response = await fetch(
      `${API_BASE}/v1/media/request-upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get presigned URL');
    }

    return response.json();
  }

  /**
   * Step 2: Upload file directly to S3 using presigned URL
   */
  async uploadToS3(
    presignedUrl: string,
    file: File | Blob,
    mimeType: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent);
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Extract URL from presignedUrl (remove query params)
          const url = presignedUrl.split('?')[0];
          resolve(url);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.send(file);
    });
  }

  /**
   * Confirm upload (so backend marks it as CONFIRMED)
   */
  async confirmUpload(
    token: string,
    fileId: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/v1/media/confirm-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ fileId }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to confirm upload');
    }
  }

  /**
   * Full flow: Request -> Upload -> Confirm
   */
  async uploadPresignedFlow(
    token: string,
    file: File,
    fileType: MediaFileType,
    onProgress?: (progress: number) => void
  ): Promise<{ url: string; fileId: string }> {
    try {
      // Step 1: Request presigned URL
      console.log('📝 Requesting presigned URL...');
      const presignedData = await this.requestPresignedUrl(token, {
        fileType,
        mimeType: file.type,
        fileSize: file.size,
        originalName: file.name,
        expiresIn: 300,
      });

      console.log('✅ Got presigned URL');

      // Step 2: Upload to S3
      console.log('📤 Uploading to S3...');
      const url = await this.uploadToS3(
        presignedData.presignedUrl,
        file,
        file.type,
        onProgress
      );

      console.log('✅ Upload complete');

      // Step 3: Confirm upload
      console.log('🔔 Confirming upload...');
      await this.confirmUpload(token, presignedData.fileId);

      console.log('✅ Upload confirmed');

      return {
        url,
        fileId: presignedData.fileId,
      };
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }
}

export default new MediaUploadService();
```

### Option B: Direct Upload (Multipart Form)

**Lợi ích:** Đơn giản, không cần presigned URL

```typescript
async uploadDirect(
  token: string,
  file: File
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `${API_BASE}/v1/media/upload`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  const data = await response.json();
  return { url: data.data.url };
}
```

### Option C: Upload Multiple Files

```typescript
async uploadMultiple(
  token: string,
  files: File[]
): Promise<{ urls: string[] }> {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  const response = await fetch(
    `${API_BASE}/v1/media/upload-multiple`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Multiple upload failed');
  }

  const data = await response.json();
  return { urls: data.data.urls };
}
```

---

## 💬 Step 2: Send Message with Media (Socket.IO)

**File:** `services/chatService.ts`

```typescript
import FriendSocketService from '@/services/friendSocket';
import { MessageMedia, ChatMessage } from '@/types/media';

class ChatService {
  
  /**
   * Send message with media
   */
  sendMessageWithMedia(
    conversationId: string,
    text: string | undefined,
    mediaArray: MessageMedia[],
    callback?: (response: any) => void
  ): void {
    const socket = FriendSocketService.getSocket();
    
    if (!socket) {
      console.error('Socket not connected');
      if (callback) callback({ success: false, error: 'Socket not connected' });
      return;
    }

    const payload: ChatMessage = {
      conversationId,
      text: text || undefined,
      media: mediaArray,
    };

    socket.emit('sendMessage', payload, (response: any) => {
      if (response?.success) {
        console.log('✅ Message sent:', response.message);
      } else {
        console.error('❌ Send failed:', response?.error);
      }

      if (callback) callback(response);
    });
  }

  /**
   * Send image message
   */
  async sendImage(
    token: string,
    conversationId: string,
    imageFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      // Upload image
      const { url } = await this.uploadImage(token, imageFile, onProgress);

      // Get image dimensions
      const dimensions = await this.getImageDimensions(url);

      // Create message media
      const media: MessageMedia = {
        url,
        mediaType: 'image',
        name: imageFile.name,
        size: imageFile.size,
        width: dimensions.width,
        height: dimensions.height,
      };

      // Send via Socket.IO
      this.sendMessageWithMedia(conversationId, caption, [media]);
    } catch (error) {
      console.error('Failed to send image:', error);
      throw error;
    }
  }

  /**
   * Send video message
   */
  async sendVideo(
    token: string,
    conversationId: string,
    videoFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      // Upload video
      const { url } = await this.uploadVideo(token, videoFile, onProgress);

      // Create message media
      const media: MessageMedia = {
        url,
        mediaType: 'file',  // Backend treats video as 'file'
        name: videoFile.name,
        size: videoFile.size,
      };

      // Send via Socket.IO
      this.sendMessageWithMedia(conversationId, caption, [media]);
    } catch (error) {
      console.error('Failed to send video:', error);
      throw error;
    }
  }

  /**
   * Send file message
   */
  async sendFile(
    token: string,
    conversationId: string,
    file: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      // Upload file
      const { url } = await this.uploadFile(token, file, onProgress);

      // Create message media
      const media: MessageMedia = {
        url,
        mediaType: 'file',
        name: file.name,
        size: file.size,
      };

      // Send via Socket.IO
      this.sendMessageWithMedia(conversationId, caption, [media]);
    } catch (error) {
      console.error('Failed to send file:', error);
      throw error;
    }
  }

  /**
   * Send audio message
   */
  async sendAudio(
    token: string,
    conversationId: string,
    audioFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      // Upload audio
      const { url } = await this.uploadAudio(token, audioFile, onProgress);

      // Create message media
      const media: MessageMedia = {
        url,
        mediaType: 'file',  // Backend treats audio as 'file'
        name: audioFile.name,
        size: audioFile.size,
      };

      // Send via Socket.IO
      this.sendMessageWithMedia(conversationId, caption, [media]);
    } catch (error) {
      console.error('Failed to send audio:', error);
      throw error;
    }
  }

  // Helper methods
  private async uploadImage(token: string, file: File, onProgress?: (p: number) => void) {
    return mediaService.uploadPresignedFlow(token, file, 'IMAGE', onProgress);
  }

  private async uploadVideo(token: string, file: File, onProgress?: (p: number) => void) {
    return mediaService.uploadPresignedFlow(token, file, 'VIDEO', onProgress);
  }

  private async uploadFile(token: string, file: File, onProgress?: (p: number) => void) {
    return mediaService.uploadPresignedFlow(token, file, 'DOCUMENT', onProgress);
  }

  private async uploadAudio(token: string, file: File, onProgress?: (p: number) => void) {
    return mediaService.uploadPresignedFlow(token, file, 'AUDIO', onProgress);
  }

  private getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }
}

export default new ChatService();
```

---

## 🎨 React Native Components

### Image Picker & Send

**File:** `screens/ChatScreen.tsx`

```typescript
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import ChatService from '@/services/chatService';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  conversationId: string;
}

const ChatScreen: React.FC<Props> = ({ conversationId }) => {
  const { token } = useAuth();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Send text message
  const handleSendText = () => {
    if (!text.trim()) return;

    ChatService.sendMessageWithMedia(conversationId, text, []);
    setText('');
  };

  // Pick and send image
  const handlePickImage = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo' });

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        if (!asset.uri || !asset.type || !asset.fileName) {
          Alert.alert('Error', 'Invalid image file');
          return;
        }

        setUploading(true);
        setUploadProgress(0);

        const file = new File([asset.uri], asset.fileName, { type: asset.type });

        await ChatService.sendImage(
          token,
          conversationId,
          file,
          text || undefined,
          (progress) => setUploadProgress(progress)
        );

        setText('');
        Alert.alert('Success', 'Image sent!');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to send image: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  // Pick and send video
  const handlePickVideo = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'video' });

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (!asset.uri || !asset.type || !asset.fileName) {
          Alert.alert('Error', 'Invalid video file');
          return;
        }

        setUploading(true);
        setUploadProgress(0);

        const file = new File([asset.uri], asset.fileName, { type: asset.type });

        await ChatService.sendVideo(
          token,
          conversationId,
          file,
          text || undefined,
          (progress) => setUploadProgress(progress)
        );

        setText('');
        Alert.alert('Success', 'Video sent!');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to send video: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  // Pick and send file
  const handlePickFile = async () => {
    try {
      // Use document picker for files
      const result = await launchImageLibrary({ mediaType: 'photo' });

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (!asset.uri || !asset.type || !asset.fileName) {
          Alert.alert('Error', 'Invalid file');
          return;
        }

        setUploading(true);
        setUploadProgress(0);

        const file = new File([asset.uri], asset.fileName, { type: asset.type });

        await ChatService.sendFile(
          token,
          conversationId,
          file,
          text || undefined,
          (progress) => setUploadProgress(progress)
        );

        setText('');
        Alert.alert('Success', 'File sent!');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to send file: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Messages list would go here */}

      {/* Upload progress */}
      {uploading && (
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${uploadProgress}%` }]}
          />
          <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
        </View>
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        {/* Media buttons */}
        <TouchableOpacity
          style={styles.mediaButton}
          onPress={handlePickImage}
          disabled={uploading}
        >
          <Text style={styles.mediaButtonText}>🖼️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mediaButton}
          onPress={handlePickVideo}
          disabled={uploading}
        >
          <Text style={styles.mediaButtonText}>🎥</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mediaButton}
          onPress={handlePickFile}
          disabled={uploading}
        >
          <Text style={styles.mediaButtonText}>📎</Text>
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Type a message..."
          value={text}
          onChangeText={setText}
          editable={!uploading}
          multiline
        />

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendButton, uploading && styles.sendButtonDisabled]}
          onPress={handleSendText}
          disabled={!text.trim() || uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  mediaButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  mediaButtonText: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  progressBar: {
    height: 30,
    backgroundColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ChatScreen;
```

### Display Media Messages

**File:** `components/MediaMessage.tsx`

```typescript
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MessageMedia } from '@/types/media';

interface Props {
  media: MessageMedia;
  isSender: boolean;
}

const MediaMessage: React.FC<Props> = ({ media, isSender }) => {
  const isImage = media.mediaType === 'image';
  const isFile = media.mediaType === 'file';

  if (isImage) {
    return (
      <View style={[styles.container, isSender && styles.senderContainer]}>
        <Image
          source={{ uri: media.url }}
          style={[
            styles.image,
            {
              aspectRatio: media.width && media.height 
                ? media.width / media.height 
                : 1,
            },
          ]}
        />
      </View>
    );
  }

  if (isFile) {
    return (
      <View style={[styles.container, isSender && styles.senderContainer]}>
        <TouchableOpacity style={styles.fileContainer}>
          <Text style={styles.fileIcon}>📎</Text>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>
              {media.name}
            </Text>
            <Text style={styles.fileSize}>
              {media.size ? `${(media.size / 1024).toFixed(1)} KB` : ''}
            </Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 8,
    maxWidth: '80%',
  },
  senderContainer: {
    alignSelf: 'flex-end',
  },
  image: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  fileSize: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  downloadIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
});

export default MediaMessage;
```

---

## 🧪 Testing Checklist

- [ ] **Image Upload:**
  - [ ] JPG format (check dimensions sent)
  - [ ] PNG format
  - [ ] GIF format (if animated)
  - [ ] WebP format
  
- [ ] **Video Upload:**
  - [ ] MP4 format (check size < 1GB)
  - [ ] WebM format
  - [ ] Progress callback (0-100%)
  
- [ ] **File Upload:**
  - [ ] PDF format
  - [ ] Word document (.docx)
  - [ ] Large file (> 100MB should fail)
  
- [ ] **Audio Upload:**
  - [ ] MP3 format
  - [ ] WAV format
  - [ ] OGG format

- [ ] **Socket.IO Sending:**
  - [ ] Message received on receiver's device
  - [ ] Media displayed correctly
  - [ ] File names shown correctly
  
- [ ] **Presigned URL:**
  - [ ] URL expires after specified time
  - [ ] Headers sent correctly
  - [ ] Fallback to direct upload if error

---

## 🐛 Debug Tips

```typescript
// Check upload status
console.log('File type:', file.type);
console.log('File size:', file.size);
console.log('File name:', file.name);

// Check presigned response
console.log('Presigned URL:', presignedData.presignedUrl);
console.log('Expires at:', presignedData.expiresAt);

// Check Socket.IO emit
socket.emit('sendMessage', payload, (response) => {
  console.log('FULL RESPONSE:', JSON.stringify(response, null, 2));
});

// Check image dimensions
Image.getSize(url, (width, height) => {
  console.log('Image size:', width, 'x', height);
});
```

---

## 📝 Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `fileSize > maxSize` | File too large | Check MAX_FILE_SIZES for type |
| `MIME type not allowed` | Invalid format | Use supported formats table above |
| `Presigned URL expired` | Too slow upload | Request new URL (expiresIn=300s) |
| `Permission denied (S3)` | Invalid credentials | Backend issue, contact team |
| `Socket not connected` | Not logged in | Call socket.connect() first |

---

## 📦 Dependencies

```json
{
  "socket.io-client": "^4.x",
  "react-native": "^0.72.x",
  "react-native-image-picker": "^5.x"
}
```

---

## 🎯 Summary

**Image/Video/File/Audio Upload Flow:**

```
User picks file from device
    ↓
Request Presigned URL (with fileType, mimeType, fileSize)
    ↓
Upload directly to S3 using presigned URL
    ↓
Confirm upload with fileId
    ↓
Get image dimensions (for images)
    ↓
Create MessageMedia object with URL + metadata
    ↓
Emit Socket.IO 'sendMessage' with media array
    ↓
Receiver listens on 'receiveMessage'
    ↓
Display media in chat
```

**Key Points:**
- ✅ Use presigned URL for better performance
- ✅ Send image dimensions to backend
- ✅ Check file type & size before upload
- ✅ Show upload progress to user
- ✅ Handle errors gracefully
