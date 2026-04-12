# 📸 Chat Media Format & Upload Guide

## 🎯 Tổng quan

Để gửi **ảnh, video, file, audio** trong chat real-time 2 bước:

1. **Upload file** → lấy URL từ S3
2. **Format media** theo backend spec → gửi qua Socket.IO

---

## 📋 Media Format Specification

### Backend expects MediaAttachment format:

```typescript
interface MediaAttachment {
  url: string;            // S3 URL từ upload
  filename: string;       // Tên file (photo.jpg)
  mimetype: string;       // MIME type (image/jpeg) ⚠️ MUST HAVE
  size: number;           // File size in bytes
}
```

### ❌ WRONG - FE không nên gửi:
```typescript
{
  url: "https://...",
  name: "photo.jpg",      // ❌ Should be "filename"
  mediaType: "image",     // ❌ Should be "mimetype"
  size: 1024
}
```

### ✅ RIGHT - FE phải gửi:
```typescript
{
  url: "https://...",
  filename: "photo.jpg",  // ✅ Correct field name
  mimetype: "image/jpeg", // ✅ Full MIME type (not just "image")
  size: 1024000           // ✅ File size in bytes
}
```

---

## 🛠️ Implementation

### Step 1: MIME Type Helper

**File:** `utils/mimeTypes.ts`

```typescript
export const MIME_TYPE_MAP: Record<string, string> = {
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  
  // Videos
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'mpeg': 'video/mpeg',
  'mov': 'video/quicktime',
  
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  
  // Documents
  'pdf': 'application/pdf',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'doc': 'application/msword',
};

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

/**
 * Get MIME type from File object
 */
export function getMimeType(file: File): string {
  // Prefer file.type if available (most reliable)
  if (file.type) {
    return file.type;
  }
  // Fallback to extension
  return getMimeTypeFromFilename(file.name);
}
```

---

### Step 2: Media Upload Service

**File:** `services/mediaUploadService.ts`

