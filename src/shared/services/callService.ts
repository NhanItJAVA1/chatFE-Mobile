import { api } from "./api";

export type CallType = "audio" | "video";

export interface CallSession {
    callId: string;
    conversationId: string;
    callerId: string;
    type: CallType;
    roomName?: string;
    status?: string;
    livekitProvider?: "self-hosted" | "cloud";
}

export interface CreateCallPayload {
    conversationId: string;
    type: CallType;
    inviteeIds?: string[];
    inviteAll?: boolean;
}

export interface JoinCallResponse {
    call: CallSession;
    token: string;
    wsUrl: string;
    roomName: string;
    livekitProvider?: "self-hosted" | "cloud";
}

const unwrapData = <T>(response: any): T => {
    const payload = response?.data ?? response;
    return payload?.data ?? payload;
};

const normalizeCall = (raw: any): CallSession => {
    const call = raw?.call ?? raw;
    return {
        ...call,
        callId: call?.callId || call?.id,
        conversationId: call?.conversationId,
        callerId: call?.callerId,
        type: call?.type || "audio",
    };
};

export const callService = {
    async createCall(payload: CreateCallPayload) {
        const response = await api.post("/calls", payload);
        const data = unwrapData<any>(response);
        return {
            call: normalizeCall(data?.call ?? data),
            invitedUserIds: data?.invitedUserIds || [],
            busyUserIds: data?.busyUserIds || [],
        };
    },

    async joinCall(callId: string): Promise<JoinCallResponse> {
        const response = await api.post(`/calls/${callId}/join`);
        const data = unwrapData<any>(response);
        return {
            call: normalizeCall(data?.call),
            token: data?.token,
            wsUrl: data?.wsUrl,
            roomName: data?.roomName,
            livekitProvider: data?.livekitProvider,
        };
    },

    async leaveCall(callId: string) {
        return api.post(`/calls/${callId}/leave`);
    },

    async rejectCall(callId: string) {
        return api.post(`/calls/${callId}/reject`);
    },

    async missedCall(callId: string) {
        return api.post(`/calls/${callId}/missed`);
    },

    async endCall(callId: string) {
        return api.post(`/calls/${callId}/end`);
    },

    async getActiveByConversation(conversationId: string): Promise<CallSession | null> {
        const response = await api.get(`/calls/conversations/${conversationId}/active`);
        const data = unwrapData<any>(response);
        return data ? normalizeCall(data) : null;
    },
};
