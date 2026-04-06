import { api } from "./api";
import { authStorage } from "../runtime/storage";
import { getApiBaseUrl } from "../runtime/config";

const readAccessToken = (payload) => {
  return payload?.accessToken || payload?.token || "";
};

const readUserProfile = (payload) => {
  return payload?.user || payload?.profile;
};

export const authService = {
  // Register new user
  register: async (userData) => {
    try {
      const response = await api.post("/auth/register", userData);
      return response;
    } catch (error) {
      throw new Error(error.message || "Registration failed");
    }
  },

  // Login user
  login: async (payload) => {
    try {
      let authData = await api.post("/auth/login", payload);

      // If response is wrapped in { data }, extract it
      if (authData?.data && !authData?.token && !authData?.accessToken) {
        authData = authData.data;
      }

      const accessToken = readAccessToken(authData);

      if (accessToken) {
        console.log("[AUTH] Saving token:", accessToken.substring(0, 20) + "...");
        await authStorage.setItem("token", accessToken);
        if (authData.refreshToken) {
          await authStorage.setItem("refreshToken", authData.refreshToken);
        }
      } else {
        console.warn("[AUTH] No token in login response:", authData);
      }

      const userProfile = readUserProfile(authData);
      if (userProfile) {
        await authStorage.setItem("user", JSON.stringify(userProfile));
      }

      return authData;
    } catch (error) {
      throw new Error(error.message || "Login failed");
    }
  },

  getProfile: async (token) => {
    try {
      // If token is provided, use it directly
      if (token) {
        const url = `${getApiBaseUrl()}/profile`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error(`Profile fetch failed: ${response.status}`);

        const responseData = await response.json();
        console.log("[authService] Profile JSON:", JSON.stringify(responseData, null, 2));

        const profile = responseData.data || responseData;

        // Extract from wrapper if exists
        return profile;
      }

      // Otherwise use api.get which pulls token from storage
      const response = await api.get("/profile");

      // axios interceptor already extracts .data, so response is the profile object
      let profile = response;

      // If somehow still wrapped (shouldn't happen with interceptor)
      if (response.data && typeof response.data === 'object' && (response.data.id || response.data.displayName)) {
        profile = response.data;
      }

      console.log("[authService] Profile JSON (api.get):", JSON.stringify(profile, null, 2));

      // Extract from wrapper if backend returns { data: {...} }
      return profile;
    } catch (error) {
      console.error("[authService] Get profile error:", error);
      throw new Error("Failed to fetch profile");
    }
  },

  saveToken: async (token) => {
    await authStorage.setItem("token", token);
  },

  getToken: async () => {
    return await authStorage.getItem("token");
  },

  saveUser: async (user) => {
    await authStorage.setItem("user", JSON.stringify(user));
  },

  getUser: async () => {
    const user = await authStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },

  // Logout
  async logout() {
    try {
      const refreshToken = await authStorage.getItem("refreshToken");
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken });
      }
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      await authStorage.removeItem("token");
      await authStorage.removeItem("refreshToken");
      await authStorage.removeItem("user");
    }
  },

  // Forgot password
  async forgotPassword(payload) {
    const responseData = await api.post("/auth/forgot-password", payload);
    return responseData;
  },

  // Update password
  async updatePassword(payload) {
    const responseData = await api.patch("/auth/update-password", payload);
    return responseData;
  },

  // Update avatar
  async updateAvatar(avatarUrl) {
    try {
      const response = await axiosInstance.patch("/auth/avatar", {
        avatarUrl,
      });
      return response;
    } catch (error) {
      throw new Error(error.message || "Failed to update avatar");
    }
  },
};
