/**
 * useMediaUpload Hook
 * Manages file uploads with presigned URLs, progress tracking, and state management
 */

import { useState, useCallback, useRef } from "react";
import type {
    FileType,
    UploadProgressEvent,
    UploadSession,
} from "@/types";
import { RetryConfig } from "../utils/mediaUploadUtils";
import {
    uploadFileWithPresignedUrl,
    handleUploadError,
} from "../services/presignedUrlService";

interface UseMediaUploadOptions {
    onProgress?: (event: UploadProgressEvent) => void;
    onSuccess?: (session: UploadSession) => void;
    onError?: (error: Error) => void;
    retryConfig?: RetryConfig;
    conversationId?: string;
}

interface UseMediaUploadState {
    isUploading: boolean;
    progress: number;
    currentFile: UploadSession | null;
    error: string | null;
    errorCode: number | null;
}

export const useMediaUpload = (options: UseMediaUploadOptions = {}) => {
    const [state, setState] = useState<UseMediaUploadState>({
        isUploading: false,
        progress: 0,
        currentFile: null,
        error: null,
        errorCode: null,
    });

    const sessionRef = useRef<UploadSession | null>(null);

    /**
     * Handle upload progress updates
     */
    const handleProgress = useCallback(
        (event: UploadProgressEvent) => {
            const progressPercent = Math.round(event.percentage || 0);

            setState((prev) => ({
                ...prev,
                progress: progressPercent,
            }));

            console.log(
                `[useMediaUpload] Progress: ${progressPercent}% (${event.loaded}/${event.total} bytes)`
            );

            options.onProgress?.(event);
        },
        [options]
    );

    /**
     * Upload file with presigned URL
     */
    const uploadFile = useCallback(
        async (
            file: any,
            fileType?: FileType,
            conversationId?: string
        ): Promise<UploadSession | null> => {
            // Reset error state
            setState((prev) => ({
                ...prev,
                error: null,
                errorCode: null,
            }));

            // Check if already uploading
            if (state.isUploading) {
                const error = new Error("Upload already in progress");
                options.onError?.(error);
                setState((prev) => ({
                    ...prev,
                    error: error.message,
                    errorCode: 400,
                }));
                return null;
            }

            // Validate file exists
            if (!file) {
                const error = new Error("No file selected");
                options.onError?.(error);
                setState((prev) => ({
                    ...prev,
                    error: error.message,
                    errorCode: 400,
                }));
                return null;
            }

            setState((prev) => ({
                ...prev,
                isUploading: true,
                progress: 0,
            }));

            try {
                const finalConversationId = conversationId || options.conversationId;

                console.log(
                    `[useMediaUpload] Starting upload: ${file.name} (${file.type})`
                );

                const presignedData = await uploadFileWithPresignedUrl(
                    file,
                    fileType,
                    handleProgress,
                    options.retryConfig,
                    finalConversationId
                );

                // Create upload session
                const session: UploadSession = {
                    fileId: presignedData.fileId,
                    presignedUrl: presignedData.presignedUrl,
                    expiresAt: presignedData.expiresAt,
                    originalFile: file,
                    originalName: file.name,
                    fileType: fileType || ("DOCUMENT" as FileType),
                    mimeType: file.type,
                    fileSize: file.size,
                    uploadStartTime: Date.now(),
                };

                sessionRef.current = session;

                setState((prev) => ({
                    ...prev,
                    isUploading: false,
                    progress: 100,
                    currentFile: session,
                }));

                console.log(
                    "[useMediaUpload] Upload completed:",
                    session.fileId
                );

                options.onSuccess?.(session);

                return session;
            } catch (error: any) {
                console.error("[useMediaUpload] Upload failed:", error);

                const { code, message } = handleUploadError(error);

                setState((prev) => ({
                    ...prev,
                    isUploading: false,
                    error: message,
                    errorCode: code,
                    progress: 0,
                }));

                options.onError?.(error);

                return null;
            }
        },
        [state.isUploading, options, handleProgress]
    );

    /**
     * Cancel upload
     */
    const cancelUpload = useCallback(() => {
        console.log("[useMediaUpload] Cancelling upload");

        setState((prev) => ({
            ...prev,
            isUploading: false,
            progress: 0,
            currentFile: null,
            error: "Upload cancelled",
            errorCode: null,
        }));

        sessionRef.current = null;
    }, []);

    /**
     * Clear error state
     */
    const clearError = useCallback(() => {
        setState((prev) => ({
            ...prev,
            error: null,
            errorCode: null,
        }));
    }, []);

    /**
     * Reset all state
     */
    const reset = useCallback(() => {
        setState({
            isUploading: false,
            progress: 0,
            currentFile: null,
            error: null,
            errorCode: null,
        });
        sessionRef.current = null;
    }, []);

    /**
     * Get current session
     */
    const getCurrentSession = useCallback(() => {
        return sessionRef.current;
    }, []);

    return {
        // State
        isUploading: state.isUploading,
        progress: state.progress,
        currentFile: state.currentFile,
        error: state.error,
        errorCode: state.errorCode,

        // Methods
        uploadFile,
        cancelUpload,
        clearError,
        reset,
        getCurrentSession,
    };
};
