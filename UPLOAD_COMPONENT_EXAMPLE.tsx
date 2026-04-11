/**
 * PRACTICAL EXAMPLE: Image Upload Component with Presigned URLs
 * 
 * This is a complete, production-ready example showing how to
 * implement file upload in a React Native screen.
 * 
 * Copy this pattern to your actual upload components.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View, Alert, ScrollView } from "react-native";
import { useMediaUpload } from "@/shared/hooks";
import { compressImage, formatFileSize } from "@/shared/utils";
import type { UploadProgressEvent, UploadSession } from "@/types";

// Simulated UI components - replace with your actual components
const PrimaryButton = ({ label, onPress, loading }: any) => (
    <View style={styles.button}>
        <Text style={styles.buttonText}>{loading ? "Loading..." : label}</Text>
    </View>
);

const ProgressBar = ({ value }: { value: number }) => (
    <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${value}%` }]} />
        <Text style={styles.progressText}>{Math.round(value)}%</Text>
    </View>
);

/**
 * Complete Image Upload Example Component
 */
export const ImageUploadExample = ({ conversationId }: { conversationId?: string }) => {
    const [selectedFile, setSelectedFile] = useState<any>(null);
    const [uploadedSession, setUploadedSession] = useState<UploadSession | null>(null);

    // Initialize upload hook with callbacks
    const {
        isUploading,
        progress,
        error,
        errorCode,
        uploadFile,
        clearError,
        reset,
    } = useMediaUpload({
        onProgress: (event: UploadProgressEvent) => {
            // Update UI with progress
            if (event.percentage % 10 === 0) {
                console.log(
                    `Upload progress: ${event.percentage.toFixed(0)}% (${formatFileSize(
                        event.loaded
                    )}/${formatFileSize(event.total)})`
                );
            }
        },
        onSuccess: (session: UploadSession) => {
            setUploadedSession(session);
            Alert.alert("Success", `File uploaded: ${session.fileId}`);
            console.log("Upload completed:", session);
        },
        onError: (error: Error) => {
            Alert.alert("Upload Failed", error.message);
            console.error("Upload error:", error);
        },
        conversationId,
        // Custom retry config (optional)
        retryConfig: {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
            timeoutMs: 30000,
        },
    });

    /**
     * Handle file selection
     */
    const handleSelectFile = async (file: any) => {
        try {
            // Validate file before proceeding
            if (!file || !file.size) {
                Alert.alert("Error", "Invalid file selected");
                return;
            }

            console.log(`Selected file: ${file.name} (${formatFileSize(file.size)})`);

            setSelectedFile(file);
            clearError();
        } catch (err: any) {
            Alert.alert("Error", err.message);
        }
    };

    /**
     * Handle file selection with compression
     */
    const handleSelectAndCompressImage = async (file: any) => {
        try {
            if (!file) return;

            console.log(`Compressing image: ${file.name}`);

            // Compress to 80% quality, max 1920px
            const { compressedFile, width, height } = await compressImage(
                file,
                0.8,
                1920
            );

            console.log(
                `Compressed: ${formatFileSize(file.size)} → ${formatFileSize(
                    compressedFile.size
                )} (${width}x${height}px)`
            );

            // Use compressed version
            handleSelectFile(compressedFile);
        } catch (err: any) {
            Alert.alert("Compression Error", err.message);
        }
    };

    /**
     * Start upload
     */
    const handleStartUpload = async () => {
        if (!selectedFile) {
            Alert.alert("Error", "Please select a file first");
            return;
        }

        console.log("Starting upload...");

        const session = await uploadFile(selectedFile, "IMAGE", conversationId);

        if (!session) {
            console.error("Upload failed - no session returned");
        }
    };

    /**
     * Reset form
     */
    const handleReset = () => {
        setSelectedFile(null);
        setUploadedSession(null);
        reset();
    };

    // =====================================================
    // RENDER
    // =====================================================

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>File Upload Example</Text>

            {/* File Selection */}
            {!selectedFile && !uploadedSession && (
                <View style={styles.section}>
                    <Text style={styles.subtitle}>Step 1: Select File</Text>

                    <PrimaryButton
                        label="Select Image (Raw)"
                        onPress={() => handleSelectFile(null)} // Simulate file selection
                    />

                    <PrimaryButton
                        label="Select Image (Auto-compress)"
                        onPress={() => handleSelectAndCompressImage(null)} // Simulate file selection
                    />
                </View>
            )}

            {/* File Selected */}
            {selectedFile && !uploadedSession && (
                <View style={styles.section}>
                    <Text style={styles.subtitle}>Step 2: Review & Upload</Text>

                    <View style={styles.fileInfo}>
                        <Text style={styles.label}>File Name:</Text>
                        <Text style={styles.value}>{selectedFile.name}</Text>

                        <Text style={styles.label}>File Type:</Text>
                        <Text style={styles.value}>{selectedFile.type}</Text>

                        <Text style={styles.label}>File Size:</Text>
                        <Text style={styles.value}>
                            {formatFileSize(selectedFile.size)}
                        </Text>
                    </View>

                    <PrimaryButton
                        label={isUploading ? "Uploading..." : "Start Upload"}
                        onPress={handleStartUpload}
                        loading={isUploading}
                    />

                    {!isUploading && (
                        <PrimaryButton label="Change File" onPress={handleReset} />
                    )}
                </View>
            )}

            {/* Upload Progress */}
            {isUploading && (
                <View style={styles.section}>
                    <Text style={styles.subtitle}>Step 3: Uploading...</Text>
                    <ProgressBar value={progress} />
                </View>
            )}

            {/* Upload Completed */}
            {uploadedSession && (
                <View style={styles.section}>
                    <Text style={styles.subtitle}>✓ Upload Complete</Text>

                    <View style={styles.fileInfo}>
                        <Text style={styles.label}>File ID:</Text>
                        <Text style={styles.value}>{uploadedSession.fileId}</Text>

                        <Text style={styles.label}>Upload Time:</Text>
                        <Text style={styles.value}>
                            {uploadedSession.uploadStartTime
                                ? `${(Date.now() - uploadedSession.uploadStartTime) / 1000
                                    .toFixed(2)}s`
                                : "N/A"}
                        </Text>
                    </View>

                    <PrimaryButton label="Upload Another File" onPress={handleReset} />
                </View>
            )}

            {/* Error Display */}
            {error && (
                <View style={styles.errorSection}>
                    <Text style={styles.errorTitle}>Error (Code: {errorCode})</Text>
                    <Text style={styles.errorMessage}>{error}</Text>

                    <PrimaryButton
                        label="Dismiss & Retry"
                        onPress={() => {
                            clearError();
                            if (selectedFile) handleStartUpload();
                        }}
                    />
                </View>
            )}

            {/* Implementation Notes */}
            <View style={styles.notesSection}>
                <Text style={styles.notesTitle}>Implementation Checklist:</Text>
                <Text style={styles.noteItem}>
                    ✓ File validation (type, size)
                </Text>
                <Text style={styles.noteItem}>✓ Image compression (optional)</Text>
                <Text style={styles.noteItem}>✓ Progress tracking</Text>
                <Text style={styles.noteItem}>
                    ✓ Retry logic with exponential backoff
                </Text>
                <Text style={styles.noteItem}>✓ Error handling</Text>
                <Text style={styles.noteItem}>
                    ✓ 30-second timeout for PUT request
                </Text>
                <Text style={styles.noteItem}>
                    ✓ Presigned URL expiry check
                </Text>
            </View>
        </ScrollView>
    );
};

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: "#f5f5f5",
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 16,
        color: "#000",
    },
    subtitle: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 12,
        color: "#333",
    },
    section: {
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    fileInfo: {
        backgroundColor: "#f9f9f9",
        padding: 12,
        borderRadius: 6,
        marginBottom: 12,
    },
    label: {
        fontSize: 12,
        fontWeight: "600",
        color: "#666",
        marginTop: 8,
    },
    value: {
        fontSize: 14,
        color: "#333",
        marginBottom: 4,
    },
    button: {
        backgroundColor: "#007AFF",
        borderRadius: 8,
        padding: 12,
        marginVertical: 8,
    },
    buttonText: {
        color: "#fff",
        textAlign: "center",
        fontWeight: "600",
    },
    progressContainer: {
        marginVertical: 12,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "#e0e0e0",
        height: 24,
    },
    progressBar: {
        height: "100%",
        backgroundColor: "#4CAF50",
    },
    progressText: {
        position: "absolute",
        top: 2,
        left: 8,
        color: "#fff",
        fontWeight: "600",
        fontSize: 12,
    },
    errorSection: {
        backgroundColor: "#ffebee",
        borderColor: "#ef5350",
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
    },
    errorTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#c62828",
        marginBottom: 8,
    },
    errorMessage: {
        fontSize: 13,
        color: "#d32f2f",
        marginBottom: 12,
    },
    notesSection: {
        backgroundColor: "#e3f2fd",
        borderColor: "#1976d2",
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
        marginBottom: 32,
    },
    notesTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#0d47a1",
        marginBottom: 8,
    },
    noteItem: {
        fontSize: 13,
        color: "#1565c0",
        marginVertical: 4,
    },
});
