import { api } from "./api";

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

    // Cập nhật localStorage với dữ liệu mới
    if (response.data) {
      const currentUser = localStorage.getItem("user");
      if (currentUser) {
        try {
          const user = JSON.parse(currentUser);
          const updatedUser = { ...user, ...updateData };
          localStorage.setItem("user", JSON.stringify(updatedUser));
        } catch (parseError) {
          console.warn("Could not parse user from localStorage");
        }
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
 * Cập nhật avatar
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
