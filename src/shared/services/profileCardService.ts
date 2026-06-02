import { api } from "./api";

export interface SendProfileCardPayload {
    userId: string;
}

export const profileCardService = {
    async sendProfileCard(conversationId: string, payload: SendProfileCardPayload): Promise<any> {
        const response = await api.post(`/conversations/${conversationId}/profile-cards`, payload);
        return response?.data || response;
    },
};

export default profileCardService;
