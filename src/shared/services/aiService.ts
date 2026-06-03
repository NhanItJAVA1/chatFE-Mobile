import { api } from "./api";

export type AiTone = "formal" | "casual" | "funny" | "professional";

export interface AiSummarizeResponse {
    summary: string[];
    originalCount: number;
    conversationId: string;
}

export interface AiSmartReplyResponse {
    replies: string[];
    lastMessage: string;
    lastSenderName?: string;
}

export interface AiToneAdjustResponse {
    original: string;
    adjusted: string;
    tone: AiTone;
}

export interface AiTranslateResponse {
    original: string;
    translated: string;
    sourceLang: string;
    targetLang: string;
}

export interface AiSmartSearchReference {
    messageId: string;
    conversationId: string;
    text: string;
    senderId: string;
    createdAt: string;
}

export interface AiSmartSearchResponse {
    answer: string;
    references: AiSmartSearchReference[];
}

export interface AiExtractedTask {
    description: string;
    assignee?: string;
    deadline?: string;
    status: "pending" | "in_progress" | "done";
}

export interface AiReminderSuggestion {
    title: string;
    remindAt: string;
    assignee?: string;
    sourceMessageId?: string;
}

export interface AiExtractTasksResponse {
    tasks: AiExtractedTask[];
    reminderSuggestions: AiReminderSuggestion[];
    originalCount: number;
    conversationId: string;
}

const unwrap = <T>(response: any): T => {
    return (response?.data || response) as T;
};

export const aiService = {
    summarize: async (
        conversationId: string,
        maxMessages = 80
    ): Promise<AiSummarizeResponse> => {
        const response = await api.post("/ai/summarize", {
            conversationId,
            maxMessages,
        });
        return unwrap<AiSummarizeResponse>(response);
    },

    smartReply: async (conversationId: string): Promise<AiSmartReplyResponse> => {
        const response = await api.post("/ai/smart-reply", { conversationId });
        return unwrap<AiSmartReplyResponse>(response);
    },

    toneAdjust: async (
        message: string,
        tone: AiTone
    ): Promise<AiToneAdjustResponse> => {
        const response = await api.post("/ai/tone-adjust", { message, tone });
        return unwrap<AiToneAdjustResponse>(response);
    },

    translate: async (
        text: string,
        targetLang = "Vietnamese",
        sourceLang?: string
    ): Promise<AiTranslateResponse> => {
        const response = await api.post("/ai/translate", {
            text,
            targetLang,
            ...(sourceLang ? { sourceLang } : {}),
        });
        return unwrap<AiTranslateResponse>(response);
    },

    detectLanguage: async (text: string): Promise<string> => {
        const response = await api.post("/ai/detect-language", { text });
        const payload = unwrap<{ language: string }>(response);
        return payload.language;
    },

    smartSearch: async (
        query: string,
        conversationId?: string
    ): Promise<AiSmartSearchResponse> => {
        const response = await api.post("/ai/smart-search", {
            query,
            ...(conversationId ? { conversationId } : {}),
        });
        return unwrap<AiSmartSearchResponse>(response);
    },

    extractTasks: async (
        conversationId: string,
        maxMessages = 80
    ): Promise<AiExtractTasksResponse> => {
        const response = await api.post("/ai/extract-tasks", {
            conversationId,
            maxMessages,
        });
        return unwrap<AiExtractTasksResponse>(response);
    },
};
