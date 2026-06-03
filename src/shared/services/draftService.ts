import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { api } from "./api";

export type DraftMessage = {
    conversationId: string;
    text: string;
    updatedAt: string;
};

const DRAFT_KEY_PREFIX = "draft_message_v1_";
export const DRAFT_MESSAGE_CHANGED_EVENT = "draftMessageChanged";

const getDraftKey = (conversationId: string) => `${DRAFT_KEY_PREFIX}${conversationId}`;

export const draftService = {
    async getDraft(conversationId: string): Promise<DraftMessage | null> {
        if (!conversationId) return null;

        const raw = await AsyncStorage.getItem(getDraftKey(conversationId));
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as DraftMessage;
            return parsed?.text ? parsed : null;
        } catch {
            await AsyncStorage.removeItem(getDraftKey(conversationId));
            return null;
        }
    },

    async getDrafts(conversationIds: string[]): Promise<Record<string, DraftMessage>> {
        const uniqueIds = Array.from(new Set(conversationIds.filter(Boolean)));
        const entries = await Promise.all(
            uniqueIds.map(async (conversationId) => [conversationId, await draftService.getDraft(conversationId)] as const),
        );

        return entries.reduce<Record<string, DraftMessage>>((acc, [conversationId, draft]) => {
            if (draft) acc[conversationId] = draft;
            return acc;
        }, {});
    },

    async saveLocalDraft(conversationId: string, text: string): Promise<DraftMessage | null> {
        const trimmed = text.trim();
        if (!conversationId) return null;

        if (!trimmed) {
            await draftService.deleteLocalDraft(conversationId);
            return null;
        }

        const draft: DraftMessage = {
            conversationId,
            text,
            updatedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem(getDraftKey(conversationId), JSON.stringify(draft));
        DeviceEventEmitter.emit(DRAFT_MESSAGE_CHANGED_EVENT, draft);
        return draft;
    },

    async deleteLocalDraft(conversationId: string): Promise<void> {
        if (!conversationId) return;

        await AsyncStorage.removeItem(getDraftKey(conversationId));
        DeviceEventEmitter.emit(DRAFT_MESSAGE_CHANGED_EVENT, { conversationId, text: "" });
    },

    async syncDraft(conversationId: string, text: string): Promise<void> {
        if (!conversationId) return;

        await api.post(
            `/conversations/${conversationId}/drafts`,
            { text },
            { suppressErrorLog: true },
        );
    },

    async deleteRemoteDraft(conversationId: string): Promise<void> {
        if (!conversationId) return;

        await api.delete(`/conversations/${conversationId}/drafts`, {
            suppressErrorLog: true,
        });
    },
};

export default draftService;
