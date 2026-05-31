import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    type LayoutChangeEvent,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    type ViewStyle,
} from "react-native";
import { AudioSession } from "@livekit/react-native";
import { RTCView } from "@livekit/react-native-webrtc";
import { LocalVideoTrack, Room, RoomEvent, Track, TrackEvent, type VideoTrack as LiveKitVideoTrack } from "livekit-client";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { callService, type CallSession, type CallType } from "../services/callService";
import { callSocket, type CallSocketPayload } from "../services/callSocket";

type CallStatus = "idle" | "calling" | "incoming" | "active" | "ending";
type CallConversationType = "PRIVATE" | "GROUP";

interface StartCallOptions {
    conversationId: string;
    type?: CallType;
    conversationType?: CallConversationType;
    inviteAll?: boolean;
    inviteeIds?: string[];
}

interface CallState {
    status: CallStatus;
    callId: string | null;
    conversationId: string | null;
    callerId: string | null;
    type: CallType;
    conversationType: CallConversationType;
    error: string | null;
}

interface CallVideoTile {
    id: string;
    participantIdentity: string;
    track: LiveKitVideoTrack;
    isLocal: boolean;
}

type CallAction =
    | { type: "CALLING"; call: CallSession; conversationType: CallConversationType }
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
    conversationType: "PRIVATE",
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
                conversationType: action.conversationType,
                error: null,
            };
        case "INCOMING":
            const conversationType =
                action.payload.conversationType ||
                (action.payload.isGroup ? "GROUP" : "PRIVATE");
            return {
                status: "incoming",
                callId: action.payload.callId,
                conversationId: action.payload.conversationId,
                callerId: action.payload.callerId || null,
                type: action.payload.type || "audio",
                conversationType,
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
    videoTiles: CallVideoTile[];
    isCameraEnabled: boolean;
    isMicrophoneEnabled: boolean;
    startCall: (conversationIdOrOptions: string | StartCallOptions, type?: CallType) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => Promise<void>;
    endCall: () => Promise<void>;
    toggleCamera: () => Promise<void>;
    toggleMicrophone: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message || fallback;
    return fallback;
};

const isActiveCallConflict = (error: unknown) => {
    return error instanceof Error && error.message.includes("409");
};

const collectVideoTiles = (room: Room | null): CallVideoTile[] => {
    if (!room) return [];

    const tiles: CallVideoTile[] = [];

    const localCamera = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (localCamera?.videoTrack && !localCamera.isMuted) {
        tiles.push({
            id: `local-${localCamera.trackSid || "camera"}`,
            participantIdentity: room.localParticipant.identity || "Bạn",
            track: localCamera.videoTrack,
            isLocal: true,
        });
    }

    room.remoteParticipants.forEach((participant) => {
        const camera = participant.getTrackPublication(Track.Source.Camera);
        if (!camera?.videoTrack || camera.isMuted) return;

        tiles.push({
            id: `${participant.sid || participant.identity}-${camera.trackSid || "camera"}`,
            participantIdentity: participant.name || participant.identity || "Người tham gia",
            track: camera.videoTrack,
            isLocal: false,
        });
    });

    return tiles;
};

