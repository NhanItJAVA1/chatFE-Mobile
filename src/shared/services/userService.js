import { api } from "./api";
import { authStorage } from "../runtime/storage";

/**
 * Lấy thông tin profile của user hiện tại
 * @returns {Promise<Object>} User profile data
 */
export const getProfile = async () => {
  try {
    const response = await api.get("/profile");
    return response;
  } catch (error) {
    throw new Error(error.message || "Failed to fetch profile");
  }
};

/**
 * Cập nhật toàn bộ thông tin profile của user
 * @param {Object} profileData - Dữ liệu profile cần cập nhật
 *   - displayName: string - Tên hiển thị
 *   - bio: string - Tiểu sử
 *   - avatarUrl: string - URL ảnh đại diện
 *   - email: string - Email
 *   - phone: string - Số điện thoại
 *   - username: string - Tên người dùng
 *   - password: string - Mật khẩu (nếu muốn đổi)
 *   - privacy: Object - Cài đặt quyền riêng tư
 *   - settings: Object - Cài đặt khác
 * @returns {Promise<Object>} Response data
 */
export const updateProfile = async (profileData) => {
  try {
    // Validate và chuẩn bị dữ liệu
    const updateData = {};

    // Chỉ gồm các field được phép cập nhật
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
      if (profileData.hasOwnProperty(field) && profileData[field] !== undefined) {
        updateData[field] = profileData[field];
      }
    });

    const response = await api.patch("/profile", updateData);
    console.log("[userService] PATCH /profile request data:", JSON.stringify(updateData, null, 2));
    console.log("[userService] PATCH /profile response:", JSON.stringify(response, null, 2));

    // Cập nhật storage với dữ liệu mới (thay vì localStorage để compatible với mobile)
    if (response) {
      try {
        const currentUser = await authStorage.getItem("user");
        if (currentUser) {
          const user = JSON.parse(currentUser);
          const updatedUser = { ...user, ...updateData };
          await authStorage.setItem("user", JSON.stringify(updatedUser));
          console.log("[userService] Profile updated in storage:", JSON.stringify(updatedUser, null, 2));
        }
      } catch (parseError) {
        console.warn("[userService] Could not update user in storage:", parseError);
      }
    }

    return response;
  } catch (error) {
    throw new Error(error.message || "Failed to update profile");
  }
};

/**
 * Cập nhật các field cụ thể của profile
 * @param {Object} fields - Các field cần cập nhật (ví dụ: {displayName: 'New Name', bio: 'New Bio'})
 * @returns {Promise<Object>} Response data
 */
export const updateProfileFields = async (fields) => {
  return updateProfile(fields);
};

/**
 * Cập nhật avatar qua endpoint /auth/avatar
 * @param {string} avatarUrl - URL của ảnh đại diện mới
 * @returns {Promise<Object>} Response data
 */
export const updateAvatarViaAuth = async (avatarUrl) => {
  try {
    const { authService } = await import("./authService");
    const response = await authService.updateAvatar(avatarUrl);

    // Cập nhật storage với dữ liệu mới (AsyncStorage thay vì localStorage)
    if (response) {
      try {
        const currentUser = await authStorage.getItem("user");
        if (currentUser) {
          const user = JSON.parse(currentUser);
          const updatedUser = { ...user, avatarUrl };
          await authStorage.setItem("user", JSON.stringify(updatedUser));
          console.log("[userService] Avatar updated in storage:", avatarUrl);
        }
      } catch (parseError) {
        console.warn("[userService] Could not update avatar in storage:", parseError);
      }
    }

    return response;
  } catch (error) {
    throw new Error(error.message || "Failed to update avatar");
  }
};

/**
 * Cập nhật avatar (backwards compatibility - uses profile endpoint)
 * @param {string} avatarUrl - URL của ảnh đại diện mới
 * @returns {Promise<Object>} Response data
 */
export const updateAvatar = async (avatarUrl) => {
  return updateProfile({ avatarUrl });
};

/**
 * Cập nhật tên hiển thị
 * @param {string} displayName - Tên hiển thị mới
 * @returns {Promise<Object>} Response data
 */
export const updateDisplayName = async (displayName) => {
  return updateProfile({ displayName });
};

/**
 * Cập nhật tiểu sử
 * @param {string} bio - Tiểu sử mới
 * @returns {Promise<Object>} Response data
 */
export const updateBio = async (bio) => {
  return updateProfile({ bio });
};

/**
 * Cập nhật mật khẩu
 * @param {string} password - Mật khẩu mới
 * @returns {Promise<Object>} Response data
 */
export const updatePassword = async (password) => {
  return updateProfile({ password });
};

/**
 * Cập nhật cài đặt quyền riêng tư
 * @param {Object} privacy - Cài đặt quyền riêng tư mới
 * @returns {Promise<Object>} Response data
 */
export const updatePrivacy = async (privacy) => {
  return updateProfile({ privacy });
};

/**
 * Export tất cả các hàm như một object để dễ sử dụng
 */
export const userService = {
  getProfile,
  updateProfile,
  updateProfileFields,
  updateAvatar,
  updateDisplayName,
  updateBio,
  updatePassword,
  updatePrivacy,
};

export default userService;
