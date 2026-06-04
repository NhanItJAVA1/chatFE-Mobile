import { api } from "./api";
import { getDeviceHeaders, getOrCreateDeviceId } from "./deviceInfo";

export type AuthSession = {
    id?: string;
    deviceId: string;
    deviceType?: string;
    platform?: string;
    devicePlatform?: string;
    displayLabel?: string;
    location?: string;
    deviceLocation?: string;
    userAgent?: string;
    lastActive?: string;
    lastActiveAt?: string;
    createdAt?: string;
    isCurrent?: boolean;
    current?: boolean;
};

export { getDeviceHeaders, getOrCreateDeviceId };

export class SessionService {
    static async getSessions(): Promise<AuthSession[]> {
        const response = await api.get("/auth/sessions", {
            headers: await getDeviceHeaders(),
        });
        console.log("[SessionService] Raw sessions response:", response);
        const data = response?.data?.data || response?.data || response;
        const sessions = data?.items || data?.sessions || data;
        if (!Array.isArray(sessions)) {
            console.log("[SessionService] Normalized sessions:", []);
            return [];
        }

        const normalized = sessions.map((session: any) => ({
            ...session,
            devicePlatform: session.devicePlatform || session.platform,
            deviceLocation: session.deviceLocation || session.location,
            lastActiveAt: session.lastActiveAt || session.lastActive,
            current: Boolean(session.current || session.isCurrent),
        }));
        console.log("[SessionService] Normalized sessions:", normalized);
        return normalized;
    }

    static async revokeSession(deviceId: string): Promise<void> {
        await api.delete(`/auth/sessions/${deviceId}`, {
            headers: await getDeviceHeaders(),
        });
    }

    static async revokeOtherSessions(): Promise<void> {
        await api.delete("/auth/sessions", {
            headers: await getDeviceHeaders(),
        });
    }

    static async revokeAllSessions(): Promise<void> {
        await api.post("/auth/logout-all");
    }
}

export const sessionService = SessionService;
