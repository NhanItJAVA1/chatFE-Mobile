import { getApiBaseUrl } from "../runtime/config";
import { authStorage } from "../runtime/storage";
import { requestPresignedUrl, confirmUpload } from "./presignedUrlService";
import type { UploadProgressEvent } from "@/types";

/**
 * Convert React Native file to File object for presigned URL upload
 */
const normalizeReactNativeFile = async (file: any): Promise<File> => {
    try {
        // Check if this is a React Native file (has uri property)
        if (file.uri) {
            console.log('[mediaService] Converting React Native file:', {
                name: file.name,
                type: file.type,
                mimeType: file.mimeType,
            });

            // Fetch the file from URI
            const response = await fetch(file.uri);
            const blob = await response.blob();

            // Use mimeType from ImagePicker if available, otherwise determine from filename
            let mimeType = file.mimeType;
            if (!mimeType || !mimeType.includes('/')) {
                console.log('[mediaService] No valid mimeType from ImagePicker, detecting from filename');
                mimeType = getMimeTypeFromName(file.name);
            }

            // Sanitize MIME type (convert unsupported formats like HEIC to JPEG)
            let filename = file.name;
            const { mimeType: sanitizedMimeType, filename: sanitizedFilename } = sanitizeMimeType(mimeType, filename);
            mimeType = sanitizedMimeType;
            filename = sanitizedFilename;

            console.log('[mediaService] Final MIME type:', mimeType);
            console.log('[mediaService] Final filename:', filename);

            // Create a File object from Blob
            return new File([blob], filename, { type: mimeType });
        }

        // If it's already a File, return as-is
        if (file instanceof File) {
            return file;
        }

        // If it's a Blob, convert to File
        if (file instanceof Blob) {
            return new File([file], file.name || 'unnamed', { type: file.type });
        }

        throw new Error('Invalid file type');
    } catch (error: any) {
        console.error('[mediaService] Error converting file:', error);
        throw new Error(`Failed to process file: ${error.message}`);
    }
};

/**
 * Sanitize MIME type - convert unsupported formats to supported ones
 * HEIC (iOS) -> JPEG, etc.
 */
const sanitizeMimeType = (mimeType: string, filename: string): { mimeType: string; filename: string } => {
    let sanitized = mimeType;
    let newFilename = filename;

    // Convert HEIC (iOS) to JPEG
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        console.log('[mediaService] Converting unsupported format HEIC/HEIF to JPEG');
        sanitized = 'image/jpeg';
        // Update filename extension if needed
        if (newFilename.toLowerCase().endsWith('.heic') || newFilename.toLowerCase().endsWith('.heif')) {
            newFilename = newFilename.replace(/\.(heic|heif)$/i, '.jpg');
        }
    }

    // Convert WebP to JPEG if needed (some backends don't support WebP)
    // Uncomment if backend doesn't support WebP:
    // if (mimeType === 'image/webp') {
    //     console.log('[mediaService] Converting WebP to JPEG');
    //     sanitized = 'image/jpeg';
    //     newFilename = newFilename.replace(/\.webp$/i, '.jpg');
    // }

    if (sanitized !== mimeType) {
        console.log('[mediaService] Sanitized MIME type:', mimeType, '->', sanitized);
    }

    return { mimeType: sanitized, filename: newFilename };
};

/**
 * Get MIME type from filename
 */
const getMimeTypeFromName = (filename: string): string => {
    console.log('[mediaService] Getting MIME type from filename:', filename);
    const ext = filename.split('.').pop()?.toLowerCase();
    console.log('[mediaService] Detected file extension:', ext);

    const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'heic': 'image/jpeg',  // Convert HEIC to JPEG
        'heif': 'image/jpeg',  // Convert HEIF to JPEG
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
    console.log('[mediaService] Resolved MIME type:', mimeType);
    return mimeType;
};

/**
 * Detect file type from MIME type
 */
const detectFileTypeFromMime = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document')) return 'DOCUMENT';
    return 'DOCUMENT';
};

/**
 * Upload file to S3 using presigned URL with fetch (React Native compatible)
 */
