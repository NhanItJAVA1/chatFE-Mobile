import { api } from "./api";

/**
 * Tìm kiếm user bằng số điện thoại
 * @param {string} phone - Số điện thoại tìm kiếm
 * @returns {Promise<Object>} User data
 */
export const searchUserByPhone = async (phone) => {
  const response = await api.get("/users/search", {
    params: { phone },
  });
  return response;
};

/**
 * Gửi lời mời kết bạn
 * @param {string} receiverId - ID người nhận lời mời
 * @returns {Promise<Object>} Friend request data
 */
export const sendFriendRequest = async (receiverId) => {
  const response = await api.post(`/friend-requests/${receiverId}`);
  return response;
};

/**
 * Lấy danh sách lời mời kết bạn đã nhận
 * @returns {Promise<Object>} List of received friend requests
 */
export const getReceivedFriendRequests = async () => {
  const response = await api.get("/friend-requests/received");
  return response;
};

/**
 * Lấy danh sách lời mời kết bạn đã gửi
 * @returns {Promise<Object>} List of sent friend requests
 */
export const getSentFriendRequests = async () => {
  const response = await api.get("/friend-requests/sent");
  return response;
};

/**
 * Chấp nhận lời mời kết bạn
 * @param {string} requestId - ID lời mời kết bạn
 * @returns {Promise<Object>} Updated friend request
 */
export const acceptFriendRequest = async (requestId) => {
  const response = await api.patch(`/friend-requests/${requestId}`, {
    status: "accepted",
  });
  return response;
};

/**
 * Từ chối lời mời kết bạn
 * @param {string} requestId - ID lời mời kết bạn
 * @returns {Promise<Object>} Updated friend request
 */
export const rejectFriendRequest = async (requestId) => {
  const response = await api.patch(`/friend-requests/${requestId}`, {
    status: "rejected",
  });
  return response;
};

/**
 * Lấy danh sách bạn bè
 * @returns {Promise<Object>} List of friends
 */
export const getFriends = async () => {
  const response = await api.get("/friends");
  return response;
};

/**
 * Xóa bạn
 * @param {string} friendId - ID bạn cần xóa
 * @returns {Promise<Object>} Response data
 */
export const removeFriend = async (friendId) => {
  const response = await api.delete(`/friends/${friendId}`);
  return response;
};
