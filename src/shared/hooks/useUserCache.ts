import { useState, useEffect, useCallback } from "react";
import { 
    getUserFromCache, 
    setUserToCache, 
    fetchUserById, 
    subscribeToUserCache,
    User 
} from "../cache/userCache";

/**
 * Hook to access and manage user data with global reactivity.
 * @param userId Optional ID to automatically fetch and watch a specific user
 */
export const useUserCache = (userId?: string) => {
    const [user, setUser] = useState<User | undefined>(
        userId ? getUserFromCache(userId) : undefined
    );
    const [loading, setLoading] = useState(false);

    // Update local state when cache changes
    useEffect(() => {
        const unsubscribe = subscribeToUserCache((updatedId, updatedUser) => {
            if (updatedId === userId) {
                setUser(updatedUser);
            }
        });

        // Initialize state
        if (userId) {
            const cached = getUserFromCache(userId);
            if (cached) {
                setUser(cached);
            } else {
                // Auto-fetch if not cached
                setLoading(true);
                fetchUserById(userId).finally(() => setLoading(false));
            }
        }

        return unsubscribe;
    }, [userId]);

    const getUser = useCallback(async (id: string) => {
        return await fetchUserById(id);
    }, []);

    const updateUser = useCallback((newUser: User) => {
        setUserToCache(newUser);
    }, []);

    return {
        user,
        loading,
        getUser,
        updateUser,
        getUserFromCache,
        setUserToCache
    };
};
