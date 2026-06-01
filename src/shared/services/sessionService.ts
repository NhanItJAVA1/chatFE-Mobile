import { Platform } from "react-native";
import { api } from "./api";
import { authStorage } from "../runtime/storage";

const DEVICE_ID_KEY = "deviceId";

export type AuthSession = {
    id?: string;
    deviceId: string;
    deviceType?: string;
    devicePlatform?: string;
    displayLabel?: string;
    deviceLocation?: string;
    userAgent?: string;
    lastActiveAt?: string;
    createdAt?: string;
    current?: boolean;
};

const createDeviceId = (): string => {
    return `device-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    };
};

export class SessionService {
    static async getSessions(): Promise<AuthSession[]> {
        const response = await api.get("/auth/sessions");
        const data = response?.data?.data || response?.data || response;
        const sessions = data?.items || data?.sessions || data;
        return Array.isArray(sessions) ? sessions : [];
    }

    static async revokeSession(deviceId: string): Promise<void> {
        await api.delete(`/auth/sessions/${deviceId}`);
    }

    static async revokeOtherSessions(): Promise<void> {
        await api.delete("/auth/sessions");
    }

    static async revokeAllSessions(): Promise<void> {
        await api.post("/auth/logout-all");
    }
}

export const sessionService = SessionService;
