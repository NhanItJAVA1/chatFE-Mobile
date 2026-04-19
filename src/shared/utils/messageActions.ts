export type MessageActionStyle = "cancel" | "default" | "destructive";

export interface MessageActionButton {
    text: string;
    style?: MessageActionStyle;
    onPress: () => void;
}

export interface BuildMessageActionSheetOptions {
    isOwn: boolean;
    onDeleteForMe: () => void;
    onEdit?: () => void;
    onRevoke?: () => void;
    onForward?: () => void;
}

export const buildMessageActionSheetOptions = ({
    isOwn,
    onDeleteForMe,
    onEdit,
    onRevoke,
    onForward,
}: BuildMessageActionSheetOptions): MessageActionButton[] => {
    const buttons: MessageActionButton[] = [
        { text: "Hủy", style: "cancel", onPress: () => { } },
        { text: "Xóa phía tôi", style: "destructive", onPress: onDeleteForMe },
    ];

    if (isOwn && onEdit) {
        buttons.push({ text: "Sửa", style: "default", onPress: onEdit });
    }

    if (isOwn && onRevoke) {
        buttons.push({ text: "Thu hồi", style: "destructive", onPress: onRevoke });
    }

    if (onForward) {
        buttons.push({ text: "Chuyển tiếp", style: "default", onPress: onForward });
    }

    return buttons;
};