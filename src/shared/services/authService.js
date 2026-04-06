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
      console.log("[authService] Login response from server:", JSON.stringify(authData, null, 2));

      // If response is wrapped in { data }, extract it
      if (authData?.data && !authData?.token && !authData?.accessToken) {
        authData = authData.data;
      }

      console.log("[AUTH] Processed login data:", JSON.stringify(authData, null, 2));

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
      console.log("[AUTH] User profile extracted:", JSON.stringify(userProfile, null, 2));
      
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
        console.log("Profile response:", responseData);

        // Extract from wrapper if exists
        return responseData.data || responseData;
      }

      // Otherwise use api.get which pulls token from storage
      const response = await api.get("/profile");
      // Extract from wrapper if backend returns { data: {...} }
      return response.data || response;
    } catch (error) {
      console.error("Get profile error:", error);
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
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch (e) {
      console.error("[AUTH] Failed to parse stored user:", e);
      return null;
    }
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

  // Update profile
  async updateProfile(profileData) {
    try {
      console.log("[AUTH] Updating profile with:", profileData);

      // Get current user to preserve all existing fields
      const currentUser = await authStorage.getItem("user");
      const parsedUser = currentUser ? JSON.parse(currentUser) : {};

      // Merge: backend data takes precedence, fallback to current data
      const updatedUser = { ...parsedUser, ...profileData };

      // Save merged data to local storage first (offline support)
      await authStorage.setItem("user", JSON.stringify(updatedUser));
      console.log("[AUTH] Profile saved to local storage ✅", JSON.stringify(updatedUser, null, 2));

      // Try to sync to backend (optional - doesn't block the save)
      try {
        const response = await api.patch("/profile", profileData);
        console.log("[AUTH] Backend response:", JSON.stringify(response, null, 2));
        
        const syncedUser = response?.user || response?.data || response;
        console.log("[AUTH] Synced user:", JSON.stringify(syncedUser, null, 2));

        if (syncedUser && typeof syncedUser === 'object') {
          // Backend response takes full priority - store exactly what backend returns
          await authStorage.setItem("user", JSON.stringify(syncedUser));
          console.log("[AUTH] Profile synced to backend ✅", JSON.stringify(syncedUser, null, 2));
          return syncedUser;
        } else {
          // If no user data in response, return locally merged data
          return updatedUser;
        }
      } catch (apiError) {
        console.warn("[AUTH] Backend sync failed (working offline):", apiError.message);
        // Still return the locally merged data - offline first approach
        return updatedUser;
      }
    } catch (error) {
      console.error("[AUTH] Update profile error:", error.message);
      throw new Error(error.message || "Failed to update profile");
    }
  },

  // Refresh access token using refresh token
  async refreshAccessToken() {
    try {
      console.log("[AUTH] Attempting to refresh token...");
      const refreshToken = await authStorage.getItem("refreshToken");
      
      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const url = `${getApiBaseUrl()}/auth/refresh-token`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();
      const newAccessToken = data?.token || data?.accessToken || data?.data?.token;

      if (!newAccessToken) {
        throw new Error("No token in refresh response");
      }

      await authStorage.setItem("token", newAccessToken);
      console.log("[AUTH] Token refreshed successfully ✅");
      return newAccessToken;
    } catch (error) {
      console.error("[AUTH] Token refresh failed:", error.message);
      // Clear tokens on refresh failure
      await authStorage.removeItem("token");
      await authStorage.removeItem("refreshToken");
      throw new Error("Session expired - please login again");
    }
  }
};