```typescript
import { getMimeType, getMimeTypeFromFilename } from '@/utils/mimeTypes';
import { MediaFileType, PresignedUrlResponse } from '@/types/media';

const API_BASE = 'http://192.168.1.6:3000';

interface MediaAttachment {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

class MediaUploadService {
  
  /**
   * Request presigned URL from backend
   */
  async requestPresignedUrl(
    token: string,
    file: File,
    fileType: MediaFileType
  ): Promise<PresignedUrlResponse> {
    const response = await fetch(
      `${API_BASE}/v1/media/request-upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileType,
          mimeType: getMimeType(file),
          fileSize: file.size,
          originalName: file.name,
          expiresIn: 300,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get presigned URL');
    }

    return response.json();
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadToS3(
    presignedUrl: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent);
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Extract base URL (remove query params)
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
      xhr.setRequestHeader('Content-Type', getMimeType(file));
      xhr.send(file);
    });
  }

  /**
   * Confirm upload to backend
   */
  async confirmUpload(token: string, fileId: string): Promise<void> {
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
   * Full upload flow: Request presigned URL → Upload → Confirm
   * Returns MediaAttachment in backend format
   */
  async upload(
    token: string,
    file: File,
    fileType: MediaFileType,
    onProgress?: (percent: number) => void
  ): Promise<MediaAttachment> {
    try {
      console.log('📝 Requesting presigned URL...');
      const presignedData = await this.requestPresignedUrl(token, file, fileType);

      console.log('📤 Uploading to S3...');
      const url = await this.uploadToS3(
        presignedData.presignedUrl,
        file,
        onProgress
      );

      console.log('🔔 Confirming upload...');
      await this.confirmUpload(token, presignedData.fileId);

      // ✅ Return in correct MediaAttachment format
      const mediaAttachment: MediaAttachment = {
        url,
        filename: file.name,
        mimetype: getMimeType(file),
        size: file.size,
      };

      console.log('✅ Upload complete:', mediaAttachment);
      return mediaAttachment;
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }
}

export default new MediaUploadService();
```

---

### Step 3: Chat Service (Socket.IO)

**File:** `services/chatService.ts`

```typescript
import FriendSocketService from '@/services/friendSocket';
import mediaUploadService from '@/services/mediaUploadService';
import { MediaFileType } from '@/types/media';

interface MediaAttachment {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

class ChatService {
  
  /**
   * Send message with media array
   * Media must be in MediaAttachment format
   */
  sendMessageWithMedia(
    conversationId: string,
    text: string | undefined,
    mediaArray: MediaAttachment[],  // ✅ Correct format
    callback?: (response: any) => void
  ): void {
    const socket = FriendSocketService.getSocket();
    
    if (!socket) {
      console.error('Socket not connected');
      if (callback) callback({ success: false, error: 'Socket not connected' });
      return;
    }

    // ✅ Payload in correct format
    const payload = {
      conversationId,
      text: text || undefined,
      media: mediaArray,  // Array of MediaAttachment
    };

    console.log('📤 Sending message with media:', payload);
    
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
   * Send image
   */
  async sendImage(
    token: string,
    conversationId: string,
    imageFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      // Upload and get MediaAttachment
      const mediaAttachment = await mediaUploadService.upload(
        token,
        imageFile,
        'IMAGE',
        onProgress
      );

      // Send via Socket
      this.sendMessageWithMedia(conversationId, caption, [mediaAttachment]);
    } catch (error) {
      console.error('Failed to send image:', error);
      throw error;
    }
  }

  /**
   * Send video
   */
  async sendVideo(
    token: string,
    conversationId: string,
    videoFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      const mediaAttachment = await mediaUploadService.upload(
        token,
        videoFile,
        'VIDEO',
        onProgress
      );

      this.sendMessageWithMedia(conversationId, caption, [mediaAttachment]);
    } catch (error) {
      console.error('Failed to send video:', error);
      throw error;
    }
  }

  /**
   * Send file/document
   */
  async sendFile(
    token: string,
    conversationId: string,
    file: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      const mediaAttachment = await mediaUploadService.upload(
        token,
        file,
        'DOCUMENT',
        onProgress
      );

      this.sendMessageWithMedia(conversationId, caption, [mediaAttachment]);
    } catch (error) {
      console.error('Failed to send file:', error);
      throw error;
    }
  }

  /**
   * Send audio
   */
  async sendAudio(
    token: string,
    conversationId: string,
    audioFile: File,
    caption?: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    try {
      const mediaAttachment = await mediaUploadService.upload(
        token,
        audioFile,
        'AUDIO',
        onProgress
      );

      this.sendMessageWithMedia(conversationId, caption, [mediaAttachment]);
    } catch (error) {
      console.error('Failed to send audio:', error);
      throw error;
    }
  }
}

export default new ChatService();
```

---

### Step 4: React Native Component

**File:** `screens/ChatScreen.tsx`

```typescript
import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
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

  const handleSendImage = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo' });

      if (!result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri || !asset.type || !asset.fileName) {
        Alert.alert('Error', 'Invalid image');
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      // Create File object from asset
      const file = new File([asset.uri], asset.fileName, { type: asset.type });

      // Send image (handles upload + Socket.IO)
      await ChatService.sendImage(
        token,
        conversationId,
        file,
        text || undefined,
        (progress) => setUploadProgress(progress)
      );

      setText('');
      Alert.alert('Success', 'Image sent!');
    } catch (error) {
      Alert.alert('Error', `Failed to send image: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSendVideo = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'video' });

      if (!result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri || !asset.type || !asset.fileName) {
        Alert.alert('Error', 'Invalid video');
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
    } catch (error) {
      Alert.alert('Error', `Failed to send video: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Messages list */}
      
      {/* Upload progress */}
      {uploading && <ProgressBar progress={uploadProgress} />}

      {/* Input area */}
      <View style={{ flexDirection: 'row', padding: 10 }}>
        <TouchableOpacity onPress={handleSendImage} disabled={uploading}>
          <Text>🖼️</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSendVideo} disabled={uploading}>
          <Text>🎥</Text>
        </TouchableOpacity>

        <TextInput
          style={{ flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 }}
          placeholder="Type a message..."
          value={text}
          onChangeText={setText}
          editable={!uploading}
        />

        <TouchableOpacity onPress={() => ChatService.sendMessageWithMedia(conversationId, text, [])}>
          <Text>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ChatScreen;
