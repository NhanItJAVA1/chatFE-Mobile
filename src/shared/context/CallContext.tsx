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
import { Audio } from "expo-av";
import { AudioSession } from "@livekit/react-native";
import { RTCView } from "@livekit/react-native-webrtc";
import { LocalVideoTrack, Room, RoomEvent, Track, TrackEvent, type VideoTrack as LiveKitVideoTrack } from "livekit-client";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { callService, type CallSession, type CallType } from "../services/callService";
import { callSocket, type CallSocketPayload } from "../services/callSocket";

const ringtoneAsset = require("../sound/a-ringtone.mp3");

type CallStatus = "idle" | "calling" | "incoming" | "active" | "ending";
type CallConversationType = "PRIVATE" | "GROUP";
type CallParticipantStatus = "invited" | "ringing" | "joined" | "declined" | "missed" | "left" | "busy";

interface CallParticipantState {
    status: CallParticipantStatus;
}

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

interface WaitingCallState {
    payload: CallSocketPayload;
    displayName: string;
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
    waitingCall: WaitingCallState | null;
    startCall: (conversationIdOrOptions: string | StartCallOptions, type?: CallType) => Promise<void>;
    joinActiveCall: (call: CallSession, conversationType?: CallConversationType) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => Promise<void>;
    acceptWaitingCall: () => Promise<void>;
    rejectWaitingCall: () => Promise<void>;
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
    return (
        error instanceof Error &&
        ((error as any).status === 409 || error.message.includes("409"))
    );
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
    const [waitingCall, setWaitingCall] = useState<WaitingCallState | null>(null);
    const stateRef = useRef<CallState>(initialState);
    const currentUserIdRef = useRef(currentUserId);
    const roomRef = useRef<Room | null>(null);
    const currentCallIdRef = useRef<string | null>(null);
    const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const outgoingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringtoneRef = useRef<Audio.Sound | null>(null);
    const participantsRef = useRef<Record<string, CallParticipantState>>({});
    const hadRemoteParticipantRef = useRef(false);
    const autoEndingRef = useRef(false);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        currentUserIdRef.current = currentUserId;
    }, [currentUserId]);

    const getPayloadUserId = useCallback((payload: CallSocketPayload) => {
        const rawUserId =
            payload.userId ||
            (payload as any).leftUserId ||
            (payload as any).participantId ||
            (payload as any).participantIdentity ||
            (payload as any).identity ||
            (payload as any).participant?.userId ||
            (payload as any).participant?.id ||
            (payload as any).participant?.identity ||
            (payload as any).user?.id ||
            "";

        return rawUserId ? String(rawUserId) : "";
    }, []);

    const getPayloadDisplayName = useCallback((payload: CallSocketPayload) => {
        return String(
            (payload as any).callerName ||
            (payload as any).displayName ||
            (payload as any).name ||
            (payload as any).caller?.name ||
            (payload as any).user?.name ||
            (payload.callerId ? `Người gọi ${String(payload.callerId).slice(-4)}` : "Người gọi"),
        );
    }, []);

    const updateParticipantStatus = useCallback((payload: CallSocketPayload, status: CallParticipantStatus) => {
        const userId = getPayloadUserId(payload);
        if (!userId) return;

        participantsRef.current = {
            ...participantsRef.current,
            [userId]: { status },
        };
    }, [getPayloadUserId]);

    const isCurrentUserLastJoinedParticipant = useCallback(() => {
        const currentState = stateRef.current;
        if (currentState.conversationType !== "GROUP" || currentState.status !== "active") {
            return false;
        }

        if (roomRef.current?.remoteParticipants.size) {
            return false;
        }

        const joinedIds = Object.entries(participantsRef.current)
            .filter(([, participant]) => participant.status === "joined")
            .map(([id]) => id);

        if (joinedIds.length === 0) {
            return true;
        }

        return joinedIds.every((id) => String(id) === currentUserIdRef.current);
    }, []);

    const shouldEndGroupCallForTwoParticipants = useCallback(() => {
        const currentState = stateRef.current;
        if (currentState.conversationType !== "GROUP" || currentState.status !== "active") {
            return false;
        }

        return (roomRef.current?.remoteParticipants.size || 0) <= 1;
    }, []);

    const clearIncomingTimer = useCallback(() => {
        if (incomingTimerRef.current) {
            clearTimeout(incomingTimerRef.current);
            incomingTimerRef.current = null;
        }
    }, []);

    const clearOutgoingTimer = useCallback(() => {
        if (outgoingTimerRef.current) {
            clearTimeout(outgoingTimerRef.current);
            outgoingTimerRef.current = null;
        }
    }, []);

    const stopRingtone = useCallback(async () => {
        const ringtone = ringtoneRef.current;
        ringtoneRef.current = null;

        if (ringtone) {
            try {
                await ringtone.stopAsync();
                await ringtone.unloadAsync();
            } catch {
                // Ringtone may already be stopped or unloaded.
            }
        }
    }, []);

    const startRingtone = useCallback(async () => {
        await stopRingtone();

        try {
            const { sound } = await Audio.Sound.createAsync(
                ringtoneAsset,
                { shouldPlay: true, isLooping: true, volume: 1 },
            );
            ringtoneRef.current = sound;
        } catch {
            // Ringtone is non-critical; call UI still appears.
        }
    }, [stopRingtone]);

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
        clearOutgoingTimer();
        await stopRingtone();
        await cleanupRoom();
        currentCallIdRef.current = null;
        participantsRef.current = {};
        hadRemoteParticipantRef.current = false;
        autoEndingRef.current = false;
        dispatch({ type: "RESET" });
    }, [cleanupRoom, clearIncomingTimer, clearOutgoingTimer, stopRingtone]);

    const endGroupCallIfCurrentUserIsAlone = useCallback(async () => {
        const callId = currentCallIdRef.current;
        if (
            !callId ||
            autoEndingRef.current ||
            !hadRemoteParticipantRef.current ||
            !isCurrentUserLastJoinedParticipant()
        ) {
            return;
        }

        autoEndingRef.current = true;
        dispatch({ type: "ENDING" });
        try {
            await callService.endCall(callId);
            callSocket.leaveCallRoom(callId);
        } finally {
            await resetCall();
            autoEndingRef.current = false;
        }
    }, [isCurrentUserLastJoinedParticipant, resetCall]);

    const endGroupCallIfPeerLeftTwoParticipantCall = useCallback(async () => {
        const callId = currentCallIdRef.current;
        if (!callId || autoEndingRef.current || !shouldEndGroupCallForTwoParticipants()) {
            return;
        }

        autoEndingRef.current = true;
        dispatch({ type: "ENDING" });
        try {
            await callService.endCall(callId);
            callSocket.leaveCallRoom(callId);
        } finally {
            await resetCall();
            autoEndingRef.current = false;
        }
    }, [resetCall, shouldEndGroupCallForTwoParticipants]);

    const showIncomingCall = useCallback(
        (payload: CallSocketPayload) => {
            if (!payload.callId || payload.callerId === currentUserId) return;
            const currentState = stateRef.current;
            if (
                currentCallIdRef.current &&
                currentCallIdRef.current !== payload.callId &&
                currentState.status !== "idle"
            ) {
                setWaitingCall({
                    payload,
                    displayName: getPayloadDisplayName(payload),
                });
                return;
            }
            if (
                currentCallIdRef.current === payload.callId &&
                currentState.status !== "idle" &&
                currentState.status !== "incoming"
            ) {
                return;
            }

            currentCallIdRef.current = payload.callId;
            participantsRef.current = {};
            if (payload.callerId) {
                participantsRef.current[String(payload.callerId)] = { status: "joined" };
            }
            dispatch({ type: "INCOMING", payload });
            void startRingtone();
            clearIncomingTimer();
            incomingTimerRef.current = setTimeout(() => {
                if (payload.callId === currentCallIdRef.current && stateRef.current.status === "incoming") {
                    void callService.missedCall(payload.callId).finally(resetCall);
                }
            }, 30000);
        },
        [clearIncomingTimer, currentUserId, getPayloadDisplayName, resetCall, startRingtone],
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
            room.on(RoomEvent.ParticipantConnected, (participant) => {
                hadRemoteParticipantRef.current = true;
                if (participant.identity) {
                    participantsRef.current = {
                        ...participantsRef.current,
                        [String(participant.identity)]: { status: "joined" },
                    };
                }
                clearOutgoingTimer();
                syncRoomMediaState(room);
            });
            room.on(RoomEvent.ParticipantDisconnected, (participant) => {
                if (participant.identity) {
                    participantsRef.current = {
                        ...participantsRef.current,
                        [String(participant.identity)]: { status: "left" },
                    };
                }
                syncRoomMediaState(room);
                void endGroupCallIfCurrentUserIsAlone();
            });
            [
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
        [cleanupRoom, clearOutgoingTimer, resetCall, syncRoomMediaState],
    );

    const joinAndConnect = useCallback(
        async (callId: string, callType: CallType) => {
            const joined = await callService.joinCall(callId);
            callSocket.joinCallRoom(callId);
            if (currentUserId) {
                participantsRef.current = {
                    ...participantsRef.current,
                    [currentUserId]: { status: "joined" },
                };
            }
            await connectToLiveKit(joined.token, joined.wsUrl, joined.roomName, callType);
        },
        [connectToLiveKit, currentUserId],
    );

    const joinActiveCall = useCallback(
        async (call: CallSession, conversationType: CallConversationType = "PRIVATE") => {
            if (!call?.callId) {
                Alert.alert("Không thể tham gia", "Cuộc gọi chưa sẵn sàng.");
                return;
            }
            if (state.status !== "idle") {
                Alert.alert("Đang có cuộc gọi", "Vui lòng kết thúc cuộc gọi hiện tại trước.");
                return;
            }

            try {
                currentCallIdRef.current = call.callId;
                participantsRef.current = currentUserId
                    ? { [currentUserId]: { status: "joined" } }
                    : {};
                dispatch({ type: "CALLING", call, conversationType });
                await joinAndConnect(call.callId, call.type || "audio");
            } catch (error) {
                const message = getErrorMessage(error, "Không thể tham gia cuộc gọi");
                dispatch({ type: "ERROR", error: message });
                Alert.alert("Không thể tham gia cuộc gọi", message);
                await resetCall();
            }
        },
        [currentUserId, joinAndConnect, resetCall, state.status],
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
                participantsRef.current = currentUserId
                    ? { [currentUserId]: { status: "joined" } }
                    : {};
                hadRemoteParticipantRef.current = false;
                dispatch({ type: "CALLING", call: created.call, conversationType });
                if (conversationType === "PRIVATE") {
                    clearOutgoingTimer();
                    outgoingTimerRef.current = setTimeout(() => {
                        const hasRemoteParticipant = roomRef.current?.remoteParticipants.size > 0;
                        if (
                            currentCallIdRef.current === created.call.callId &&
                            stateRef.current.status === "calling" &&
                            !hasRemoteParticipant
                        ) {
                            void callService.endCall(created.call.callId).finally(resetCall);
                        }
                    }, 15000);
                }
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
                        participantsRef.current = currentUserId
                            ? { [currentUserId]: { status: "joined" } }
                            : {};
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
        [clearOutgoingTimer, currentUserId, joinAndConnect, resetCall, state.status],
    );

    const acceptCall = useCallback(async () => {
        if (!state.callId) return;
        try {
            clearIncomingTimer();
            await stopRingtone();
            await joinAndConnect(state.callId, state.type);
        } catch (error) {
            const message = getErrorMessage(error, "Không thể nghe máy");
            Alert.alert("Lỗi cuộc gọi", message);
            await resetCall();
        }
    }, [clearIncomingTimer, joinAndConnect, resetCall, state.callId, state.type, stopRingtone]);

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
        const shouldEndRemoteCall =
            state.status === "calling" ||
            shouldEndGroupCallForTwoParticipants() ||
            (state.conversationType === "GROUP" && isCurrentUserLastJoinedParticipant());
        dispatch({ type: "ENDING" });
        try {
            if (callId) {
                if (shouldEndRemoteCall) {
                    await callService.endCall(callId);
                } else {
                    const response = await callService.leaveCall(callId);
                    const payload = (response as any)?.data?.data ?? (response as any)?.data ?? response;
                    if (
                        state.conversationType === "GROUP" &&
                        !payload?.terminal &&
                        (shouldEndGroupCallForTwoParticipants() || isCurrentUserLastJoinedParticipant())
                    ) {
                        await callService.endCall(callId);
                    }
                }
                callSocket.leaveCallRoom(callId);
            }
        } finally {
            await resetCall();
        }
    }, [
        isCurrentUserLastJoinedParticipant,
        resetCall,
        shouldEndGroupCallForTwoParticipants,
        state.callId,
        state.conversationType,
        state.status,
    ]);

    const acceptWaitingCall = useCallback(async () => {
        const nextCall = waitingCall;
        if (!nextCall?.payload?.callId) return;

        setWaitingCall(null);
        try {
            if (currentCallIdRef.current) {
                await endCall();
            }

            const payload = nextCall.payload;
            const conversationType =
                payload.conversationType ||
                (payload.isGroup ? "GROUP" : "PRIVATE");
            const nextType = payload.type || "audio";

            currentCallIdRef.current = payload.callId;
            participantsRef.current = {};
            if (payload.callerId) {
                participantsRef.current[String(payload.callerId)] = { status: "joined" };
            }
            if (currentUserIdRef.current) {
                participantsRef.current[currentUserIdRef.current] = { status: "joined" };
            }

            dispatch({
                type: "CALLING",
                conversationType,
                call: {
                    callId: payload.callId,
                    conversationId: payload.conversationId,
                    callerId: payload.callerId || "",
                    type: nextType,
                    roomName: payload.roomName,
                    livekitProvider: payload.livekitProvider,
                },
            });
            await joinAndConnect(payload.callId, nextType);
        } catch (error) {
            const message = getErrorMessage(error, "Không thể chuyển sang cuộc gọi mới");
            dispatch({ type: "ERROR", error: message });
            Alert.alert("Lỗi cuộc gọi", message);
            await resetCall();
        }
    }, [endCall, joinAndConnect, resetCall, waitingCall]);

    const rejectWaitingCall = useCallback(async () => {
        const nextCall = waitingCall;
        setWaitingCall(null);
        if (!nextCall?.payload?.callId) return;

        try {
            await callService.rejectCall(nextCall.payload.callId);
            callSocket.leaveCallRoom(nextCall.payload.callId);
        } catch (error) {
            Alert.alert("Lỗi cuộc gọi", getErrorMessage(error, "Không thể từ chối cuộc gọi"));
        }
    }, [waitingCall]);

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
                    setWaitingCall((current) => current?.payload.callId === payload.callId ? null : current);
                    if (payload.callId === currentCallIdRef.current) {
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:joined", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        updateParticipantStatus(payload, "joined");
                        if (getPayloadUserId(payload) && getPayloadUserId(payload) !== currentUserId) {
                            hadRemoteParticipantRef.current = true;
                        }
                        clearOutgoingTimer();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:left", (payload) => {
                    if (payload.callId === currentCallIdRef.current) {
                        const leftUserId = getPayloadUserId(payload);
                        updateParticipantStatus(payload, "left");
                        if (leftUserId && leftUserId !== currentUserId) {
                            void endGroupCallIfPeerLeftTwoParticipantCall();
                        } else {
                            void endGroupCallIfCurrentUserIsAlone();
                        }
                    }
                }),
                callSocket.on<CallSocketPayload>("call:declined", (payload) => {
                    setWaitingCall((current) => current?.payload.callId === payload.callId ? null : current);
                    if (payload.callId === currentCallIdRef.current) {
                        updateParticipantStatus(payload, "declined");
                        if (stateRef.current.status === "active") {
                            return;
                        }
                        Alert.alert("Cuộc gọi", "Đối phương đã từ chối cuộc gọi.");
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:missed", (payload) => {
                    setWaitingCall((current) => current?.payload.callId === payload.callId ? null : current);
                    if (payload.callId === currentCallIdRef.current) {
                        updateParticipantStatus(payload, "missed");
                        if (stateRef.current.status === "active") {
                            return;
                        }
                        Alert.alert("Cuộc gọi", "Cuộc gọi không được trả lời.");
                        void resetCall();
                    }
                }),
                callSocket.on<CallSocketPayload>("call:busy", (payload) => {
                    setWaitingCall((current) => current?.payload.callId === payload.callId ? null : current);
                    if (payload.callId === currentCallIdRef.current) {
                        updateParticipantStatus(payload, "busy");
                        if (stateRef.current.status === "active") {
                            return;
                        }
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
            callSocket.disconnect();
        };
    }, [
        clearIncomingTimer,
        clearOutgoingTimer,
        currentUserId,
        endGroupCallIfCurrentUserIsAlone,
        endGroupCallIfPeerLeftTwoParticipantCall,
        getPayloadUserId,
        resetCall,
        showIncomingCall,
        token,
        updateParticipantStatus,
    ]);

    const value = useMemo(
        () => ({
            state,
            videoTiles,
            isCameraEnabled,
            isMicrophoneEnabled,
            waitingCall,
            startCall,
            joinActiveCall,
            acceptCall,
            rejectCall,
            acceptWaitingCall,
            rejectWaitingCall,
            endCall,
            toggleCamera,
            toggleMicrophone,
        }),
        [
            acceptWaitingCall,
            acceptCall,
            endCall,
            isCameraEnabled,
            isMicrophoneEnabled,
            joinActiveCall,
            rejectWaitingCall,
            rejectCall,
            startCall,
            state,
            toggleCamera,
            toggleMicrophone,
            videoTiles,
            waitingCall,
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
        waitingCall,
        acceptCall,
        rejectCall,
        acceptWaitingCall,
        rejectWaitingCall,
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
                {waitingCall ? (
                    <View style={styles.waitingBanner}>
                        <View style={styles.waitingTextWrap}>
                            <Text style={styles.waitingTitle} numberOfLines={1}>
                                {waitingCall.displayName}
                            </Text>
                            <Text style={styles.waitingSubtitle} numberOfLines={1}>
                                Đang gọi đến
                            </Text>
                        </View>
                        <View style={styles.waitingActions}>
                            <Pressable style={[styles.waitingButton, styles.waitingReject]} onPress={rejectWaitingCall}>
                                <Ionicons name="call" size={18} color="#FFFFFF" />
                            </Pressable>
                            <Pressable style={[styles.waitingButton, styles.waitingAccept]} onPress={acceptWaitingCall}>
                                <Ionicons name="call" size={18} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    </View>
                ) : null}
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
                    <View style={[styles.callControls, isActive && hasVideo && styles.videoCallControls]}>
                        {!(isActive && hasVideo) ? (
                            <View style={styles.iconWrap}>
                                <Ionicons name={hasVideo ? "videocam" : "call"} size={28} color="#FFFFFF" />
                            </View>
                        ) : null}
                        {!(isActive && hasVideo) ? (
                            <>
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
                            </>
                        ) : null}

                        {isBusy && state.status !== "active" ? (
                            <ActivityIndicator color="#FFFFFF" style={styles.loader} />
                        ) : null}

                        <View style={[styles.actions, isActive && hasVideo && styles.videoActions]}>
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
    waitingBanner: {
        position: "absolute",
        top: 48,
        left: 16,
        right: 16,
        zIndex: 100,
        elevation: 100,
        minHeight: 62,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "rgba(22,22,22,0.94)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    waitingTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    waitingTitle: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "800",
    },
    waitingSubtitle: {
        color: "rgba(255,255,255,0.68)",
        fontSize: 12,
        marginTop: 2,
        fontWeight: "600",
    },
    waitingActions: {
        flexDirection: "row",
        gap: 10,
    },
    waitingButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
    },
    waitingReject: {
        backgroundColor: "#DC2626",
        transform: [{ rotate: "135deg" }],
    },
    waitingAccept: {
        backgroundColor: "#16A34A",
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
    callControls: {
        alignItems: "center",
        width: "100%",
    },
    videoCallControls: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 26,
        paddingHorizontal: 16,
        zIndex: 40,
    },
    title: {
        color: "#FFFFFF",
        fontSize: 22,
        fontWeight: "800",
        textAlign: "center",
        paddingHorizontal: 8,
    },
    subtitle: {
        color: "rgba(255,255,255,0.72)",
        fontSize: 14,
        marginTop: 6,
        textAlign: "center",
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
    videoActions: {
        marginTop: 18,
        gap: 22,
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
