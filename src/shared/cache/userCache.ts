import { api } from "../services";

export type User = {
    id: string;
    name: string;
    avatar?: string;
};

// Global cache store
const cache: Record<string, User> = {};

// Track pending requests to prevent duplicate API calls
const pendingRequests: Record<string, Promise<User | null>> = {};

// Listeners for reactivity
type CacheListener = (userId: string, user: User) => void;
const listeners = new Set<CacheListener>();

export const getUserFromCache = (id: string): User | undefined => {
    return cache[id];
};

export const setUserToCache = (user: User) => {
    if (!user?.id) return;
    cache[user.id] = user;
    // Notify listeners
    listeners.forEach(listener => listener(user.id, user));
};

export const setUsersToCache = (users: User[]) => {
    users.forEach(setUserToCache);
};

export const subscribeToUserCache = (listener: CacheListener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/**
 * Fetch user by ID with cache-first strategy and duplicate request prevention.
 */
export const fetchUserById = async (id: string): Promise<User | null> => {
    // 1. Check cache
    const cached = getUserFromCache(id);
    if (cached) return cached;

    // 2. Check if already fetching
    if (pendingRequests[id]) return pendingRequests[id];

    // 3. Perform API call
    pendingRequests[id] = (async () => {
        try {
            const res = await api.get(`/users/${id}`);
            const userData = res?.data?.data || res?.data || res;
            
            if (userData) {
                const user: User = {
                    id: userData.id || id,
                    name: userData.displayName || userData.name || "Unknown",
                    avatar: userData.avatarUrl || userData.avatar,
                };
                setUserToCache(user);
                return user;
            }
            return null;
        } catch (error) {
            console.warn(`[userCache] Failed to fetch user ${id}:`, error);
            return null;
        } finally {
            delete pendingRequests[id];
        }
    })();

    return pendingRequests[id];
};

/**
 * Legacy support for simple name resolution
 */
export const resolveUserName = (userId: string): string | undefined => {
    return getUserFromCache(userId)?.name;
};
