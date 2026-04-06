import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";

/**
 * Upload a single file to the media endpoint
 * @param {File} file - The file to upload
 * @returns {Promise<Object>} Response data containing: filename, url, originalName, size, mimetype
 */
export const uploadMedia = async (file) => {
  try {
    if (!file) {
      throw new Error("File is required");
    }

    const formData = new FormData();
    formData.append("file", file);

    const token = await authStorage.getItem("token");
    const response = await fetch(`${getApiBaseUrl()}/media/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("Media upload failed:", error);
    throw new Error(error.message || "Failed to upload file");
  }
};

/**
 * Upload multiple files to the media endpoint
 * @param {File[]} files - Array of files to upload
 * @returns {Promise<Array>} Response data containing array of uploaded file info
 */
export const uploadMultipleMedia = async (files) => {
  try {
    if (!files || files.length === 0) {
      throw new Error("At least one file is required");
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const token = await authStorage.getItem("token");
    const response = await fetch(`${getApiBaseUrl()}/media/upload-multiple`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("Media upload failed:", error);
    throw new Error(error.message || "Failed to upload files");
  }
};

/**
 * Delete a media file
 * @param {string} filename - The filename to delete
 * @returns {Promise<void>}
 */
export const deleteMedia = async (filename) => {
  try {
    const token = await authStorage.getItem("token");
    const response = await fetch(`${getApiBaseUrl()}/media/${filename}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Delete failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Media delete failed:", error);
    throw new Error(error.message || "Failed to delete file");
  }
};

export const mediaService = {
  uploadMedia,
  uploadMultipleMedia,
  deleteMedia,
};

export default mediaService;
