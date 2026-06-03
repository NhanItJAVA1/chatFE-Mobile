import { api } from "./api";
import { authStorage } from "../runtime/storage";
import { getApiBaseUrl } from "../runtime/config";
import type { AuthResponse, User } from "@/types";

const readAccessToken = (payload: any): string => {
    return payload?.accessToken || payload?.access_token || payload?.token || "";
};

const readUserProfile = (payload: any): User | null => {
    return payload?.user || payload?.profile || null;
};

const unwrapAuthPayload = (payload: any): any => {
    if (payload?.data && !readAccessToken(payload) && !readUserProfile(payload)) {
        return payload.data;
    }

    return payload;
};

const persistAuthPayload = async (payload: any): Promise<void> => {
    const accessToken = readAccessToken(payload);

    if (accessToken) {
        console.log("[AUTH] Saving token:", accessToken.substring(0, 20) + "...");
        await authStorage.setItem("token", accessToken);
        if (payload.refreshToken) {
            await authStorage.setItem("refreshToken", payload.refreshToken);
        }
    } else {
        console.warn("[AUTH] No token in auth response:", payload);
    }

    const userProfile = readUserProfile(payload);
    if (userProfile) {
        await authStorage.setItem("user", JSON.stringify(userProfile));
    }
};

export const authService = {
    register: async (userData: any): Promise<AuthResponse> => {
        try {
            const response = await api.post("/auth/register", userData);
            const authData = unwrapAuthPayload(response);

            if (!authData?.pendingVerification) {
                await persistAuthPayload(authData);
            }

            return authData;
        } catch (error: any) {
            throw new Error(error.message || "Registration failed");
        }
    },

    login: async (payload: any): Promise<AuthResponse> => {
        try {
            const response = await api.post("/auth/login", payload);
            const authData = unwrapAuthPayload(response);
            await persistAuthPayload(authData);

            return authData;
        } catch (error: any) {
            throw new Error(error.message || "Login failed");
        }
    },

    getProfile: async (token?: string): Promise<User> => {
        try {
            if (token) {
                const url = `${getApiBaseUrl()}/users/me/profile`;
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok)
                    throw new Error(`Profile fetch failed: ${response.status}`);

                const responseData = await response.json();
                console.log(
                    "[authService] Profile JSON:",
                    JSON.stringify(responseData, null, 2)
                );

                const profile = responseData.data || responseData;
                return profile;
            }

            const response = await api.get("/users/me/profile");
            let profile = response;

            if (
                response.data &&
                typeof response.data === "object" &&
                (response.data.id || response.data.displayName)
            ) {
                profile = response.data;
            }

            console.log(
                "[authService] Profile JSON (api.get):",
                JSON.stringify(profile, null, 2)
            );

            return profile;
        } catch (error: any) {
            console.error("[authService] Get profile error:", error);
            throw new Error("Failed to fetch profile");
        }
    },

    saveToken: async (token: string): Promise<void> => {
        await authStorage.setItem("token", token);
    },

    getToken: async (): Promise<string | null> => {
        return await authStorage.getItem("token");
    },

    saveUser: async (user: User): Promise<void> => {
        await authStorage.setItem("user", JSON.stringify(user));
    },

    getUser: async (): Promise<User | null> => {
        const user = await authStorage.getItem("user");
        return user ? JSON.parse(user) : null;
    },

    logout: async (): Promise<void> => {
        try {
            const refreshToken = await authStorage.getItem("refreshToken");
            if (refreshToken) {
                await api.post("/auth/logout", { refreshToken });
            }
        } catch (error: any) {
            console.error("Logout failed:", error);
        } finally {
            await authStorage.removeItem("token");
            await authStorage.removeItem("refreshToken");
            await authStorage.removeItem("user");
        }
    },

    forgotPassword: async (payload: any): Promise<any> => {
        const responseData = await api.post("/auth/forgot-password", payload);
        return responseData;
    },

    updatePassword: async (payload: any): Promise<any> => {
        const responseData = await api.post("/auth/change-password", payload);
        return responseData;
    },

    updateAvatar: async (avatarUrl: string): Promise<any> => {
        try {
            const response = await api.patch("/auth/avatar", {
                avatarUrl,
            });
            return response;
        } catch (error: any) {
            throw new Error(error.message || "Failed to update avatar");
        }
    },

    refreshAccessToken: async (): Promise<string> => {
        try {
            const refreshToken = await authStorage.getItem("refreshToken");
            if (!refreshToken) {
                throw new Error("No refresh token available");
            }

            const response = await api.post("/auth/refresh", { refreshToken });
            const payload = response?.data || response;
            const newToken = payload?.accessToken || payload?.token;

            if (newToken) {
                await authStorage.setItem("token", newToken);
                if (payload?.refreshToken) {
                    await authStorage.setItem("refreshToken", payload.refreshToken);
                }
                return newToken;
            }

            throw new Error("No token in refresh response");
        } catch (error: any) {
            throw new Error(error.message || "Token refresh failed");
        }
    },
};
