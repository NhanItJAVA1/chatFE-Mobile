/**
 * Cache Utilities
 * Helper functions for message caching
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MessagePayload } from '../services/socketService';

const CACHE_KEY_PREFIX = 'chat_messages_v2_';
const CACHE_TIMESTAMP_KEY = (conversationId: string) => `${CACHE_KEY_PREFIX}ts_${conversationId}`;
const CACHE_DATA_KEY = (conversationId: string) => `${CACHE_KEY_PREFIX}${conversationId}`;

/**
 * Save messages to AsyncStorage with timestamp
 */
export async function saveMessagesToCache(
    conversationId: string,
    messages: MessagePayload[]
): Promise<boolean> {
    try {
        if (!conversationId || messages.length === 0) {
            console.warn('[cacheUtils] Skipping save: missing conversationId or messages');
            return false;
        }

        const dataKey = CACHE_DATA_KEY(conversationId);
        const tsKey = CACHE_TIMESTAMP_KEY(conversationId);
        const now = Date.now();

        // Save messages as JSON
        const data = JSON.stringify({
            messages,
            count: messages.length,
            lastMessageId: messages[0]?._id,
        });

        // Use AsyncStorage directly for guaranteed persistence
        await AsyncStorage.setItem(dataKey, data);
        await AsyncStorage.setItem(tsKey, now.toString());

        console.log('[cacheUtils] ✓ Saved', messages.length, 'messages to AsyncStorage for', conversationId);
        return true;
    } catch (error) {
        console.error('[cacheUtils] Failed to save messages to cache:', error);
        return false;
    }
}

/**
 * Load messages from AsyncStorage
 */
export async function loadMessagesFromCache(
    conversationId: string
): Promise<MessagePayload[]> {
    try {
        if (!conversationId) {
            console.warn('[cacheUtils] Cannot load: missing conversationId');
            return [];
        }

        const dataKey = CACHE_DATA_KEY(conversationId);

        // Use AsyncStorage directly
        const cached = await AsyncStorage.getItem(dataKey);

        if (!cached) {
            console.log('[cacheUtils] ℹ No cached messages found for', conversationId);
            return [];
        }

        const parsed = JSON.parse(cached);
        const messages = parsed.messages as MessagePayload[];

        console.log('[cacheUtils] ✓ Loaded', messages.length, 'cached messages for', conversationId);
        return messages;
    } catch (error) {
        console.error('[cacheUtils] Failed to load messages from cache:', error);
        return [];
    }
}

/**
 * Clear messages from cache
 */
export async function clearMessagesCache(conversationId: string): Promise<boolean> {
    try {
        const dataKey = CACHE_DATA_KEY(conversationId);
        const tsKey = CACHE_TIMESTAMP_KEY(conversationId);

        await AsyncStorage.removeItem(dataKey);
        await AsyncStorage.removeItem(tsKey);

        console.log('[cacheUtils] ✓ Cleared cache for', conversationId);
        return true;
    } catch (error) {
        console.error('[cacheUtils] Failed to clear cache:', error);
        return false;
    }
}

/**
 * Get cache info (for debugging)
 */
export async function getCacheInfo(conversationId: string) {
    try {
        const dataKey = CACHE_DATA_KEY(conversationId);
        const tsKey = CACHE_TIMESTAMP_KEY(conversationId);

        const data = await AsyncStorage.getItem(dataKey);
        const ts = await AsyncStorage.getItem(tsKey);

        if (!data || !ts) {
            return null;
        }

        const parsed = JSON.parse(data);
        return {
            conversationId,
            messageCount: parsed.count,
            lastUpdated: new Date(parseInt(ts)).toISOString(),
            lastMessageId: parsed.lastMessageId,
        };
    } catch (error) {
        console.error('[cacheUtils] Failed to get cache info:', error);
        return null;
    }
}

/**
 * Merge cached and API messages intelligently
 * Keep newer messages from API, fill gaps from cache
 */
export function mergeMessages(
    apiMessages: MessagePayload[],
    cachedMessages: MessagePayload[]
): MessagePayload[] {
    if (!apiMessages.length) {
        return cachedMessages;
    }

    if (!cachedMessages.length) {
        return apiMessages;
    }

    // Create a map of API message IDs for quick lookup
    const apiIds = new Set(apiMessages.map(m => m._id));

    // Add cached messages that aren't in API (newer messages)
    const uniqueCached = cachedMessages.filter(m => !apiIds.has(m._id));

    // Combine: API messages first (they're more recent), then unique cached
    const merged = [...apiMessages, ...uniqueCached];

    console.log('[cacheUtils] Merged messages: API=', apiMessages.length, 'Cached=', cachedMessages.length, 'Total=', merged.length);

    return merged;
}
