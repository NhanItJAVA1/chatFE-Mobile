import { api } from "../services";
// User cho cache
export type User = {
    id: string;
    name: string;
    avatar?: string;
};
//Map nó lại
const userCache = new Map<string, User>();
export const getUserFromCache = (id: string) => {
    return userCache.get(id);
};

export const setUserToCache = (user: User) => {
    if (!user?.id) return;
    userCache.set(user.id, user);
};

export const setUsersToCache = (users: User[]) => {
    users.forEach(setUserToCache);
};

export const resolveUserName = (
    userId: string,
    members?: User[]
): string | undefined => {

    // 1. cache
    const cached = getUserFromCache(userId);
    if (cached?.name) return cached.name;

    // 2. conversation members
    const member = members?.find(m => m.id === userId);
    if (member) {
        setUserToCache(member);
        return member.name;
    }

    return undefined;
};


export const fetchUserById = async (id: string) => {
    const cached = getUserFromCache(id);
    if (cached) return cached;

    const res = await api.get(`/users/${id}`);
    const user = res?.data || res;

    setUserToCache({
        id: user.id,
        name: user.displayName || user.name,
        avatar: user.avatarUrl || user.avatar,
    });

    return user;
};
