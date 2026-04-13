import { api } from "./api";
import type { MessagePayload } from "./socketService";

export interface ForwardRequestPayload {
    userId: string;
    messageIds: string[];
    targetConversationIds: string[];
    currentConversationId?: string;
}

export interface ForwardResult {
    messages: MessagePayload[];
    sentToCount: number;
    failedConversationIds?: string[];
}

class ForwardService {
    validateForward(
        messageIds: string[],
        targetConversationIds: string[],
        currentConversationId: string
    ): { valid: boolean; error?: string } {
        if (!messageIds.length) {
            return { valid: false, error: "Select at least one message" };
        }

        if (!targetConversationIds.length) {
            return { valid: false, error: "Select at least one conversation" };
        }

        if (messageIds.length > 100) {
            return { valid: false, error: "Maximum 100 messages per forward" };
        }

        if (targetConversationIds.length > 20) {
            return { valid: false, error: "Maximum 20 target conversations per forward" };
        }

        if (currentConversationId && targetConversationIds.includes(currentConversationId)) {
            return { valid: false, error: "Cannot forward to the same conversation" };
        }

        return { valid: true };
    }

    async forwardMessages(payload: ForwardRequestPayload): Promise<ForwardResult> {
        const validation = this.validateForward(
            payload.messageIds,
            payload.targetConversationIds,
            payload.currentConversationId || ""
        );

        if (!validation.valid) {
            throw new Error(validation.error || "Forward validation failed");
        }

        const response = await api.post("/messages/forward", payload);
        const data = response?.data || response;
        const messages = data?.data || data?.messages || data || [];

        return {
            messages: Array.isArray(messages) ? messages : [],
            sentToCount: payload.targetConversationIds.length,
            failedConversationIds: data?.failedConversationIds || [],
        };
    }
}

export const forwardService = new ForwardService();
export default forwardService;