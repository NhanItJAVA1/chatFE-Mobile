import { axiosInstance, authTokenStorage, setAuthTokens } from "../../api/axios-instance";

const publicRequestConfig = {
  skipAuth: true,
};

const readAccessToken = (payload) => {
  return payload?.accessToken || payload?.token || "";
};

const readUserProfile = (payload) => {
  return payload?.user || payload?.profile;
};

export const authService = {
  // Register new user with axios
  register: async (userData) => {
    try {
      const response = await axiosInstance.post("/auth/register", userData, publicRequestConfig);
      return response;
    } catch (error) {
      throw new Error(error.message || "Registration failed");
    }
  },

  // Login user with axios and proper token management
  login: async (payload) => {
    const authData = await axiosInstance.post("/auth/login", payload, { ...publicRequestConfig });

    const accessToken = readAccessToken(authData);

    if (accessToken) {
      setAuthTokens({
        accessToken,
        refreshToken: authData.refreshToken,
      });
    }

    const userProfile = readUserProfile(authData);
    if (userProfile) {
      localStorage.setItem("user", JSON.stringify(userProfile));
    }

    return authData;
  },

  getProfile: async (token) => {
    try {
      const response = await axiosInstance.get("/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response;
    } catch (error) {
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
  async logout(request) {
    const refreshToken = request?.refreshToken || authTokenStorage.getRefreshToken() || undefined;

    try {
      const responseData = await axiosInstance.post(
        "/auth/logout",
        { refreshToken },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return responseData;
    } finally {
      authTokenStorage.clearAuthTokens();
      localStorage.removeItem("user");
    }
  },

  // Forgot password
  async forgotPassword(payload) {
    const responseData = await axiosInstance.post("/auth/forgot-password", payload, publicRequestConfig);
    return responseData;
  },

  // Update password
  async updatePassword(payload) {
    const responseData = await axiosInstance.patch("/auth/update-password", payload);
    return responseData;
  },
};
