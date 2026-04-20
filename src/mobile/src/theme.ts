type Colors = {
    background: string;
    surface: string;
    surfaceElevated: string;
    surfaceSoft: string;
    border: string;
    text: string;
    textOnAccent: string;
    textSoft: string;
    textMuted: string;
    accent: string;
    accentStrong: string;
    accentAlt: string;
    success: string;
    successSeen: string;
    danger: string;
    dangerSoft: string;
    dangerStrong: string;
    dangerHot: string;
    white: string;
    black: string;
    overlayDark35: string;
    overlayDark50: string;
    overlayDark60: string;
    overlayDark65: string;
    overlayDarkWarm30: string;
    overlayDark94: string;
    overlayWhite10: string;
    overlayWhite18: string;
    overlayWhite30: string;
    overlayWhite75: string;
    mediaImageIcon: string;
    mediaAudioIcon: string;
    mediaDocumentIcon: string;
    mediaVideoIcon: string;
    contrastBorder: string;
    contrastText: string;
    incoming: string;
    outgoing: string;
    tabInactive: string;
    textSecondary: string;
    textPrimary: string;
};

type Gradients = {
    auth: string[];
    profile: string[];
};

type Assets = {
    chatBackground: any;
};

export const colors: Colors = {
    background: "#000000",
    surface: "#111111",
    surfaceElevated: "#1a1a1a",
    surfaceSoft: "#151515",
    border: "#272727",
    text: "#ffffff",
    textOnAccent: "#ffffff",
    textSoft: "#b8b8b8",
    textMuted: "#7d7d7d",
    accent: "#3f8cff",
    accentStrong: "#4f8cff",
    accentAlt: "#7d5cff",
    success: "#28c76f",
    successSeen: "#90EE90",
    danger: "#ef4444",
    dangerSoft: "#FF6B6B",
    dangerStrong: "#FF5C5C",
    dangerHot: "#FF2E55",
    white: "#ffffff",
    black: "#000000",
    overlayDark35: "rgba(0,0,0,0.35)",
    overlayDark50: "rgba(0,0,0,0.5)",
    overlayDark60: "rgba(0,0,0,0.6)",
    overlayDark65: "rgba(0,0,0,0.65)",
    overlayDarkWarm30: "rgba(20, 14, 14, 0.3)",
    overlayDark94: "rgba(6, 8, 18, 0.94)",
    overlayWhite10: "rgba(255,255,255,0.1)",
    overlayWhite18: "rgba(255,255,255,0.18)",
    overlayWhite30: "rgba(255,255,255,0.3)",
    overlayWhite75: "rgba(255,255,255,0.75)",
    mediaImageIcon: "#007AFF",
    mediaAudioIcon: "#FFA500",
    mediaDocumentIcon: "#6C5CE7",
    mediaVideoIcon: "#FF3B30",
    contrastBorder: "#221919",
    contrastText: "#221919",
    incoming: "#2a2a2a",
    outgoing: "#cc5f99",
    tabInactive: "#a4a4a4",
    textSecondary: "#b8b8b8",
    textPrimary: "#ffffff",
};

export const gradients: Gradients = {
    auth: ["#050505", "#111827", "#7c3aed"],
    profile: ["#0b0b0b", "#000000"],
};

export const assets: Assets = {
    chatBackground: require("../../shared/background/telegram-background.png"),
};
