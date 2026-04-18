import { api } from "./api";
import { authStorage } from "../runtime/storage";
import type { User } from "@/types";

export const getProfile = async (): Promise<User> => {
    try {
        const response = await api.get("/users/profile");
        return response;
    } catch (error: any) {
        throw new Error(error.message || "Failed to fetch profile");
    }
};

export const getUserById = async (userId: string): Promise<any> => {
    try {
        const response = await api.get(`/users/${userId}`);
        
        // Response wrapped: { status, msg, data: { avatarUrl, displayName, ... } }
        // response.data is the wrapper object, need response.data.data for actual user
        const userData = response.data?.data || response.data || response;
        return userData;
    } catch (error: any) {
        console.warn(`[userService] Failed to fetch user ${userId}:`, error.message);
        return null;
    }
};

export const updateProfile = async (profileData: any): Promise<User> => {
    try {
        const updateData: Record<string, any> = {};

        const allowedFields = [
            "displayName",
            "bio",
            "avatarUrl",
            "email",
            "phone",
            "username",
            "password",
            "privacy",
            "settings",
            "verified",
        ];

        allowedFields.forEach((field) => {
            if (
                profileData.hasOwnProperty(field) &&
                profileData[field] !== undefined
            ) {
                updateData[field] = profileData[field];
            }
        });

        const response = await api.patch("/users/profile", updateData);
        console.log(
            "[userService] PATCH /users/profile request data:",
            JSON.stringify(updateData, null, 2)
        );
        console.log(
            "[userService] PATCH /users/profile response:",
            JSON.stringify(response, null, 2)
        );

        if (response) {
            try {
                const currentUser = await authStorage.getItem("user");
                if (currentUser) {
                    const user = JSON.parse(currentUser);
                    const updatedUser = { ...user, ...updateData };
                    await authStorage.setItem("user", JSON.stringify(updatedUser));
                    console.log(
                        "[userService] Profile updated in storage:",
                        JSON.stringify(updatedUser, null, 2)
                    );
                }
            } catch (parseError: any) {
                console.warn(
                    "[userService] Could not update user in storage:",
                    parseError
                );
            }
        }

        return response;
    } catch (error: any) {
        throw new Error(error.message || "Failed to update profile");
    }
};

export const updateProfileFields = async (fields: any): Promise<User> => {
    return updateProfile(fields);
};

export const updateAvatarViaAuth = async (avatarUrl: string): Promise<any> => {
    try {
        const { authService } = await import("./authService");
        const response = await authService.updateAvatar(avatarUrl);

        if (response) {
            try {
                const currentUser = await authStorage.getItem("user");
                if (currentUser) {
                    const user = JSON.parse(currentUser);
                    const updatedUser = { ...user, avatarUrl };
                    await authStorage.setItem("user", JSON.stringify(updatedUser));
                    console.log(
                        "[userService] Avatar updated in storage:",
                        avatarUrl
                    );
                }
            } catch (parseError: any) {
                console.warn(
                    "[userService] Could not update avatar in storage:",
                    parseError
                );
            }
        }

        return response;
    } catch (error: any) {
        throw new Error(error.message || "Failed to update avatar");
    }
};

export const updateAvatar = async (avatarUrl: string): Promise<User> => {
    return updateProfile({ avatarUrl });
};

export const updateDisplayName = async (
    displayName: string
): Promise<User> => {
    return updateProfile({ displayName });
};

export const updateBio = async (bio: string): Promise<User> => {
    return updateProfile({ bio });
};

export const updatePassword = async (password: string): Promise<User> => {
    return updateProfile({ password });
};

export const updatePrivacy = async (privacy: any): Promise<User> => {
    return updateProfile({ privacy });
};

export const userService = {
    getProfile,
    getUserById,
    updateProfile,
    updateProfileFields,
    updateAvatar,
    updateDisplayName,
    updateBio,
    updatePassword,
    updatePrivacy,
};

export default userService;
