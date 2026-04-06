import {
  axiosInstance,
  authTokenStorage,
  setAuthTokens,
} from "../api/axios-instance";

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
  /**
   * @param {{ phone: string, password: string }} payload
   */
  async login(payload) {
    const authData = await axiosInstance.post(
      "/auth/login",
      payload,
      publicRequestConfig,
    );

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

  /**
   * @param {{ refreshToken?: string }} [request]
   */
  async logout(request) {
    const refreshToken =
      request?.refreshToken || authTokenStorage.getRefreshToken() || undefined;

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

  /**
   * @param {{ email?: string, phone?: string }} payload
   */
  async forgotPassword(payload) {
    const responseData = await axiosInstance.post(
      "/auth/forgot-password",
      payload,
      publicRequestConfig,
    );
    return responseData;
  },

  /**
   * @param {{ currentPassword?: string, oldPassword?: string, newPassword: string, confirmPassword?: string }} payload
   */
  async updatePassword(payload) {
    const responseData = await axiosInstance.patch(
      "/auth/update-password",
      payload,
    );
    return responseData;
  },
};
