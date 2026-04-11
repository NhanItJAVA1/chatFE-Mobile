/**
 * Media Upload Utilities
 * Handles file validation, compression, and presigned URL flow
 */

import type {
    FileType,
    FileValidationResult,
    UploadProgressEvent,
} from "@/types";

// =====================================================
// CONSTANTS
// =====================================================

export const FILE_TYPE_MIMES = {
    IMAGE: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    VIDEO: ["video/mp4", "video/mpeg", "video/quicktime", "video/webm"],
    AUDIO: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"],
    DOCUMENT: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
};

export const MAX_FILE_SIZES: Record<FileType, number> = {
    IMAGE: 100 * 1024 * 1024, // 100MB
    VIDEO: 1024 * 1024 * 1024, // 1GB
    AUDIO: 100 * 1024 * 1024, // 100MB
    DOCUMENT: 50 * 1024 * 1024, // 50MB
};

export const DEFAULT_PRESIGNED_URL_EXPIRY = 300; // 5 minutes
export const MIN_PRESIGNED_URL_EXPIRY = 60; // 1 minute
export const MAX_PRESIGNED_URL_EXPIRY = 3600; // 1 hour

// =====================================================
// VALIDATION FUNCTIONS
// =====================================================

/**
 * Validate file type matches MIME type
 */
export const validateMimeType = (
    fileType: FileType,
    mimeType: string
): boolean => {
    const validMimes = FILE_TYPE_MIMES[fileType];
    return validMimes.includes(mimeType.toLowerCase());
};

/**
 * Validate file size against maximum allowed
 */
export const validateFileSize = (
    fileSize: number,
    fileType: FileType
): boolean => {
    const maxSize = MAX_FILE_SIZES[fileType];
    return fileSize <= maxSize;
};

/**
 * Get human-readable file size
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

/**
 * Comprehensive file validation
 */
export const validateFile = (
    fileSize: number,
    fileType: FileType,
    mimeType: string
): FileValidationResult => {
    const warnings: string[] = [];

    // Validate MIME type
    if (!validateMimeType(fileType, mimeType)) {
        return {
            isValid: false,
            error: `Invalid MIME type "${mimeType}" for ${fileType}. Allowed: ${FILE_TYPE_MIMES[fileType].join(
                ", "
            )}`,
        };
    }

    // Validate file size
    if (!validateFileSize(fileSize, fileType)) {
        const maxSize = MAX_FILE_SIZES[fileType];
        return {
            isValid: false,
            error: `File size ${formatFileSize(
                fileSize
            )} exceeds maximum allowed ${formatFileSize(maxSize)} for ${fileType}`,
        };
    }

    // Warnings for large files
    if (fileType === "IMAGE" && fileSize > 5 * 1024 * 1024) {
        warnings.push(
            `Image is large (${formatFileSize(
                fileSize
            )}). Consider compressing before upload.`
        );
    }

    if (fileType === "VIDEO" && fileSize > 100 * 1024 * 1024) {
        warnings.push(
            `Video is large (${formatFileSize(
                fileSize
            )}). Upload may take several minutes.`
        );
    }

    return {
        isValid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
};

/**
 * Validate presigned URL expiry
 */
export const validatePresignedUrlExpiry = (expiresIn?: number): number => {
    if (!expiresIn) return DEFAULT_PRESIGNED_URL_EXPIRY;
    if (expiresIn < MIN_PRESIGNED_URL_EXPIRY)
        return MIN_PRESIGNED_URL_EXPIRY;
    if (expiresIn > MAX_PRESIGNED_URL_EXPIRY)
        return MAX_PRESIGNED_URL_EXPIRY;
    return expiresIn;
};

// =====================================================
// IMAGE COMPRESSION
// =====================================================

/**
 * Compress image before upload
 * React Native version: Returns file as-is with placeholder dimensions
 * (Image compression is handled differently in React Native)
 */
export const compressImage = async (
    file: any,
    targetQuality: number = 0.8,
    maxWidth: number = 1920
): Promise<{ compressedFile: Blob; width: number; height: number }> => {
    // In React Native, browser APIs (Image, document, canvas) are not available
    // Return the file as-is - server can compress if needed
    // For actual image resizing in React Native, use: react-native-image-resizer
    console.log(
        "[compressImage] Skipping compression in React Native environment",
        { targetQuality, maxWidth }
    );

    return Promise.resolve({
        compressedFile: file,
        width: maxWidth, // Placeholder width
        height: maxWidth, // Placeholder height
    });
};

// =====================================================
// RETRY LOGIC
// =====================================================

export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    timeoutMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000, // 1 second
    maxDelayMs: 30000, // 30 seconds
    backoffMultiplier: 2,
    timeoutMs: 30000, // 30 second timeout for PUT request
};

