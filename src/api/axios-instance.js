import axios from "axios";

const API_BASE_URL = "/v1";

const ACCESS_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";

const getAccessToken = () => {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

const getRefreshToken = () => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

const setAccessToken = (token) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const setRefreshToken = (token) => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const setAuthTokens = ({ accessToken, refreshToken }) => {
  setAccessToken(accessToken);
  if (refreshToken) {
    setRefreshToken(refreshToken);
  }
};

export const clearAuthTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const clearAuthSession = () => {
  clearAuthTokens();
  localStorage.removeItem("user");
};

const redirectToLogin = () => {
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};

const handleUnauthorized = () => {
  clearAuthSession();
  window.dispatchEvent(new CustomEvent("auth:session-expired"));
  redirectToLogin();
};

const extractTokens = (response) => {
  const responseData = response.data;
  const accessToken =
    responseData?.data?.accessToken ||
    responseData?.data?.token ||
    responseData?.accessToken ||
    responseData?.token;
  const refreshToken =
    responseData?.data?.refreshToken || responseData?.refreshToken;

  return {
    accessToken: accessToken || "",
    refreshToken,
  };
};

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
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

axiosInstance.interceptors.request.use(
  (config) => {
    const requestConfig = config;

    if (requestConfig.skipAuth) {
      return requestConfig;
    }

    const token = getAccessToken();
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
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

    if (
      errorCode === "UNAUTHORIZED" &&
      (!originalRequest || originalRequest._retry)
    ) {
      handleUnauthorized();
      return Promise.reject(error);
    }

    if (!originalRequest || statusCode !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/refresh-token")
    ) {
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
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        handleUnauthorized();
        throw new Error("Missing refresh token.");
      }

      const refreshResponse = await axios.post(
        `${API_BASE_URL}/auth/refresh-token`,
        {
          refreshToken,
        },
      );

      const newTokens = extractTokens(refreshResponse);
      if (!newTokens.accessToken) {
        throw new Error("Invalid refresh token response.");
      }

      setAccessToken(newTokens.accessToken);
      if (newTokens.refreshToken) {
        setRefreshToken(newTokens.refreshToken);
      }

      processQueue(null, newTokens.accessToken);

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;

      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      handleUnauthorized();

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
