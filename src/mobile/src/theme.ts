type Colors = {
    background: string;
    surface: string;
    surfaceElevated: string;
    surfaceSoft: string;
    border: string;
    text: string;
    textSoft: string;
    textMuted: string;
    accent: string;
    accentAlt: string;
    success: string;
    danger: string;
    incoming: string;
    outgoing: string;
    tabInactive: string;
};

type Gradients = {
    auth: string[];
    profile: string[];
};

export const colors: Colors = {
    background: "#000000",
    surface: "#111111",
    surfaceElevated: "#1a1a1a",
    surfaceSoft: "#151515",
    border: "#272727",
    text: "#ffffff",
    textSoft: "#b8b8b8",
    textMuted: "#7d7d7d",
    accent: "#3f8cff",
    accentAlt: "#7d5cff",
    success: "#28c76f",
    danger: "#ef4444",
    incoming: "#2a2a2a",
    outgoing: "#cc5f99",
    tabInactive: "#a4a4a4",
};

export const gradients: Gradients = {
    auth: ["#050505", "#111827", "#7c3aed"],
    profile: ["#0b0b0b", "#000000"],
};