```

---

## 📊 Complete Flow

```
User picks file
    ↓
mediaUploadService.upload()
    ├─ Request presigned URL
    ├─ Upload to S3
    ├─ Confirm upload
    └─ Return MediaAttachment {url, filename, mimetype, size}
    ↓
ChatService.sendImage() / sendVideo() / sendFile() / sendAudio()
    ↓
emit 'sendMessage' via Socket.IO with MediaAttachment array
    ↓
Backend validates + saves message
    ↓
Receiver gets 'receiveMessage' event
    ↓
Display media in chat
```

---

## ✅ Testing Checklist

- [ ] **Upload presigned URL** (request endpoint)
- [ ] **Put to S3** (upload file)
- [ ] **Confirm upload** (mark as ready)
- [ ] **Media format correct:**
  - [ ] `filename` (not `name`)
  - [ ] `mimetype` (full MIME type, not just "image")
  - [ ] `url` (S3 path)
  - [ ] `size` (in bytes)
- [ ] **Socket.IO emit** (sendMessage with media array)
- [ ] **Receive message** (emit receiveMessage)
- [ ] **Display media** (show in chat)

---

## 🐛 Common Errors & Debug

### Error: "Invalid data" 

**Cause:** Media format mismatch

**Debug:**
```typescript
console.log('📤 Payload:', JSON.stringify(payload, null, 2));

// Should show:
{
  "conversationId": "...",
  "text": "...",
  "media": [
    {
      "url": "https://...",
      "filename": "photo.jpg",     // ✅ Not "name"
      "mimetype": "image/jpeg",    // ✅ Not "image"
      "size": 1024000
    }
  ]
}
```

### Error: "MIME type not allowed"

**Cause:** MIME type doesn't match file

**Fix:** Use correct MIME type:
```typescript
const mimeType = getMimeType(file);  // Prefer file.type
console.log('MIME:', mimeType);      // Should be "image/jpeg", not "image"
```

### Error: "Presigned URL expired"

**Cause:** Upload took > 5 minutes

**Fix:** Increase `expiresIn`:
```typescript
await this.requestPresignedUrl(token, file, {
  // ...
  expiresIn: 600,  // 10 minutes instead of 5
});
```

---

## 📝 File Structure

```
src/
├── services/
│   ├── mediaUploadService.ts .... ✅ Upload logic
│   └── chatService.ts ........... ✅ Socket.IO send
├── utils/
│   └── mimeTypes.ts ............ ✅ MIME type helper
├── types/
│   └── media.ts ............... ✅ Type definitions
└── screens/
    └── ChatScreen.tsx ......... ✅ UI component
```

---

## 🎯 Key Points

✅ **Always include `mimetype`** - Backend validation requires it
✅ **Use `filename` not `name`** - Backend field naming
✅ **Get MIME type from File object first** - More reliable than extension
✅ **Confirm upload** - Tells backend file is ready
✅ **Handle progress** - Better UX for large files
✅ **Proper error handling** - Show user what went wrong

---

## 📞 Support

If "Invalid data" error:
1. Check socket payload format
2. Verify MIME type is not "image", should be "image/jpeg"
3. Ensure all 4 fields present: url, filename, mimetype, size
4. Check backend logs for specific validation error
