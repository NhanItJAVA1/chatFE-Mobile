import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";

export const uploadMedia = async (file: any): Promise<any> => {
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
            throw new Error(
                errorData.message || `Upload failed with status ${response.status}`
            );
        }

        const data = await response.json();
        console.log(
            "[mediaService] Upload response:",
            JSON.stringify(data, null, 2)
        );
        console.log("[mediaService] Upload data:", JSON.stringify(data.data, null, 2));
        return data.data;
    } catch (error: any) {
        console.error("Media upload failed:", error);
        throw new Error(error.message || "Failed to upload file");
    }
};

export const uploadMultipleMedia = async (files: any[]): Promise<any> => {
    try {
        if (!files || files.length === 0) {
            throw new Error("At least one file is required");
        }

        const formData = new FormData();
        files.forEach((file) => {
            formData.append("files", file);
        });

        const token = await authStorage.getItem("token");
        const response = await fetch(
            `${getApiBaseUrl()}/media/upload-multiple`,
            {
                method: "POST",
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: formData,
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                errorData.message || `Upload failed with status ${response.status}`
            );
        }

        const data = await response.json();
        console.log(
            "[mediaService] Upload multiple response:",
            JSON.stringify(data, null, 2)
        );
        console.log(
            "[mediaService] Upload multiple data:",
            JSON.stringify(data.data, null, 2)
        );
        return data.data;
    } catch (error: any) {
        console.error("Media upload failed:", error);
        throw new Error(error.message || "Failed to upload files");
    }
};

export const deleteMedia = async (mediaId: string): Promise<any> => {
    try {
        const token = await authStorage.getItem("token");
        const response = await fetch(
            `${getApiBaseUrl()}/media/${mediaId}`,
            {
                method: "DELETE",
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Delete failed with status ${response.status}`);
        }

        return await response.json();
    } catch (error: any) {
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
