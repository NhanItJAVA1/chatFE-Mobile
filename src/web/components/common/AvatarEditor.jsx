import React, { useRef, useState, useEffect } from "react";
import { uploadMedia, updateAvatarViaAuth } from "../../../shared/services";

/**
 * AvatarEditor - Component for editing user avatar
 * Allows file upload and immediate avatar update
 *
 * Props:
 *   - currentAvatarUrl: string - Current avatar URL or display name for initials
 *   - displayName: string - User display name for initials fallback
 *   - onAvatarChange: function - Callback when avatar is successfully changed
 *   - onError: function - Callback when error occurs
 */
export const AvatarEditor = ({ currentAvatarUrl, displayName = "U", onAvatarChange, onError }) => {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentAvatarUrl);

  // Sync preview when currentAvatarUrl prop changes
  useEffect(() => {
    setPreviewUrl(currentAvatarUrl);
  }, [currentAvatarUrl]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      onError?.("Please select a valid image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      onError?.("File size must be less than 10MB");
      return;
    }

    setLoading(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target.result);
      };
      reader.readAsDataURL(file);

      // Upload file to media endpoint
      const uploadResponse = await uploadMedia(file);

      // Update avatar via auth endpoint
      if (uploadResponse.url) {
        await updateAvatarViaAuth(uploadResponse.url);

        // Call success callback
        onAvatarChange?.({
          url: uploadResponse.url,
          filename: uploadResponse.filename,
          originalName: uploadResponse.originalName,
          size: uploadResponse.size,
          mimetype: uploadResponse.mimetype,
        });
      }
    } catch (error) {
      console.error("Avatar update failed:", error);
      // Reset preview on error
      setPreviewUrl(currentAvatarUrl);
      onError?.(error.message || "Failed to update avatar");
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Display */}
      <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
        <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-lg overflow-hidden">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={() => <span>{displayName?.charAt(0) || "U"}</span>}
            />
          ) : (
            <span>{displayName?.charAt(0) || "U"}</span>
          )}
        </div>

        {/* Camera Icon on Hover */}
        <div className="absolute inset-0 rounded-full bg-black opacity-0 group-hover:opacity-40 transition flex items-center justify-center pointer-events-none">
          <span className="text-white text-3xl opacity-0 group-hover:opacity-100 transition">📷</span>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={loading}
        className="hidden"
        aria-label="Upload avatar"
      />

      {/* Instructions */}
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-xs">
        {loading ? "Uploading and updating avatar..." : "Click avatar to change your photo"}
      </p>
    </div>
  );
};

export default AvatarEditor;
