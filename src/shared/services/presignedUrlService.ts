/**
 * Presigned URL Upload Service
 * Handles the 3-step S3 presigned URL upload flow with retry and progress tracking
 */

import { api } from "./api";
import { authStorage } from "../runtime/storage";
import type {
    FileType,
    PresignedUrlRequestPayload,
    PresignedUrlResponse,
    ConfirmUploadPayload,
    UploadProgressEvent,
    UploadSession,
} from "@/types";
import {
    validateFile,
    validatePresignedUrlExpiry,
    detectFileType,
    isPresignedUrlExpired,
    retryWithBackoff,
    DEFAULT_RETRY_CONFIG,
    uploadWithProgress,
    RetryConfig,
} from "../utils/mediaUploadUtils";

/**
 * Step 1: Request presigned URL from backend
 */
export const requestPresignedUrl = async (
    payload: PresignedUrlRequestPayload
): Promise<PresignedUrlResponse> => {
    try {
        // Validate file before requesting URL
        const validation = validateFile(
            payload.fileSize,
            payload.fileType,
            payload.mimeType
        );

        if (!validation.isValid) {
            console.error("[requestPresignedUrl] Validation failed:", validation.error);
            throw new Error(validation.error);
        }

        if (validation.warnings) {
            validation.warnings.forEach((warning) => {
                console.warn("[requestPresignedUrl] Warning:", warning);
            });
        }

        // Validate and normalize expiry time
        const expiresIn = validatePresignedUrlExpiry(payload.expiresIn);

        console.log("[requestPresignedUrl] Requesting presigned URL:", {
            fileType: payload.fileType,
            mimeType: payload.mimeType,
            fileSize: payload.fileSize,
            expiresIn,
        });

        const response = await api.post("/v1/media/request-upload-url", {
            ...payload,
            expiresIn,
        });

        console.log(
            "[requestPresignedUrl] Received presigned URL:",
            response.data.fileId
        );

        return response.data;
    } catch (error: any) {
        console.error("[requestPresignedUrl] Error:", error);
        throw new Error(error.message || "Failed to request presigned URL");
    }
};

/**
 * Step 2: Upload file to S3 using presigned URL
 * Includes retry logic and progress tracking
 */
export const uploadToS3 = async (
    presignedUrl: string,
    fileBlob: Blob,
    mimeType: string,
    headers?: Record<string, string>,
    onProgress?: (event: UploadProgressEvent) => void,
    retryConfig?: RetryConfig
): Promise<void> => {
    const config = retryConfig || DEFAULT_RETRY_CONFIG;

    // Check if URL is expired before attempting upload
    if (presignedUrl.includes("Expires")) {
        // Parse expiry from URL if available
        // Extract the Expires parameter using regex to avoid URLSearchParams compatibility issues
        const expiresMatch = presignedUrl.match(/Expires=(\d+)/);
        if (expiresMatch && expiresMatch[1]) {
            const expireTime = parseInt(expiresMatch[1]) * 1000;
            const currentTime = new Date().getTime();
            if (currentTime + 30000 > expireTime) {
                throw new Error(
                    "Presigned URL expired (410) - Request new URL and retry"
                );
            }
        }
    }

    const finalHeaders: Record<string, string> = {
        "Content-Type": mimeType,
        ...headers,
    };

    console.log("[uploadToS3] Starting upload to S3", {
        fileSize: fileBlob.size,
        mimeType,
        retries: config.maxRetries,
    });

    await retryWithBackoff(
        () => uploadWithProgress(presignedUrl, fileBlob, finalHeaders, onProgress),
        config,
        (attempt, error) => {
            console.warn(`[uploadToS3] Retry attempt ${attempt}:`, error.message);
            onProgress?.({
                loaded: 0,
                total: fileBlob.size,
                percentage: 0,
                status: "uploading",
                error: `Retrying... (attempt ${attempt}/${config.maxRetries})`,
            });
        }
    );

    console.log("[uploadToS3] Successfully uploaded to S3");
};

/**
 * Step 3: Confirm upload with backend
 */
export const confirmUpload = async (
    payload: ConfirmUploadPayload
): Promise<any> => {
    try {
        console.log("[confirmUpload] Confirming upload:", payload.fileId);

        const response = await api.post("/v1/media/confirm-upload", payload);

        console.log("[confirmUpload] Upload confirmed successfully");

        return response;
    } catch (error: any) {
        console.error("[confirmUpload] Error:", error);
        throw new Error(error.message || "Failed to confirm upload");
    }
};

/**
 * Complete presigned URL upload flow
 * Wraps all 3 steps in a single function
 */
export const uploadFileWithPresignedUrl = async (
    file: any,
    fileType?: FileType,
    onProgress?: (event: UploadProgressEvent) => void,
    retryConfig?: RetryConfig,
    conversationId?: string
): Promise<PresignedUrlResponse> => {
    try {
        // Detect file type if not provided
        const detectedType =
            fileType || detectFileType(file.type) || "DOCUMENT";
        if (!fileType && detectedType === "DOCUMENT") {
            console.warn(
                `[uploadFileWithPresignedUrl] Could not auto-detect file type, using DOCUMENT`
            );
        }

        onProgress?.({
            loaded: 0,
            total: file.size,
            percentage: 0,
            status: "uploading",
            error: "Requesting presigned URL...",
        });

        // Step 1: Request presigned URL
        const presignedData = await requestPresignedUrl({
            fileType: detectedType,
            mimeType: file.type,
            fileSize: file.size,
            originalName: file.name,
            conversationId,
        });

        onProgress?.({
            loaded: 0,
            total: file.size,
            percentage: 0,
            status: "uploading",
            error: "Uploading to S3...",
        });

        // Step 2: Upload to S3
        await uploadToS3(
            presignedData.presignedUrl,
            file,
            file.type,
            presignedData.headers,
            onProgress,
            retryConfig
        );

        onProgress?.({
            loaded: file.size,
            total: file.size,
            percentage: 100,
            status: "uploading",
            error: "Confirming upload...",
        });

        // Step 3: Confirm upload
        await confirmUpload({
            fileId: presignedData.fileId,
            uploadedUrl: presignedData.presignedUrl, // This should be the actual S3 URL returned from step 2
        });

        return presignedData;
    } catch (error: any) {
        console.error("[uploadFileWithPresignedUrl] Error:", error);

        onProgress?.({
            loaded: 0,
            total: file.size,
            percentage: 0,
            status: "error",
            error: error.message,
        });

        throw new Error(error.message || "File upload failed");
    }
};

/**
 * Handle upload errors and return appropriate error code
 */
export const handleUploadError = (
    error: any
): { code: number; message: string } => {
    const message = error.message || "";

    if (message.includes("400")) {
        return { code: 400, message: "Invalid request - check file type/size" };
    }

    if (message.includes("401")) {
        return {
            code: 401,
            message: "Unauthorized - missing or invalid JWT token",
        };
    }

    if (message.includes("410")) {
        return {
            code: 410,
            message: "Presigned URL expired - request new URL and retry",
        };
    }

    if (message.includes("timeout")) {
        return { code: 500, message: "Upload timeout - please retry" };
    }

    return { code: 500, message: error.message || "Server error" };
};

/**
 * Service object for backward compatibility
 */
export const presignedUrlService = {
    requestPresignedUrl,
    uploadToS3,
    confirmUpload,
    uploadFileWithPresignedUrl,
    handleUploadError,
};
