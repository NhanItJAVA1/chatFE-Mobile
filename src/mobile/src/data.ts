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

export const chats: Chat[] = [
    {
        id: 1,
        name: "Đức Tuấn Thủ",
        message: "Nhắn dân",
        time: "14/03",
        unread: 0,
        accent: "#76b7ff",
        initials: "ĐT",
    },
    {
        id: 2,
        name: "HK1_Năm4",
        message: "Www",
        time: "23/10/25",
        unread: 0,
        accent: "#44d4e3",
        initials: "H",
    },
    {
        id: 3,
        name: "Lập trình di động",
        message: "Đức Tuấn Thủ",
        time: "13/10/25",
        unread: 0,
        accent: "#ff9f45",
        initials: "LD",
    },
    {
        id: 4,
        name: "Con Bà Tính",
        message: "Ai biết đc",
        time: "07/09/25",
        unread: 0,
        accent: "#74d18b",
        initials: "CB",
    },
    {
        id: 5,
        name: "Sắc Phúc Phở Ức Phúc",
        message: "...đã tham gia Telegram",
        time: "21/08/25",
        unread: 0,
        accent: "#7d7cff",
        initials: "PS",
    },
    {
        id: 6,
        name: "ChatChit",
        message: "Ok",
        time: "17/08/25",
        unread: 2,
        accent: "#2d9cdb",
        initials: "CC",
        verified: true,
    },
];

export const conversation: Message[] = [
    {
        id: 1,
        type: "incoming",
        text: "Nhấn lỗn tấft",
        time: "13:39",
    },
    {
        id: 2,
        type: "incoming",
        text: "99đ",
        time: "13:43",
    },
    {
        id: 3,
        type: "incoming",
        text: "Ảo ma",
        time: "13:43",
    },
    {
        id: 4,
        type: "incoming",
        text: "24%",
        time: "13:43",
    },
    {
        id: 5,
        type: "incoming",
        text: "Last round",
        time: "13:55",
    },
    {
        id: 6,
        type: "incoming",
        text: "Off",
        time: "13:59",
    },
    {
        id: 7,
        type: "outgoing",
        text: "Đợi gánh miệt dị con gà",
        time: "14:02",
    },
    {
        id: 8,
        type: "incoming",
        text: "Quá ít",
        time: "14:02",
        edited: true,
    },
    {
        id: 9,
        type: "incoming",
        text: "Lên 1k điểm mới gọi là gánh",
        time: "14:02",
    },
    {
        id: 10,
        type: "outgoing",
        text: ":>>>",
        time: "14:03",
    },
];
