type Chat = {
    id: number;
    name: string;
    message: string;
    time: string;
    unread: number;
    accent: string;
    initials: string;
    verified?: boolean;
};

type Message = {
    id: number;
    type: "incoming" | "outgoing";
    text: string;
    time: string;
    edited?: boolean;
};

