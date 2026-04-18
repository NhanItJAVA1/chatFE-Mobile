import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    PanResponder,
    Alert,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { colors } from "../theme";
import chatMediaService from "../../../shared/services/chatMediaService";

export interface VoiceRecorderProps {
    visible: boolean;
    onHide: () => void;
    conversationId: string;
    messageText?: string;
    onMessageSent?: (messages: any[]) => void;
    onUploadProgress?: (progress: number) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
    visible,
    onHide,
    conversationId,
    messageText = "",
    onMessageSent,
    onUploadProgress,
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [isCanceling, setIsCanceling] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const cancelRef = useRef(false);
    const recordingStartPromiseRef = useRef<Promise<void> | null>(null);

    const startRecording = useCallback(async () => {
        if (!conversationId) {
            Alert.alert("Error", "Conversation is not ready yet");
            onHide();
            return;
        }

        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
            Alert.alert("Permission required", "Please allow microphone access to record audio.");
            onHide();
            return;
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            staysActiveInBackground: false,
        });

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();

        recordingRef.current = recording;
        cancelRef.current = false;
        setIsRecording(true);
        setIsCanceling(false);
        setRecordingSeconds(0);

        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
        }

        recordingIntervalRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
        }, 1000);
    }, [conversationId, onHide]);

    const stopRecording = useCallback(
        async (shouldSend: boolean) => {
            const recording = recordingRef.current;
            recordingRef.current = null;

            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }

            setIsRecording(false);
            setIsCanceling(false);

            if (!recording) {
                onHide();
                return;
            }

            try {
                await recording.stopAndUnloadAsync();
                const status = await recording.getStatusAsync();
                const uri = recording.getURI();

                if (!uri || !shouldSend || cancelRef.current) {
                    setRecordingSeconds(0);
                    onHide();
                    return;
                }

                const file = {
                    uri,
                    name: `audio-${Date.now()}.m4a`,
                    type: "audio/m4a",
                    mimeType: "audio/m4a",
                    size: 0,
                    duration: Math.round(
                        (status as any)?.durationMillis
                            ? (status as any).durationMillis / 1000
                            : recordingSeconds
                    ),
                };

                setIsUploading(true);
                onUploadProgress?.(0);

                const sentMessages = await chatMediaService.sendAudio(
                    conversationId,
                    file,
                    messageText || undefined,
                    (progress) => onUploadProgress?.(progress)
                );

                if (sentMessages.length > 0) {
                    onMessageSent?.(sentMessages);
                }

                onUploadProgress?.(0);
                setRecordingSeconds(0);
            } catch (error: any) {
                if (!cancelRef.current) {
                    Alert.alert("Error", `Failed to send audio: ${error.message}`);
                }
            } finally {
                setIsUploading(false);
                onHide();
                cancelRef.current = false;
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                }).catch(() => { });
            }
        },
        [conversationId, messageText, recordingSeconds, onMessageSent, onUploadProgress, onHide]
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                    if (!isRecording) {
                        recordingStartPromiseRef.current = startRecording();
                    }
                },
                onPanResponderMove: (_, gestureState) => {
                    if (!isRecording) {
                        return;
                    }

                    const shouldCancel = gestureState.moveX < 120 && gestureState.moveY < 170;
                    cancelRef.current = shouldCancel;
                    setIsCanceling(shouldCancel);
                },
                onPanResponderRelease: async () => {
                    if (recordingStartPromiseRef.current) {
                        await recordingStartPromiseRef.current.catch(() => { });
                        recordingStartPromiseRef.current = null;
                    }

                    if (recordingRef.current || isRecording) {
                        await stopRecording(!cancelRef.current);
                    }
                },
                onPanResponderTerminate: async () => {
                    if (recordingStartPromiseRef.current) {
                        await recordingStartPromiseRef.current.catch(() => { });
                        recordingStartPromiseRef.current = null;
                    }

                    cancelRef.current = true;
                    if (recordingRef.current || isRecording) {
                        await stopRecording(false);
                    } else {
                        onHide();
                    }
                },
            }),
        [isRecording, startRecording, stopRecording, onHide]
    );

    if (!visible) {
        return null;
    }

    return (
        <View style={styles.overlay}>
            <View style={styles.topRow}>
                <View style={styles.cancelZone}>
                    <Ionicons
                        name="close-circle"
                        size={32}
                        color={isCanceling ? colors.dangerSoft : colors.textMuted}
                    />
                    <Text
                        style={[
                            styles.cancelText,
                            isCanceling && styles.cancelTextActive,
                        ]}
                    >
                        Kéo vào đây để hủy
                    </Text>
                </View>
                <Text style={styles.recordingHint}>
                    Giữ để ghi âm, thả tay để gửi
                </Text>
            </View>

            <View style={styles.center}>
                <Text style={styles.timer}>
                    {`${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(
                        recordingSeconds % 60
                    ).padStart(2, "0")}`}
                </Text>
                {isUploading ? (
                    <View style={styles.micButton}>
                        <ActivityIndicator size="large" color={colors.textOnAccent} />
                    </View>
                ) : (
                    <View {...panResponder.panHandlers} style={[styles.micButton, isCanceling && styles.micButtonCanceling]}>
                        <Ionicons name="mic" size={34} color={colors.textOnAccent} />
                    </View>
                )}
                <Text style={styles.recordingSubtext}>
                    {isCanceling ? "Thả tay để hủy" : "Kéo lên góc X để hủy"}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        justifyContent: "space-between",
        paddingVertical: 40,
        zIndex: 1000,
    },
    topRow: {
        alignItems: "center",
        gap: 12,
    },
    cancelZone: {
        alignItems: "center",
        gap: 8,
    },
    cancelText: {
        color: colors.textMuted,
        fontSize: 14,
        fontWeight: "500",
    },
    cancelTextActive: {
        color: colors.danger,
    },
    recordingHint: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "500",
    },
    center: {
        alignItems: "center",
        gap: 24,
    },
    timer: {
        color: colors.text,
        fontSize: 48,
        fontWeight: "bold",
        fontFamily: "Courier New",
    },
    micButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.accent,
        justifyContent: "center",
        alignItems: "center",
    },
    micButtonCanceling: {
        backgroundColor: colors.danger,
    },
    recordingSubtext: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "500",
    },
});
