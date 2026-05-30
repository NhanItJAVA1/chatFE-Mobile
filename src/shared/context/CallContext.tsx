import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { callService, type CallSession, type CallType } from "../services/callService";
import { callSocket, type CallSocketPayload } from "../services/callSocket";

type CallStatus = "idle" | "calling" | "incoming" | "active" | "ending";

interface CallState {
    status: CallStatus;
    callId: string | null;
    conversationId: string | null;
    callerId: string | null;
    type: CallType;
    error: string | null;
}

type CallAction =
    | { type: "CALLING"; call: CallSession }
    | { type: "INCOMING"; payload: CallSocketPayload }
    | { type: "ACTIVE" }
    | { type: "ENDING" }
    | { type: "ERROR"; error: string }
    | { type: "RESET" };

const initialState: CallState = {
    status: "idle",
    callId: null,
    conversationId: null,
    callerId: null,
    type: "audio",
    error: null,
};

const callReducer = (state: CallState, action: CallAction): CallState => {
    switch (action.type) {
        case "CALLING":
            return {
                status: "calling",
                callId: action.call.callId,
                conversationId: action.call.conversationId,
                callerId: action.call.callerId,
                type: action.call.type,
                error: null,
            };
        case "INCOMING":
            return {
                status: "incoming",
                callId: action.payload.callId,
                conversationId: action.payload.conversationId,
                callerId: action.payload.callerId || null,
                type: action.payload.type || "audio",
                error: null,
            };
        case "ACTIVE":
            return { ...state, status: "active", error: null };
        case "ENDING":
            return { ...state, status: "ending" };
        case "ERROR":
            return { ...state, error: action.error };
        case "RESET":
            return { ...initialState };
        default:
            return state;
    }
};

interface CallContextValue {
    state: CallState;
    startCall: (conversationId: string, type?: CallType) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => Promise<void>;
    endCall: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message || fallback;
    return fallback;
};

export const CallProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, token } = useAuth();
    const [state, dispatch] = useReducer(callReducer, initialState);
    const roomRef = useRef<Room | null>(null);
    const currentCallIdRef = useRef<string | null>(null);
    const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearIncomingTimer = useCallback(() => {
        if (incomingTimerRef.current) {
            clearTimeout(incomingTimerRef.current);
            incomingTimerRef.current = null;
        }
    }, []);

    const cleanupRoom = useCallback(async () => {
        if (roomRef.current) {
            roomRef.current.disconnect();
            roomRef.current = null;
        }
        try {
            await AudioSession.stopAudioSession();
        } catch {
            // Audio session may already be stopped.
        }
    }, []);

    const resetCall = useCallback(async () => {
        clearIncomingTimer();
        await cleanupRoom();
        currentCallIdRef.current = null;
        dispatch({ type: "RESET" });
    }, [cleanupRoom, clearIncomingTimer]);

    const connectToLiveKit = useCallback(
        async (tokenValue: string, wsUrl: string, roomName: string, callType: CallType) => {
            if (!tokenValue || !wsUrl || !roomName) {
                throw new Error("Máy chủ chưa trả về đủ thông tin LiveKit");
            }

            await cleanupRoom();
            await AudioSession.startAudioSession();

            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });
            roomRef.current = room;

            room.on(RoomEvent.Connected, () => {
                dispatch({ type: "ACTIVE" });
            });
            room.on(RoomEvent.Disconnected, () => {
                void resetCall();
            });
            room.on(RoomEvent.MediaDevicesError, () => {
                Alert.alert("Lỗi cuộc gọi", "Không thể truy cập microphone/camera.");
            });

            await room.connect(wsUrl, tokenValue);
            await room.localParticipant.setMicrophoneEnabled(true);
            if (callType === "video") {
                await room.localParticipant.setCameraEnabled(true);
            }
            dispatch({ type: "ACTIVE" });
        },
        [cleanupRoom, resetCall],
    );

    const joinAndConnect = useCallback(
        async (callId: string, callType: CallType) => {
            const joined = await callService.joinCall(callId);
            callSocket.joinCallRoom(callId);
            await connectToLiveKit(joined.token, joined.wsUrl, joined.roomName, callType);
        },
        [connectToLiveKit],
    );

    const startCall = useCallback(
        async (conversationId: string, type: CallType = "audio") => {
            if (!conversationId) {
                Alert.alert("Không thể gọi", "Cuộc trò chuyện chưa sẵn sàng.");
                return;
            }
            if (state.status !== "idle") {
                Alert.alert("Đang có cuộc gọi", "Vui lòng kết thúc cuộc gọi hiện tại trước.");
                return;
            }

            try {
                const created = await callService.createCall({ conversationId, type });
                currentCallIdRef.current = created.call.callId;
                dispatch({ type: "CALLING", call: created.call });
                await joinAndConnect(created.call.callId, type);
            } catch (error) {
                const message = getErrorMessage(error, "Không thể bắt đầu cuộc gọi");
                dispatch({ type: "ERROR", error: message });
                Alert.alert("Không thể gọi", message);
                await resetCall();
            }
        },
        [joinAndConnect, resetCall, state.status],
    );

    const acceptCall = useCallback(async () => {
        if (!state.callId) return;
        try {
            clearIncomingTimer();
            await joinAndConnect(state.callId, state.type);
        } catch (error) {
            const message = getErrorMessage(error, "Không thể nghe máy");
            Alert.alert("Lỗi cuộc gọi", message);
            await resetCall();
        }
    }, [clearIncomingTimer, joinAndConnect, resetCall, state.callId, state.type]);

    const rejectCall = useCallback(async () => {
        if (!state.callId) return;
        dispatch({ type: "ENDING" });
        try {
            await callService.rejectCall(state.callId);
            callSocket.leaveCallRoom(state.callId);
        } finally {
            await resetCall();
        }
    }, [resetCall, state.callId]);

    const endCall = useCallback(async () => {
        const callId = currentCallIdRef.current || state.callId;
        dispatch({ type: "ENDING" });
        try {
            if (callId) {
                await callService.leaveCall(callId);
                callSocket.leaveCallRoom(callId);
            }
        } finally {
            await resetCall();
        }
    }, [resetCall, state.callId]);

    useEffect(() => {
        if (!user?.id || !token) return;

        let mounted = true;
        const cleanups: Array<() => void> = [];

        callSocket.connect().then(() => {
            if (!mounted) return;

            cleanups.push(
                callSocket.on<CallSocketPayload>("call:incoming", (payload) => {
                    if (!payload.callId || payload.callerId === user.id) return;
                    if (currentCallIdRef.current && currentCallIdRef.current !== payload.callId) return;

                    currentCallIdRef.current = payload.callId;
                    dispatch({ type: "INCOMING", payload });
                    clearIncomingTimer();
                    incomingTimerRef.current = setTimeout(() => {
                        if (payload.callId === currentCallIdRef.current) {
                            void callService.missedCall(payload.callId).finally(resetCall);
                        }
                    }, 30000);
                }),
                callSocket.on<CallSocketPayload>("call:ended", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:declined", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        Alert.alert("Cuộc gọi", "Đối phương đã từ chối cuộc gọi.");
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:missed", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        Alert.alert("Cuộc gọi", "Cuộc gọi không được trả lời.");
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:busy", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        Alert.alert("Cuộc gọi", "Người nhận đang bận.");
                        void resetCall();
                    }
                }),
            );
        });

        return () => {
            mounted = false;
            cleanups.forEach((cleanup) => cleanup());
            clearIncomingTimer();
        };
    }, [clearIncomingTimer, resetCall, token, user?.id]);

    const value = useMemo(
        () => ({ state, startCall, acceptCall, rejectCall, endCall }),
        [acceptCall, endCall, rejectCall, startCall, state],
    );

    return (
        <CallContext.Provider value={value}>
            {children}
            <CallOverlay />
        </CallContext.Provider>
    );
};

