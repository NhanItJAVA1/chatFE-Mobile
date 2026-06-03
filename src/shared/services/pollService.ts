import { api } from "./api";
import type {
    AddPollOptionRequest,
    CreatePollRequest,
    Poll,
    VotePollRequest,
} from "@/types";

const unwrapPoll = (response: any): Poll => {
    return response?.data?.poll || response?.data?.data?.poll || response?.poll || response?.data || response;
};

const unwrapPollList = (response: any): Poll[] => {
    const data = response?.data?.polls
        || response?.data?.items
        || response?.data?.data?.polls
        || response?.polls
        || response?.items
        || response?.data
        || [];

    return Array.isArray(data) ? data.filter((poll) => {
        const status = String(poll?.status || "").toLowerCase();
        return status !== "deleted" && !poll?.deletedAt && !poll?.isDeleted;
    }) : [];
};

export class PollService {
    static async getPolls(groupId: string, params?: { status?: string; page?: number; limit?: number }): Promise<Poll[]> {
        const response = await api.get(`/groups/${groupId}/polls`, { params });
        return unwrapPollList(response);
    }

    static async getPoll(groupId: string, pollId: string): Promise<Poll> {
        const response = await api.get(`/groups/${groupId}/polls/${pollId}`);
        return unwrapPoll(response);
    }

    static async createPoll(groupId: string, payload: CreatePollRequest): Promise<Poll> {
        const response = await api.post(`/groups/${groupId}/polls`, payload);
        return unwrapPoll(response);
    }

    static async vote(groupId: string, pollId: string, payload: VotePollRequest): Promise<Poll> {
        const response = await api.post(`/groups/${groupId}/polls/${pollId}/vote`, payload);
        return unwrapPoll(response);
    }

    static async addOption(groupId: string, pollId: string, payload: AddPollOptionRequest): Promise<Poll> {
        const response = await api.post(`/groups/${groupId}/polls/${pollId}/options`, payload);
        return unwrapPoll(response);
    }

    static async getResults(groupId: string, pollId: string): Promise<any> {
        const response = await api.get(`/groups/${groupId}/polls/${pollId}/results`);
        return response?.data || response;
    }

    static async lock(groupId: string, pollId: string): Promise<Poll> {
        const response = await api.post(`/groups/${groupId}/polls/${pollId}/lock`);
        return unwrapPoll(response);
    }

    static async pin(groupId: string, pollId: string): Promise<Poll> {
        const response = await api.post(`/groups/${groupId}/polls/${pollId}/pin`);
        return unwrapPoll(response);
    }

    static async unpin(groupId: string, pollId: string): Promise<Poll> {
        const response = await api.delete(`/groups/${groupId}/polls/${pollId}/pin`);
        return unwrapPoll(response);
    }

    static async delete(groupId: string, pollId: string): Promise<void> {
        await api.delete(`/groups/${groupId}/polls/${pollId}`);
    }
}

export const pollService = PollService;
