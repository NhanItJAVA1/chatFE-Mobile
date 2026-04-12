/**
 * Message Cache Service
 * Persists messages to device storage (AsyncStorage / localStorage)
 * so they survive app cache clear and offline browsing
 */

import { authStorage } from '../runtime/storage';
import type { MessagePayload } from './socketService';

const MESSAGES_CACHE_KEY_PREFIX = 'chat_messages_';
const MESSAGE_METADATA_KEY = 'message_metadata_';

interface MessageMetadata {
    conversationId: string;
    lastUpdated: number;
    messageCount: number;
    lastMessageId: string;
}

class MessageCacheService {
    /**
     * Get cache key for a conversation
     */
    private getCacheKey(conversationId: string): string {
        return `${MESSAGES_CACHE_KEY_PREFIX}${conversationId}`;
    }

    /**
     * Get metadata key for a conversation
     */
    private getMetadataKey(conversationId: string): string {
        return `${MESSAGE_METADATA_KEY}${conversationId}`;
    }

    /**
     * Save messages to device storage
     */
    async saveMessages(conversationId: string, messages: MessagePayload[]): Promise<void> {
        try {
            if (!conversationId || messages.length === 0) {
                console.warn('[messageCacheService] Skipping save: conversationId or messages empty', { conversationId, messageCount: messages.length });
                return;
            }

            const cacheKey = this.getCacheKey(conversationId);
            const metadataKey = this.getMetadataKey(conversationId);

            console.log('[messageCacheService] Saving', messages.length, 'messages with key:', cacheKey);

            // Save messages
            const messageJson = JSON.stringify(messages);
            console.log('[messageCacheService] Message JSON size:', messageJson.length, 'bytes');

            await authStorage.setItem(cacheKey, messageJson);
            console.log('[messageCacheService] ✓ Messages saved to storage');

            // Save metadata
            const metadata: MessageMetadata = {
                conversationId,
                lastUpdated: Date.now(),
                messageCount: messages.length,
                lastMessageId: messages[0]?._id || '',
            };
            const metadataJson = JSON.stringify(metadata);
            await authStorage.setItem(metadataKey, metadataJson);
            console.log('[messageCacheService] ✓ Metadata saved:', metadata);

            console.log('[messageCacheService] ✓✓ All data saved successfully for conversation', conversationId);
        } catch (error: any) {
            console.error('[messageCacheService] FAILED to save messages:', error.message);
            console.error('[messageCacheService] Error stack:', error.stack);
        }
    }

    /**
     * Load cached messages from device storage
     */
    async getMessages(conversationId: string): Promise<MessagePayload[]> {
        try {
            if (!conversationId) {
                console.warn('[messageCacheService] Cannot load: empty conversationId');
                return [];
            }

            const cacheKey = this.getCacheKey(conversationId);
            console.log('[messageCacheService] Loading with key:', cacheKey);

            const cached = await authStorage.getItem(cacheKey);

            if (!cached) {
                console.log('[messageCacheService] ℹ No cached data found for key:', cacheKey);
                return [];
            }

            console.log('[messageCacheService] ✓ Found cached data, size:', cached.length, 'bytes');
            const messages = JSON.parse(cached) as MessagePayload[];
            console.log('[messageCacheService] ✓ Loaded', messages.length, 'cached messages for conversation', conversationId);
            return messages;
        } catch (error: any) {
            console.error('[messageCacheService] FAILED to load cached messages:', error.message);
            console.error('[messageCacheService] Error stack:', error.stack);
            return [];
        }
    }

    /**
     * Add new message to cache (or update existing)
     */
    async addMessage(conversationId: string, message: MessagePayload): Promise<void> {
        try {
            const messages = await this.getMessages(conversationId);

            // Check if message already exists (update case)
            const existingIndex = messages.findIndex(m => m._id === message._id);

            if (existingIndex !== -1) {
                messages[existingIndex] = message;
                console.log('[messageCacheService] ✓ Updated existing message ID:', message._id);
            } else {
                // Add new message at the beginning (most recent first)
                messages.unshift(message);
                console.log('[messageCacheService] ✓ Added new message ID:', message._id, 'Total messages now:', messages.length);
            }

            await this.saveMessages(conversationId, messages);
        } catch (error: any) {
            console.error('[messageCacheService] FAILED to add message:', error.message);
            console.error('[messageCacheService] Error stack:', error.stack);
        }
    }

    /**
     * Clear all cached messages for a conversation
     */
    async clearMessages(conversationId: string): Promise<void> {
        try {
            const cacheKey = this.getCacheKey(conversationId);
            const metadataKey = this.getMetadataKey(conversationId);

            await authStorage.removeItem(cacheKey);
            await authStorage.removeItem(metadataKey);

            console.log('[messageCacheService] Cleared cached messages for conversation', conversationId);
        } catch (error: any) {
            console.error('[messageCacheService] Failed to clear messages:', error);
        }
    }

    /**
     * Get metadata about cached messages
     */
    async getMetadata(conversationId: string): Promise<MessageMetadata | null> {
        try {
            const metadataKey = this.getMetadataKey(conversationId);
            const cached = await authStorage.getItem(metadataKey);

            if (!cached) {
                return null;
            }

            return JSON.parse(cached) as MessageMetadata;
        } catch (error: any) {
            console.error('[messageCacheService] Failed to get metadata:', error);
            return null;
        }
    }
}

export default new MessageCacheService();