export const CallProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, token } = useAuth();
    const currentUserId = useMemo(
        () => String(user?.id || (user as any)?._id || (user as any)?.userId || ""),
        [user],
    );
    const [state, dispatch] = useReducer(callReducer, initialState);
    const [videoTiles, setVideoTiles] = useState<CallVideoTile[]>([]);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);
    const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
    const roomRef = useRef<Room | null>(null);
    const currentCallIdRef = useRef<string | null>(null);
    const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearIncomingTimer = useCallback(() => {
        if (incomingTimerRef.current) {
            clearTimeout(incomingTimerRef.current);
            incomingTimerRef.current = null;
        }
    }, []);

    const syncRoomMediaState = useCallback((room: Room | null = roomRef.current) => {
        setVideoTiles(collectVideoTiles(room));
        setIsCameraEnabled(Boolean(room?.localParticipant.isCameraEnabled));
        setIsMicrophoneEnabled(Boolean(room?.localParticipant.isMicrophoneEnabled));
    }, []);

    const cleanupRoom = useCallback(async () => {
        if (roomRef.current) {
            roomRef.current.disconnect();
            roomRef.current = null;
        }
        setVideoTiles([]);
        setIsCameraEnabled(false);
        setIsMicrophoneEnabled(false);
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

    const showIncomingCall = useCallback(
        (payload: CallSocketPayload) => {
            if (!payload.callId || payload.callerId === currentUserId) return;
            if (currentCallIdRef.current && currentCallIdRef.current !== payload.callId) return;

            currentCallIdRef.current = payload.callId;
            dispatch({ type: "INCOMING", payload });
            clearIncomingTimer();
            incomingTimerRef.current = setTimeout(() => {
                if (payload.callId === currentCallIdRef.current) {
                    void callService.missedCall(payload.callId).finally(resetCall);
                }
            }, 30000);
        },
        [clearIncomingTimer, currentUserId, resetCall],
    );

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
                syncRoomMediaState(room);
                dispatch({ type: "ACTIVE" });
            });
            room.on(RoomEvent.Disconnected, () => {
                void resetCall();
            });
            room.on(RoomEvent.MediaDevicesError, () => {
                Alert.alert("Lỗi cuộc gọi", "Không thể truy cập microphone/camera.");
            });
            [
                RoomEvent.ParticipantConnected,
                RoomEvent.ParticipantDisconnected,
                RoomEvent.TrackSubscribed,
                RoomEvent.TrackUnsubscribed,
                RoomEvent.TrackMuted,
                RoomEvent.TrackUnmuted,
                RoomEvent.LocalTrackPublished,
                RoomEvent.LocalTrackUnpublished,
            ].forEach((eventName) => {
                room.on(eventName, () => syncRoomMediaState(room));
            });

            await room.connect(wsUrl, tokenValue);
            await room.localParticipant.setMicrophoneEnabled(true);
            if (callType === "video") {
                await room.localParticipant.setCameraEnabled(true);
            }
            syncRoomMediaState(room);
            dispatch({ type: "ACTIVE" });
        },
        [cleanupRoom, resetCall, syncRoomMediaState],
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
        async (conversationIdOrOptions: string | StartCallOptions, fallbackType: CallType = "audio") => {
            const options: StartCallOptions =
                typeof conversationIdOrOptions === "string"
                    ? { conversationId: conversationIdOrOptions, type: fallbackType, conversationType: "PRIVATE" }
                    : conversationIdOrOptions;
            const conversationId = options.conversationId;
            const type = options.type || fallbackType;
            const conversationType = options.conversationType || "PRIVATE";

            if (!conversationId) {
                Alert.alert("Không thể gọi", "Cuộc trò chuyện chưa sẵn sàng.");
                return;
            }
            if (state.status !== "idle") {
                Alert.alert("Đang có cuộc gọi", "Vui lòng kết thúc cuộc gọi hiện tại trước.");
                return;
            }

            try {
                const created = await callService.createCall({
                    conversationId,
                    type,
                    ...(conversationType === "GROUP" ? { inviteAll: options.inviteAll ?? true } : {}),
                    ...(options.inviteeIds?.length ? { inviteeIds: options.inviteeIds } : {}),
                });
                currentCallIdRef.current = created.call.callId;
                dispatch({ type: "CALLING", call: created.call, conversationType });
                await joinAndConnect(created.call.callId, type);
            } catch (error) {
                if (isActiveCallConflict(error)) {
                    try {
                        const activeCall = await callService.getActiveByConversation(conversationId);
                        if (!activeCall?.callId) {
                            throw new Error("Không tìm thấy cuộc gọi đang hoạt động.");
                        }

                        const activeType = activeCall.type || type;
                        currentCallIdRef.current = activeCall.callId;
                        dispatch({ type: "CALLING", call: activeCall, conversationType });
                        await joinAndConnect(activeCall.callId, activeType);
                        return;
                    } catch (joinError) {
                        const message = getErrorMessage(joinError, "Không thể tham gia cuộc gọi đang hoạt động");
                        dispatch({ type: "ERROR", error: message });
                        Alert.alert("Không thể tham gia cuộc gọi", message);
                        await resetCall();
                        return;
                    }
                }

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

    const toggleCamera = useCallback(async () => {
        const room = roomRef.current;
        if (!room || state.status !== "active") return;

        try {
            const nextEnabled = !room.localParticipant.isCameraEnabled;
            await room.localParticipant.setCameraEnabled(nextEnabled);
            syncRoomMediaState(room);
        } catch (error) {
            const message = getErrorMessage(error, "Không thể bật camera");
            Alert.alert("Lỗi camera", message);
            syncRoomMediaState(room);
        }
    }, [state.status, syncRoomMediaState]);

    const toggleMicrophone = useCallback(async () => {
        const room = roomRef.current;
        if (!room || state.status !== "active") return;

        try {
            const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
            await room.localParticipant.setMicrophoneEnabled(nextEnabled);
            syncRoomMediaState(room);
        } catch (error) {
            const message = getErrorMessage(error, "Không thể đổi trạng thái microphone");
            Alert.alert("Lỗi microphone", message);
            syncRoomMediaState(room);
        }
    }, [state.status, syncRoomMediaState]);

    useEffect(() => {
        if (!currentUserId || !token) return;

        let mounted = true;
        const cleanups: Array<() => void> = [];

        callSocket.connect().then(() => {
            if (!mounted) return;

            cleanups.push(
                callSocket.on<CallSocketPayload>("call:incoming", (payload) => {
                    showIncomingCall(payload);
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
    }, [clearIncomingTimer, currentUserId, resetCall, showIncomingCall, token]);

    const value = useMemo(
        () => ({
            state,
            videoTiles,
            isCameraEnabled,
            isMicrophoneEnabled,
            startCall,
            acceptCall,
            rejectCall,
            endCall,
            toggleCamera,
            toggleMicrophone,
        }),
        [
            acceptCall,
            endCall,
            isCameraEnabled,
            isMicrophoneEnabled,
            rejectCall,
            startCall,
            state,
            toggleCamera,
            toggleMicrophone,
            videoTiles,
        ],
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

const ROTATED_VIDEO_DIRECTION = "-90deg";

const CallVideoRenderer = ({
    track,
    mirror,
    zOrder,
}: {
    track: LiveKitVideoTrack;
    mirror?: boolean;
    zOrder: number;
}) => {
    const [mediaStream, setMediaStream] = useState(track.mediaStream);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        setMediaStream(track.mediaStream);

        if (track instanceof LocalVideoTrack) {
            const handleRestarted = (nextTrack: Track | null) => {
                setMediaStream(nextTrack?.mediaStream);
            };

            track.on(TrackEvent.Restarted, handleRestarted);
            return () => {
                track.off(TrackEvent.Restarted, handleRestarted);
            };
        }

        return undefined;
    }, [track]);

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setContainerSize((current) => (
            current.width === width && current.height === height
                ? current
                : { width, height }
        ));
    }, []);

    const handleDimensionsChange = useCallback((event: { nativeEvent: { width: number; height: number } }) => {
        const { width, height } = event.nativeEvent;
        setVideoSize((current) => (
            current.width === width && current.height === height
                ? current
                : { width, height }
        ));
    }, []);

    const videoStyle = useMemo<ViewStyle>(() => {
        const isContainerPortrait = containerSize.height > containerSize.width;
        const isVideoLandscape = videoSize.width > videoSize.height;
        const shouldRotate = isContainerPortrait && isVideoLandscape;

        if (!shouldRotate || !containerSize.width || !containerSize.height) {
            return styles.videoView;
        }

        return {
            position: "absolute",
            width: containerSize.height,
            height: containerSize.width,
            left: (containerSize.width - containerSize.height) / 2,
            top: (containerSize.height - containerSize.width) / 2,
            transform: [{ rotate: ROTATED_VIDEO_DIRECTION }],
        };
    }, [containerSize.height, containerSize.width, videoSize.height, videoSize.width]);

    return (
        <View style={styles.videoRenderer} onLayout={handleLayout}>
            <RTCView
                style={videoStyle}
                streamURL={(mediaStream as any)?.toURL?.() ?? ""}
                objectFit="cover"
                mirror={mirror}
                zOrder={zOrder}
                onDimensionsChange={handleDimensionsChange}
            />
        </View>
    );
};

const CallOverlay = () => {
    const context = useContext(CallContext);
    if (!context || context.state.status === "idle") return null;

    const {
        state,
        videoTiles,
        isCameraEnabled,
        isMicrophoneEnabled,
        acceptCall,
        rejectCall,
        endCall,
        toggleCamera,
        toggleMicrophone,
    } = context;
    const isIncoming = state.status === "incoming";
    const isBusy = state.status === "calling" || state.status === "ending";
    const isActive = state.status === "active";
    const hasVideo = videoTiles.length > 0;
    const localVideoTile = videoTiles.find((tile) => tile.isLocal);
    const remoteVideoTiles = videoTiles.filter((tile) => !tile.isLocal);
    const stageVideoTiles = (remoteVideoTiles.length > 0 ? remoteVideoTiles : localVideoTile ? [localVideoTile] : []).slice(0, 4);

    return (
        <Modal transparent animationType="fade" visible>
            <View style={styles.overlay}>
                <View style={[styles.card, isActive && hasVideo && styles.videoCard]}>
                    {isActive && hasVideo ? (
                        <View style={styles.videoStage}>
                            {stageVideoTiles.map((tile, index) => (
                                <View
                                    key={tile.id}
                                    style={[
                                        styles.videoTile,
                                        stageVideoTiles.length === 1 && styles.singleVideoTile,
                                        stageVideoTiles.length === 2 && styles.twoVideoTile,
                                        stageVideoTiles.length > 2 && styles.gridVideoTile,
                                    ]}
                                >
                                    <CallVideoRenderer
                                        track={tile.track}
                                        mirror={tile.isLocal}
                                        zOrder={index}
                                    />
                                    <View style={styles.videoNameBadge}>
                                        <Text style={styles.videoName} numberOfLines={1}>
                                            {tile.isLocal ? "Bạn" : tile.participantIdentity}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                            {localVideoTile && remoteVideoTiles.length > 0 ? (
                                <View style={[styles.videoTile, styles.pipVideoTile]}>
                                    <CallVideoRenderer
                                        track={localVideoTile.track}
                                        mirror
                                        zOrder={10}
                                    />
                                    <View style={styles.videoNameBadge}>
                                        <Text style={styles.videoName} numberOfLines={1}>
                                            Bạn
                                        </Text>
                                    </View>
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                    <View style={styles.iconWrap}>
                        <Ionicons name={hasVideo ? "videocam" : "call"} size={28} color="#FFFFFF" />
                    </View>
                    <Text style={styles.title}>
                        {isIncoming
                            ? state.conversationType === "GROUP"
                                ? "Cuộc gọi nhóm"
                                : "Cuộc gọi đến"
                            : state.status === "active"
                                ? state.conversationType === "GROUP"
                                    ? "Đang trong cuộc gọi nhóm"
                                    : "Đang trong cuộc gọi"
                                : state.conversationType === "GROUP"
                                    ? "Đang gọi nhóm..."
                                    : "Đang gọi..."}
                    </Text>
                    <Text style={styles.subtitle}>
                        {state.conversationType === "GROUP" ? "Group " : ""}
                        {hasVideo ? "video call" : "audio call"}
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
                            <>
                                {isActive ? (
                                    <>
                                        <Pressable
                                            style={[
                                                styles.actionButton,
                                                styles.secondaryAction,
                                                !isMicrophoneEnabled && styles.secondaryActionOff,
                                            ]}
                                            onPress={toggleMicrophone}
                                        >
                                            <Ionicons
                                                name={isMicrophoneEnabled ? "mic" : "mic-off"}
                                                size={24}
                                                color="#FFFFFF"
                                            />
                                        </Pressable>
                                        <Pressable
                                            style={[
                                                styles.actionButton,
                                                styles.secondaryAction,
                                                isCameraEnabled && styles.cameraActionOn,
                                            ]}
                                            onPress={toggleCamera}
                                        >
                                            <Ionicons
                                                name={isCameraEnabled ? "videocam" : "videocam-off"}
                                                size={24}
                                                color="#FFFFFF"
                                            />
                                        </Pressable>
                                    </>
                                ) : null}
                                <Pressable style={[styles.actionButton, styles.reject]} onPress={endCall}>
                                    <Ionicons name="call" size={24} color="#FFFFFF" />
                                </Pressable>
                            </>
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
    videoCard: {
        flex: 1,
        width: "100%",
        borderRadius: 0,
        paddingHorizontal: 16,
        paddingTop: 44,
        paddingBottom: 32,
        backgroundColor: "#050505",
        borderWidth: 0,
        justifyContent: "flex-end",
    },
    videoStage: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: "row",
        flexWrap: "wrap",
        backgroundColor: "#000000",
    },
    videoTile: {
        overflow: "hidden",
        backgroundColor: "#111827",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    videoRenderer: {
        ...StyleSheet.absoluteFillObject,
        overflow: "hidden",
    },
    videoView: {
        ...StyleSheet.absoluteFillObject,
    },
    singleVideoTile: {
        width: "100%",
        height: "100%",
    },
    twoVideoTile: {
        width: "100%",
        height: "50%",
    },
    gridVideoTile: {
        width: "50%",
        height: "50%",
    },
    pipVideoTile: {
        position: "absolute",
        right: 16,
        top: 52,
        width: 116,
        height: 164,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.72)",
        zIndex: 20,
    },
    videoNameBadge: {
        position: "absolute",
        left: 10,
        bottom: 10,
        maxWidth: "72%",
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: "rgba(0,0,0,0.52)",
    },
    videoName: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "700",
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
        alignItems: "center",
        justifyContent: "center",
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
    secondaryAction: {
        backgroundColor: "rgba(255,255,255,0.18)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
    },
    secondaryActionOff: {
        backgroundColor: "rgba(220,38,38,0.72)",
    },
    cameraActionOn: {
        backgroundColor: "rgba(37,99,235,0.86)",
    },
    reject: {
        backgroundColor: "#DC2626",
        transform: [{ rotate: "135deg" }],
    },
});
