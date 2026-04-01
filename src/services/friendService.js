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
export const declineFriendRequest = async (requestId) => {
  const response = await api.patch(`/friend-requests/${requestId}`, {
    status: "rejected",
  });
  return response;
};

/**
 * Hủy lời mời kết bạn đã gửi
 * @param {string} requestId - ID lời mời kết bạn
 * @returns {Promise<Object>} Result
 */
export const cancelFriendRequest = async (requestId) => {
  const response = await api.delete(`/friend-requests/${requestId}`);
  return response;
};

/**
 * Lấy danh sách bạn bè
 * @param {number} page - Trang (mặc định 1)
 * @param {number} limit - Số bạn bè mỗi trang (mặc định 20)
 * @returns {Promise<Object>} List of friends with pagination
 */
export const getFriendsList = async (page = 1, limit = 20) => {
  const response = await api.get("/friendships", {
    params: { page, limit },
  });
  return response;
};

/**
 * Xóa bạn (unfriend)
 * @param {string} friendId - ID của bạn để xóa
 * @returns {Promise<Object>} Result
 */
export const unfriend = async (friendId) => {
  const response = await api.delete(`/friendships/${friendId}`);
  return response;
};

/**
 * Lấy thông tin profile của 1 user
 * @param {string} userId - ID user
 * @returns {Promise<Object>} User profile
 */
export const getUserProfile = async (userId) => {
  const response = await api.get(`/users/${userId}`);
  return response;
};

/**
 * Lấy danh sách bạn bè kèm thông tin profile
 * @param {number} page - Trang (mặc định 1)
 * @param {number} limit - Số bạn bè mỗi trang (mặc định 20)
 * @param {string} currentUserId - ID của user hiện tại
 * @returns {Promise<Object>} List of friends with full profile data
 */
export const getFriendsListWithProfiles = async (page = 1, limit = 20, currentUserId) => {
  try {
    // Lấy danh sách friendships
    const friendshipsResponse = await getFriendsList(page, limit);

    if (!friendshipsResponse?.data?.items) {
      return {
        data: {
          items: [],
          total: 0,
          page,
          limit,
          hasMore: false,
        },
      };
    }

    // Transform friendships thành user profiles
    const friendsWithProfiles = await Promise.all(
      friendshipsResponse.data.items.map(async (friendship) => {
        // Xác định friendId: nếu userA là currentUserId thì lay userB, ngược lại lấy userA
        const friendId = friendship.userA === currentUserId ? friendship.userB : friendship.userA;

        // Lấy thông tin user của friend
        const userResponse = await getUserProfile(friendId);
        const friendData = userResponse?.data;

        return {
          friendshipId: friendship.id,
          friendId,
          ...friendData, // Merge user profile data (displayName, phone, email, etc.)
          createdAt: friendship.createdAt,
        };
      }),
    );

    return {
      data: {
        items: friendsWithProfiles,
        total: friendshipsResponse.data.total,
        page: friendshipsResponse.data.page,
        limit: friendshipsResponse.data.limit,
        hasMore: friendshipsResponse.data.hasMore,
      },
    };
  } catch (error) {
    throw error;
  }
};
