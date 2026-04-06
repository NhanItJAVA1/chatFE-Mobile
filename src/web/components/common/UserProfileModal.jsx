import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../shared/hooks";
import { updateProfile, updateAvatarViaAuth } from "../../../shared/services";
import { AvatarEditor } from "./AvatarEditor";

/**
 * UserProfileModal - Shared component for viewing and editing user profile
 * Works for both web and mobile (React Native with same API structure)
 *
 * Props:
 *   - isOpen: boolean - Control modal visibility
 *   - onClose: function - Callback when modal closes
 *   - onSuccess: function - Callback after successful profile update
 */
export const UserProfileModal = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateUserProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const modalRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    displayName: user?.displayName || "",
    phone: user?.phone || "",
    email: user?.email || "",
    bio: user?.bio || "",
    avatarUrl: user?.avatarUrl || "",
  });

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    return (
      formData.displayName !== (user?.displayName || "") ||
      formData.phone !== (user?.phone || "") ||
      formData.email !== (user?.email || "") ||
      formData.bio !== (user?.bio || "")
    );
  };

  // Update form when modal opens
  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        displayName: user.displayName || "",
        phone: user.phone || "",
        email: user.email || "",
        bio: user.bio || "",
        avatarUrl: user.avatarUrl || "",
      });
      // Reset editing state when modal opens
      setIsEditing(false);
      setError("");
      setSuccess("");
    }
  }, [isOpen]);

  // Close on escape key or outside click
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") handleCloseModal();
    };

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        handleCloseModal();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Prepare update data - send all form data
      const updateData = {
        displayName: formData.displayName,
        phone: formData.phone,
        email: formData.email,
        bio: formData.bio,
      };

      await updateProfile(updateData);

      // Update local auth context
      if (updateUserProfile) {
        updateUserProfile({
          ...user,
          ...updateData,
        });
      }

      setSuccess("Profile updated successfully!");
      setIsEditing(false);

      // Call onSuccess callback if provided
      onSuccess?.();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError("");
    setSuccess("");
    // Reset form
    setFormData({
      displayName: user?.displayName || "",
      phone: user?.phone || "",
      email: user?.email || "",
      bio: user?.bio || "",
      avatarUrl: user?.avatarUrl || "",
    });
  };

  const handleAvatarChangeSuccess = (avatarData) => {
    // Update form data with new avatar URL
    const newAvatarUrl = avatarData.url;
    setFormData((prev) => ({
      ...prev,
      avatarUrl: newAvatarUrl,
    }));

    // Update auth context
    if (updateUserProfile) {
      updateUserProfile({
        ...user,
        avatarUrl: newAvatarUrl,
      });
    }

    // Update localStorage immediately
    const currentUser = localStorage.getItem("user");
    if (currentUser) {
      try {
        const userObj = JSON.parse(currentUser);
        userObj.avatarUrl = newAvatarUrl;
        localStorage.setItem("user", JSON.stringify(userObj));
      } catch (e) {
        console.warn("Could not update localStorage");
      }
    }

    setSuccess("Avatar updated successfully!");
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(""), 3000);

    // Call onSuccess callback if provided
    onSuccess?.();
  };

  const handleAvatarError = (errorMessage) => {
    setError(errorMessage);
  };

  const handleCloseModal = () => {
    if (isEditing && hasUnsavedChanges()) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to close?");
      if (confirmed) {
        onClose?.();
      }
    } else {
      onClose?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 border-b dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h2>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400 transition"
                title="Edit Profile"
              >
                ✏️
              </button>
            ) : null}
            <button
              onClick={handleCloseModal}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-600 dark:text-gray-400 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-8">
            {isEditing ? (
              <AvatarEditor
                currentAvatarUrl={formData.avatarUrl}
                displayName={formData.displayName}
                onAvatarChange={handleAvatarChangeSuccess}
                onError={handleAvatarError}
              />
            ) : (
              <>
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-lg mb-3">
                  {formData.avatarUrl ? (
                    <img
                      src={formData.avatarUrl}
                      alt={formData.displayName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    formData.displayName?.charAt(0) || "U"
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user?.status === "online" ? "🟢 Online" : "🔘 Offline"}
                </p>
              </>
            )}
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
              {isEditing ? (
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="px-4 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-gray-900 dark:text-white">
                  {formData.displayName || "—"}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              {isEditing ? (
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="px-4 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-gray-900 dark:text-white">
                  {formData.email || "—"}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
              {isEditing ? (
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="px-4 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-gray-900 dark:text-white">
                  {formData.phone || "—"}
                </p>
              )}
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
              {isEditing ? (
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  disabled={loading}
                  rows="3"
                  placeholder="Tell us about yourself..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="px-4 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg text-gray-900 dark:text-white whitespace-pre-wrap">
                  {formData.bio || "—"}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {isEditing && (
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
