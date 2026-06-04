import { Platform } from "react-native";
import { authStorage } from "../runtime/storage";

const DEVICE_ID_KEY = "deviceId";

const createDeviceId = (): string => {
    return `device-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getDeviceUserAgent = (): string => {
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

export const getDeviceInfo = (deviceId?: string) => {
    const isWeb = Platform.OS === "web";
    const displayLabel = Platform.OS === "ios"
        ? "iPhone"
        : Platform.OS === "android"
            ? "Android device"
            : "Web browser";

    return {
        deviceId,
        userAgent: getDeviceUserAgent(),
        platform: isWeb ? "web" : "app",
        deviceType: isWeb ? "desktop-web" : "mobile-app",
        displayLabel,
    };
};

export const getDeviceHeaders = async (): Promise<Record<string, string>> => {
    const deviceId = await getOrCreateDeviceId();
    const deviceInfo = getDeviceInfo(deviceId);

    return {
        "x-device-id": deviceId,
        "x-device-type": deviceInfo.deviceType,
        "x-device-platform": deviceInfo.platform,
        "x-display-label": deviceInfo.displayLabel,
        ...(Platform.OS === "web" ? {} : { "user-agent": deviceInfo.userAgent }),
    };
};
