import { Platform } from "react-native";
import { api } from "./api";
import { authStorage } from "../runtime/storage";

const DEVICE_ID_KEY = "deviceId";

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

const createDeviceId = (): string => {
    return `device-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getDeviceUserAgent = (): string => {
    const version = Platform.Version ? String(Platform.Version) : "unknown";
    return `ChatChitMobile/${Platform.OS}; ${Platform.OS}/${version}`;
};

export const getOrCreateDeviceId = async (): Promise<string> => {
    const existing = await authStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
        return String(existing);
    }

    const next = createDeviceId();
    await authStorage.setItem(DEVICE_ID_KEY, next);
    return next;
};

export const getDeviceHeaders = async (): Promise<Record<string, string>> => {
    const deviceId = await getOrCreateDeviceId();
    const isWeb = Platform.OS === "web";
    return {
        "x-device-id": deviceId,
        "x-device-type": isWeb ? "desktop-web" : "mobile-app",
        "x-device-platform": isWeb ? "web" : "app",
        "x-display-label": Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android device" : "Web browser",
        ...(isWeb ? {} : { "user-agent": getDeviceUserAgent() }),
    };
};

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