const uploadToS3WithFetch = async (
    presignedUrl: string,
    fileBlob: File | Blob,
    mimeType: string,
    headers?: Record<string, string>,
    onProgress?: (progress: number) => void
): Promise<void> => {
    console.log('[mediaService] Uploading to S3 with fetch...');

    try {
        // Build headers - include all headers from presigned URL response
        const uploadHeaders: Record<string, string> = {
            'Content-Type': mimeType,
        };

        // Merge in any additional headers from presigned URL (like authorization, x-amz-*, etc.)
        if (headers && Object.keys(headers).length > 0) {
            console.log('[mediaService] Additional S3 headers:', Object.keys(headers));
            Object.assign(uploadHeaders, headers);
        }

        console.log('[mediaService] Final upload headers:', Object.keys(uploadHeaders));

        const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: fileBlob,
            headers: uploadHeaders,
        });

        console.log('[mediaService] S3 upload response status:', response.status);

        if (!response.ok) {
            const text = await response.text();
            console.error('[mediaService] S3 upload error (status ' + response.status + '):', text.substring(0, 500));
            throw new Error(`S3 upload failed with status ${response.status}`);
        }

        // Simulate 100% progress for fetch (no progress tracking available)
        onProgress?.(100);
        console.log('[mediaService] S3 upload successful');
    } catch (error: any) {
        console.error('[mediaService] S3 upload error:', error.message);
        throw error;
    }
};

/**
 * Upload media file using presigned URL flow
 */
export const uploadMedia = async (file: any, onProgress?: (progress: number) => void): Promise<any> => {
    try {
        if (!file) {
            throw new Error("File is required");
        }

        console.log('[mediaService] Starting media upload:', {
            name: file.name,
            type: file.type,
            hasUri: !!file.uri,
            size: file.size
        });

        // Normalize React Native file to proper File object
        const normalizedFile = await normalizeReactNativeFile(file);

        console.log('[mediaService] File normalized, size:', normalizedFile.size, 'type:', normalizedFile.type);

        // Step 1: Request presigned URL from backend
        onProgress?.(10);
        console.log('[mediaService] Requesting presigned URL...');

        const fileType = detectFileTypeFromMime(normalizedFile.type);
        const presignedData = await requestPresignedUrl({
            fileType: fileType as any,
            mimeType: normalizedFile.type,
            fileSize: normalizedFile.size,
            originalName: normalizedFile.name,
            expiresIn: 300, // 5 minutes
        });

        console.log('[mediaService] Received presigned URL response:', {
            fileId: presignedData.fileId,
            hasPresignedUrl: !!presignedData.presignedUrl,
            headerCount: presignedData.headers ? Object.keys(presignedData.headers).length : 0,
            headerKeys: presignedData.headers ? Object.keys(presignedData.headers) : [],
        });

        onProgress?.(30);

        // Step 2: Upload file to S3 using presigned URL
        console.log('[mediaService] Starting S3 upload...');
        console.log('[mediaService] Presigned URL:', presignedData.presignedUrl?.substring(0, 100) + '...');
        await uploadToS3WithFetch(
            presignedData.presignedUrl,
            normalizedFile,
            normalizedFile.type,
            presignedData.headers,
            (progress) => {
                // Scale progress from 30% to 90%
                const scaledProgress = 30 + (progress * 0.6);
                onProgress?.(scaledProgress);
            }
        );

        onProgress?.(90);

        // Step 3: Confirm upload with backend
        console.log('[mediaService] Confirming upload...');
        const confirmResponse = await confirmUpload({
            fileId: presignedData.fileId,
            uploadedUrl: presignedData.presignedUrl,
        });

        console.log('[mediaService] Confirm response:', {
            hasResponse: !!confirmResponse,
            hasData: !!confirmResponse?.data,
            responseFields: confirmResponse?.data ? Object.keys(confirmResponse.data) : [],
        });

        onProgress?.(100);
        console.log('[mediaService] Upload completed successfully!');

        // Return URL and metadata
        // Prefer the URL from confirmUpload response if available, otherwise use presigned URL without params
        const backendUrl = confirmResponse?.data?.url;
        const cleanUrl = (backendUrl || presignedData.presignedUrl)?.split('?')[0];

        console.log('[mediaService] URL cleaning:', {
            backendUrl: backendUrl?.substring(0, 80),
            cleanUrl: cleanUrl?.substring(0, 80),
            used: cleanUrl ? 'cleaned' : 'none',
        });

        return {
            // Ensure clean URL without query params
            url: cleanUrl,
            fileId: presignedData.fileId,
            filename: presignedData.filename,
            // Spread confirmResponse data but exclude url (we've already cleaned it)
            ...(confirmResponse?.data ? {
                ...confirmResponse.data,
                url: cleanUrl,  // Override with cleaned URL
            } : {}),
        };
    } catch (error: any) {
        console.error("[mediaService] Media upload failed:", error.message);
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