/**
 * Calculate exponential backoff delay
 */
export const calculateBackoffDelay = (
    attempt: number,
    config: RetryConfig
): number => {
    const delay =
        config.initialDelayMs *
        Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelayMs);
};

/**
 * Retry async operation with exponential backoff
 */
export const retryWithBackoff = async <T,>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    onRetry?: (attempt: number, error: Error) => void
): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
            // Create promise that will timeout
            const timeoutPromise = new Promise<T>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `Operation timed out after ${config.timeoutMs}ms`
                            )
                        ),
                    config.timeoutMs
                )
            );

            const result = await Promise.race([
                operation(),
                timeoutPromise,
            ]);

            return result;
        } catch (error: any) {
            lastError = error;

            if (attempt < config.maxRetries) {
                const delay = calculateBackoffDelay(attempt, config);
                onRetry?.(attempt, error);

                console.log(
                    `[retryWithBackoff] Attempt ${attempt} failed, retrying in ${delay}ms:`,
                    error.message
                );

                await new Promise<void>((resolve) =>
                    setTimeout(() => resolve(), delay)
                );
            }
        }
    }

    throw lastError || new Error("Operation failed after retries");
};

// =====================================================
// UPLOAD PROGRESS TRACKING
// =====================================================

/**
 * Create XMLHttpRequest with progress tracking
 */
export const uploadWithProgress = async (
    url: string,
    file: Blob,
    headers: Record<string, string>,
    onProgress?: (event: UploadProgressEvent) => void
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Progress event
        xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;

                onProgress?.({
                    loaded: event.loaded,
                    total: event.total,
                    percentage: percentComplete,
                    status: "uploading",
                });

                console.log(
                    `[uploadWithProgress] Upload progress: ${percentComplete.toFixed(
                        2
                    )}%`
                );
            }
        });

        // Load complete
        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.({
                    loaded: file.size,
                    total: file.size,
                    percentage: 100,
                    status: "completed",
                });

                resolve();
            } else {
                reject(
                    new Error(
                        `Upload failed with status ${xhr.status}: ${xhr.statusText}`
                    )
                );
            }
        });

        // Error
        xhr.addEventListener("error", () => {
            const error = new Error("Upload failed");
            onProgress?.({
                loaded: 0,
                total: file.size,
                percentage: 0,
                status: "error",
                error: error.message,
            });
            reject(error);
        });

        // Abort
        xhr.addEventListener("abort", () => {
            const error = new Error("Upload aborted");
            onProgress?.({
                loaded: 0,
                total: file.size,
                percentage: 0,
                status: "error",
                error: error.message,
            });
            reject(error);
        });

        // Set headers
        Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
        });

        // Send
        xhr.open("PUT", url);
        xhr.send(file);
    });
};

// =====================================================
// HELPERS
// =====================================================

/**
 * Detect file type from MIME type
 */
export const detectFileType = (mimeType: string): FileType | null => {
    const mime = mimeType.toLowerCase();

    for (const [fileType, mimes] of Object.entries(FILE_TYPE_MIMES)) {
        if (mimes.includes(mime)) {
            return fileType as FileType;
        }
    }

    return null;
};

/**
 * Check if presigned URL is expired
 */
export const isPresignedUrlExpired = (expiresAt: string): boolean => {
    const expireTime = new Date(expiresAt).getTime();
    const currentTime = new Date().getTime();
    // Add 30 second buffer before expiry
    return currentTime + 30000 > expireTime;
};
