export { api, apiCall } from "./api";
export { authService } from "./authService";
export {
    searchUsers,
    searchUserByPhone,
    sendFriendRequest,
    getReceivedFriendRequests,
    getReceivedRequests,
    getSentFriendRequests,
    getSentRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    getFriends,
    checkFriendshipStatus,
    getMutualFriends,
    getFriendSuggestions,
    removeFriend,
    unfriend,
} from "./friendService";
export {
    friendRequestService,
} from "./friendRequestService";
export {
    getProfile,
    updateProfile,
    updateProfileFields,
    updateAvatar,
    updateAvatarViaAuth,
    updateDisplayName,
    updateBio,
    updatePassword,
    updatePrivacy,
    userService,
} from "./userService";
export {
    uploadMedia,
    uploadMultipleMedia,
    deleteMedia,
    mediaService,
} from "./mediaService";
export {
    requestPresignedUrl,
    uploadToS3,
    confirmUpload,
    uploadFileWithPresignedUrl,
    handleUploadError,
    presignedUrlService,
} from "./presignedUrlService";
