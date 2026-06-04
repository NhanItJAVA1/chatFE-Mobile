import { api } from "./api";
import { SocketService, type GroupReminder, type GroupReminderStatus } from "./socketService";

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

const unwrapReminderList = (response: any): GroupReminder[] => {
    const data = unwrapData(response);
    const reminders =
        data?.reminders ??
        data?.items ??
        data?.data ??
        data;

    return Array.isArray(reminders) ? reminders : [];
};

const REMINDER_LIST_CACHE_TTL_MS = 30 * 1000;
const REMINDER_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;

type ReminderListCacheEntry = {
    items: GroupReminder[];
    expiresAt: number;
};

const reminderListCache = new Map<string, ReminderListCacheEntry>();
const reminderListInFlight = new Map<string, Promise<GroupReminder[]>>();
const reminderListRateLimitedUntil = new Map<string, number>();

const readCachedReminderList = (cacheKey: string): GroupReminder[] | null => {
    const cached = reminderListCache.get(cacheKey);
    if (!cached || cached.expiresAt <= Date.now()) {
        return null;
    }

    return cached.items;
};

const listRemindersWithGuard = async (
    cacheKey: string,
    request: () => Promise<GroupReminder[]>,
    force = false,
): Promise<GroupReminder[]> => {
    const cached = readCachedReminderList(cacheKey);
    if (!force && cached) {
        return cached;
    }

    const rateLimitedUntil = reminderListRateLimitedUntil.get(cacheKey) || 0;
    if (rateLimitedUntil > Date.now()) {
        if (cached) {
            return cached;
        }

        const error: any = new Error("Đang bị giới hạn request, vui lòng thử lại sau.");
        error.status = 429;
        throw error;
    }

    const inFlight = reminderListInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight;
    }

    const promise = request()
        .then((items) => {
            reminderListCache.set(cacheKey, {
                items,
                expiresAt: Date.now() + REMINDER_LIST_CACHE_TTL_MS,
            });
            return items;
        })
        .catch((error: any) => {
            if (error?.status === 429 || error?.responseBody?.statusCode === 429) {
                reminderListRateLimitedUntil.set(cacheKey, Date.now() + REMINDER_RATE_LIMIT_COOLDOWN_MS);
                if (cached) {
                    return cached;
                }
            }

            throw error;
        })
        .finally(() => {
            reminderListInFlight.delete(cacheKey);
        });

    reminderListInFlight.set(cacheKey, promise);
    return promise;
};

const invalidateReminderListCache = (conversationId: string): void => {
    reminderListCache.delete(`group:${conversationId}`);
    reminderListCache.delete(`conversation:${conversationId}`);
};

export class ReminderService {
    static async listGroupReminders(groupId: string, options: { force?: boolean } = {}): Promise<GroupReminder[]> {
        return listRemindersWithGuard(`group:${groupId}`, async () => {
            const response = await api.get(`/groups/${groupId}/reminders`, {
                suppressErrorLog: true,
            });
            return unwrapReminderList(response);
        }, options.force);
    }

    static async listConversationReminders(conversationId: string, options: { force?: boolean } = {}): Promise<GroupReminder[]> {
        return listRemindersWithGuard(`conversation:${conversationId}`, async () => {
            const response = await api.get(`/conversations/${conversationId}/reminders`, {
                suppressErrorLog: true,
            });
            return unwrapReminderList(response);
        }, options.force);
    }

    static async updateStatus(
        conversationId: string,
        reminderId: string,
        status: GroupReminderStatus,
    ): Promise<GroupReminder> {
        const reminder = await SocketService.updateReminder({
            conversationId,
            reminderId,
            status,
        });
        invalidateReminderListCache(conversationId);
        return reminder;
    }

    static async cancelReminder(conversationId: string, reminderId: string): Promise<GroupReminder> {
        return this.updateStatus(conversationId, reminderId, "cancelled");
    }
}

export default ReminderService;
