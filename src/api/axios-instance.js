import axios from "axios";
import { authStorage } from "../shared/runtime/storage";
import { getApiBaseUrl } from "../shared/runtime/config";

const ACCESS_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";

// Use authStorage (async) for mobile compatibility
const getAccessToken = async () => {
  return await authStorage.getItem(ACCESS_TOKEN_KEY);
};

const getRefreshToken = async () => {
  return await authStorage.getItem(REFRESH_TOKEN_KEY);
};

const setAccessToken = async (token) => {
  await authStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const setRefreshToken = async (token) => {
  await authStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const setAuthTokens = async ({ accessToken, refreshToken }) => {
  await setAccessToken(accessToken);
  if (refreshToken) {
    await setRefreshToken(refreshToken);
  }
};

export const clearAuthTokens = async () => {
  await authStorage.removeItem(ACCESS_TOKEN_KEY);
  await authStorage.removeItem(REFRESH_TOKEN_KEY);
};

const clearAuthSession = async () => {
  await clearAuthTokens();
  await authStorage.removeItem("user");
};

const notifySessionExpired = () => {
  if (typeof window !== "undefined" && window.dispatchEvent && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:session-expired"));
  }
};

const handleUnauthorized = async () => {
  await clearAuthSession();
  notifySessionExpired();
  // Only redirect in browser environment
  if (typeof window !== "undefined" && window.location) {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }
};

const extractTokens = (response) => {
  const responseData = response.data;
  const accessToken =
    responseData?.data?.accessToken || responseData?.data?.token || responseData?.accessToken || responseData?.token;
  const refreshToken = responseData?.data?.refreshToken || responseData?.refreshToken;

  return {
    accessToken: accessToken || "",
    refreshToken,
  };
};

export const axiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
      return;
    }

    if (token) {
      promise.resolve(token);
    } else {
      promise.reject(new Error("No token available after refresh."));
    }
  });

  failedQueue = [];
};

// Setup async interceptor for request
axiosInstance.interceptors.request.use(
  async (config) => {
    const requestConfig = config;

    if (requestConfig.skipAuth) {
      return requestConfig;
    }

    try {
      const token = await getAccessToken();
      if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn("Failed to get token for request:", err);
    }

    return requestConfig;
  },
  (error) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  (response) => {
    const payload = response?.data;

    if (payload && typeof payload === "object" && "status" in payload) {
      if (payload.status === "success") {
        return payload.data;
      }

      return Promise.reject({
        ...payload,
        message: payload.msg || "Request failed",
      });
    }

    return payload;
  },
  async (error) => {
    const originalRequest = error.config;
    const statusCode = error.response?.status;
    const errorCode = error.response?.data?.code;

    if (errorCode === "UNAUTHORIZED" && (!originalRequest || originalRequest._retry)) {
      await handleUnauthorized();
      return Promise.reject(error);
    }

    if (!originalRequest || statusCode !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (newToken) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(axiosInstance(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await handleUnauthorized();
        throw new Error("Missing refresh token.");
      }

      const refreshResponse = await axios.post(`${getApiBaseUrl()}/auth/refresh`, {
        refreshToken,
      });

      const newTokens = extractTokens(refreshResponse);
      if (!newTokens.accessToken) {
        throw new Error("Invalid refresh token response.");
      }

      await setAccessToken(newTokens.accessToken);
      if (newTokens.refreshToken) {
        await setRefreshToken(newTokens.refreshToken);
      }

      processQueue(null, newTokens.accessToken);

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;

      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await handleUnauthorized();

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export const authTokenStorage = {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearAuthTokens,
};
