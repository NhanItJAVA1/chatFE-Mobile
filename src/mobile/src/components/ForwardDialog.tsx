import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../shared/services/api";
import { ConversationService } from "../../../shared/services/conversationService";
import { forwardService, type ForwardResult } from "../../../shared/services/forwardService";
import type { Conversation } from "../../../shared/services/conversationService";
import { getFriendsWithEnrichment } from "../../../shared/services/friendService";
import type { Friend } from "@/types";

type ForwardTarget = {
    id: string;
    displayName: string;
    subtitle: string;
    avatar?: string;
    type: "PRIVATE" | "GROUP";
};

interface ForwardDialogProps {
    visible: boolean;
    currentConversationId: string;
    currentUserId: string;
    messageIds: string[];
    excludeTargetIds?: string[];
    onDismiss: () => void;
    onForwardSuccess?: (result: ForwardResult) => void;
}

const ForwardDialog: React.FC<ForwardDialogProps> = ({
    visible,
    currentConversationId,
    currentUserId,
    messageIds,
    excludeTargetIds = [],
    onDismiss,
    onForwardSuccess,
}) => {
    const [loading, setLoading] = useState(false);
    const [forwarding, setForwarding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [targets, setTargets] = useState<ForwardTarget[]>([]);
    const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!visible) {
            return;
        }

        let isActive = true;

        const loadConversations = async () => {
            setLoading(true);
            setError(null);

            try {
                const [rawConversations, friends] = await Promise.all([
                    ConversationService.getConversations(1, 50),
                    getFriendsWithEnrichment(currentUserId),
                ]);

                const userCache = new Map<string, any>();
                const mergedTargets = new Map<string, ForwardTarget>();
                const excludedTargetIdSet = new Set(
                    [currentConversationId, ...excludeTargetIds]
                        .filter(Boolean)
                        .map((id) => String(id))
                );

                const addTarget = (target: ForwardTarget) => {
                    if (!target.id) {
                        return;
                    }

                    if (excludedTargetIdSet.has(String(target.id))) {
                        return;
                    }

                    mergedTargets.set(target.id, target);
                };

                friends.forEach((friend: Friend) => {
                    addTarget({
                        id: friend.friendId,
                        displayName: friend.friendInfo?.displayName || "Người dùng",
                        subtitle: friend.friendInfo?.phoneNumber || "Bạn bè",
                        avatar: friend.friendInfo?.avatar,
                        type: "PRIVATE",
                    });
                });

                for (const conversation of rawConversations) {
                    const conversationId = conversation.id || conversation._id || "";
                    if (!conversationId || conversationId === currentConversationId) {
                        continue;
                    }

                    const conversationType = String(conversation.type || "").toUpperCase();

                    if (conversationType === "PRIVATE") {
                        const otherUserId = conversation.members?.find((memberId) => memberId !== currentUserId);
                        if (!otherUserId || excludedTargetIdSet.has(String(otherUserId))) {
                            continue;
                        }

                        let user = userCache.get(otherUserId);
                        if (!user) {
                            try {
                                const response = await api.get(`/users/${otherUserId}`);
                                user = response?.data || response;
                                userCache.set(otherUserId, user);
                            } catch {
                                user = null;
                            }
                        }

                        addTarget({
                            id: otherUserId,
                            displayName: user?.displayName || user?.name || user?.phone || "Người dùng",
                            subtitle: user?.phone ? `Phone: ${user.phone}` : "Cuộc trò chuyện",
                            avatar: user?.avatarUrl || user?.avatar,
                            type: "PRIVATE",
                        });

                        continue;
                    }

                    if (conversationType !== "GROUP") {
                        continue;
                    }

                    if (excludedTargetIdSet.has(conversationId)) {
                        continue;
                    }

                    addTarget({
                        id: conversationId,
                        displayName: conversation.name || "Nhóm",
                        subtitle: Array.isArray(conversation.members)
                            ? `${conversation.members.length} thành viên`
                            : "Nhóm chat",
                        avatar: conversation.avatarUrl,
                        type: "GROUP",
                    });
                }

                if (isActive) {
                    setTargets(Array.from(mergedTargets.values()));
                }
            } catch (loadError: any) {
                if (isActive) {
                    setError(loadError.message || "Không tải được danh sách cuộc trò chuyện");
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        loadConversations();

        return () => {
            isActive = false;
        };
    }, [visible, currentConversationId, currentUserId]);

    const filteredConversations = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return targets;
        return targets.filter((conversation) => {
            const haystack = `${conversation.displayName} ${conversation.subtitle}`.toLowerCase();
            return haystack.includes(needle);
        });
    }, [targets, query]);

    const toggleConversation = (conversationId: string) => {
        setSelectedConversationIds((prev) => {
            const next = new Set(prev);
            if (next.has(conversationId)) {
                next.delete(conversationId);
            } else {
                next.add(conversationId);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        setSelectedConversationIds((prev) => {
            const next = new Set(prev);
            const allSelected = filteredConversations.every((conversation) => next.has(conversation.id));

            if (allSelected) {
                filteredConversations.forEach((conversation) => {
                    next.delete(conversation.id);
                });
                return next;
            }

            filteredConversations.forEach((conversation) => {
                next.add(conversation.id);
            });
            return next;
        });
    };

    const handleForward = async () => {
        const selectedTargetIds = Array.from(selectedConversationIds);
        if (!selectedTargetIds.length) {
            setError("Chọn ít nhất một người nhận");
            return;
        }

        setForwarding(true);
        setError(null);

        try {
            const targetConversationIds = await Promise.all(
                selectedTargetIds.map(async (friendId) => {
                    const conversation = await ConversationService.getOrCreatePrivateConversation(friendId);
                    return conversation.id || conversation._id || "";
                })
            );

            const result = await forwardService.forwardMessages({
                userId: currentUserId,
                messageIds,
                targetConversationIds: targetConversationIds.filter(Boolean),
                currentConversationId,
            });

            onForwardSuccess?.(result);
            onDismiss();
            setSelectedConversationIds(new Set());
        } catch (forwardError: any) {
            setError(forwardError.message || "Chuyển tiếp thất bại");
        } finally {
            setForwarding(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Pressable onPress={onDismiss} style={styles.headerAction}>
                        <Ionicons name="close" size={22} color="#666" />
                    </Pressable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.title}>Chuyển tiếp {messageIds.length} tin nhắn</Text>
                        <Text style={styles.subtitle}>{selectedConversationIds.size} người nhận</Text>
                    </View>
                    <Pressable
                        onPress={handleForward}
                        disabled={forwarding || !selectedConversationIds.size}
                        style={styles.headerAction}
                    >
                        <Text style={[styles.forwardText, (!selectedConversationIds.size || forwarding) && styles.forwardTextDisabled]}>
                            {forwarding ? "Đang gửi..." : "Gửi"}
                        </Text>
                    </Pressable>
                </View>

                <View style={styles.searchWrap}>
                    <Ionicons name="search" size={18} color="#999" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Tìm người nhận..."
                        placeholderTextColor="#999"
                        value={query}
                        onChangeText={setQuery}
                    />
                </View>

                <View style={styles.selectAllRow}>
                    <Text style={styles.selectAllText}>Chọn tất cả ({filteredConversations.length})</Text>
                    <Switch
                        value={filteredConversations.length > 0 && filteredConversations.every((conversation) => selectedConversationIds.has(conversation.id || ""))}
                        onValueChange={handleSelectAll}
                    />
                </View>

                {error && (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#4f8cff" />
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.list}>
                        {filteredConversations.length === 0 ? (
                            <View style={styles.centered}>
                                <Text style={styles.emptyText}>Không có cuộc trò chuyện phù hợp</Text>
                            </View>
                        ) : (
                            filteredConversations.map((conversation) => {
                                const conversationId = conversation.id;
                                const selected = selectedConversationIds.has(conversationId);
                                const isGroup = conversation.type === "GROUP";

                                return (
                                    <Pressable
                                        key={conversationId}
                                        onPress={() => toggleConversation(conversationId)}
                                        style={[styles.item, selected && styles.itemSelected]}
                                    >
                                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                                            {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                                        </View>
                                        <View style={styles.itemMeta}>
                                            <Text style={styles.itemTitle} numberOfLines={1}>
                                                {conversation.displayName}{isGroup ? " (Nhóm)" : ""}
                                            </Text>
                                            <Text style={styles.itemSubtitle} numberOfLines={1}>
                                                {conversation.subtitle}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    headerAction: {
        width: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    headerCenter: {
        flex: 1,
        alignItems: "center",
    },
    title: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111",
    },
    subtitle: {
        fontSize: 12,
        color: "#777",
        marginTop: 2,
    },
    forwardText: {
        color: "#4f8cff",
        fontSize: 15,
        fontWeight: "700",
    },
    forwardTextDisabled: {
        color: "#bbb",
    },
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        margin: 16,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: "#f5f7fb",
        borderWidth: 1,
        borderColor: "#e8ebf3",
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        color: "#111",
    },
    selectAllRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    selectAllText: {
        fontSize: 13,
        color: "#333",
        fontWeight: "600",
    },
    errorBanner: {
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 10,
        backgroundColor: "#fff1f1",
        borderRadius: 10,
    },
    errorText: {
        color: "#c62828",
        fontSize: 12,
    },
    list: {
        paddingHorizontal: 16,
        paddingBottom: 24,
        gap: 8,
    },
    centered: {
        flex: 1,
        minHeight: 260,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    emptyText: {
        color: "#777",
        fontSize: 14,
    },
    item: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 14,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#edf0f6",
        gap: 12,
    },
    itemSelected: {
        borderColor: "#4f8cff",
        backgroundColor: "#f3f7ff",
    },
    checkbox: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        borderColor: "#d7dbe6",
        alignItems: "center",
        justifyContent: "center",
    },
    checkboxSelected: {
        borderColor: "#4f8cff",
        backgroundColor: "#4f8cff",
    },
    itemMeta: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#111",
    },
    itemSubtitle: {
        fontSize: 12,
        color: "#777",
        marginTop: 2,
    },
});

export default ForwardDialog;