export const useCall = () => {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error("useCall must be used within CallProvider");
    }
    return context;
};

const CallOverlay = () => {
    const context = useContext(CallContext);
    if (!context || context.state.status === "idle") return null;

    const { state, acceptCall, rejectCall, endCall } = context;
    const isIncoming = state.status === "incoming";
    const isBusy = state.status === "calling" || state.status === "ending";

    return (
        <Modal transparent animationType="fade" visible>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.iconWrap}>
                        <Ionicons name={state.type === "video" ? "videocam" : "call"} size={28} color="#FFFFFF" />
                    </View>
                    <Text style={styles.title}>
                        {isIncoming
                            ? "Cuộc gọi đến"
                            : state.status === "active"
                                ? "Đang trong cuộc gọi"
                                : "Đang gọi..."}
                    </Text>
                    <Text style={styles.subtitle}>
                        {state.type === "video" ? "Video call" : "Audio call"}
                    </Text>

                    {isBusy && state.status !== "active" ? (
                        <ActivityIndicator color="#FFFFFF" style={styles.loader} />
                    ) : null}

                    <View style={styles.actions}>
                        {isIncoming ? (
                            <>
                                <Pressable style={[styles.actionButton, styles.reject]} onPress={rejectCall}>
                                    <Ionicons name="call" size={24} color="#FFFFFF" />
                                </Pressable>
                                <Pressable style={[styles.actionButton, styles.accept]} onPress={acceptCall}>
                                    <Ionicons name="call" size={24} color="#FFFFFF" />
                                </Pressable>
                            </>
                        ) : (
                            <Pressable style={[styles.actionButton, styles.reject]} onPress={endCall}>
                                <Ionicons name="call" size={24} color="#FFFFFF" />
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    card: {
        width: "100%",
        borderRadius: 24,
        padding: 24,
        backgroundColor: "#161616",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
    },
    iconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: "#2563EB",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    title: {
        color: "#FFFFFF",
        fontSize: 22,
        fontWeight: "800",
    },
    subtitle: {
        color: "rgba(255,255,255,0.72)",
        fontSize: 14,
        marginTop: 6,
    },
    loader: {
        marginTop: 18,
    },
    actions: {
        flexDirection: "row",
        gap: 28,
        marginTop: 28,
    },
    actionButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
    },
    accept: {
        backgroundColor: "#16A34A",
    },
    reject: {
        backgroundColor: "#DC2626",
        transform: [{ rotate: "135deg" }],
    },
});
