import { api } from "./api";
import type { GroupReminder } from "./socketService";

export type ReminderFilter = "all" | "active" | "done" | "cancelled";

export interface ReminderFormValues {
    title: string;
    description?: string;
    remindAt: string;
    repeatRule?: GroupReminder["repeatRule"];
    notifyBeforeMinutes?: number;
}

const unwrapData = (response: any): any => {
    return response?.data?.data ?? response?.data ?? response;
};

export class ReminderService {
    static async listGroupReminders(groupId: string): Promise<GroupReminder[]> {
        const response = await api.get(`/groups/${groupId}/reminders`);
        const data = unwrapData(response);
        return Array.isArray(data) ? data : [];
    }
}

export default ReminderService;
