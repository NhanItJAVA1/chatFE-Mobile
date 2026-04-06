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

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/v1";

export const authService = {
  // Register new user (can use fetch or axios)
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Registration failed");
    }

    return await response.json();
  },

  // Login user with axios and proper token management
  login: async (payload) => {
    const authData = await axiosInstance.post("/auth/login", payload, publicRequestConfig);

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

  // Get user profile
  getProfile: async (token) => {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch profile");
    }

    return await response.json();
  },

  // Save token to localStorage
  saveToken: (token) => {
    localStorage.setItem("token", token);
  },

  // Get token from localStorage
  getToken: () => {
    return localStorage.getItem("token");
  },

  // Save user to localStorage
  saveUser: (user) => {
    localStorage.setItem("user", JSON.stringify(user));
  },

  // Get user from localStorage
  getUser: () => {
    const user = localStorage.getItem("user");
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
