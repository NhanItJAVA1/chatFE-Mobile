import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Poll } from "@/types";
import { colors } from "../theme";

interface PollCardProps {
    poll: Poll;
    currentUserId: string;
    canManage: boolean;
    members?: Array<{ userId?: string; id?: string; _id?: string; name?: string; displayName?: string }>;
    onVote: (pollId: string, optionIds: string[]) => Promise<void>;
    onLock?: (pollId: string) => Promise<void>;
    onPin?: (pollId: string) => Promise<void>;
    onUnpin?: (pollId: string) => Promise<void>;
    onDelete?: (pollId: string) => Promise<void>;
    onAddOption?: (pollId: string, text: string) => Promise<void>;
}

const isPollClosed = (poll: Poll): boolean => {
    if (poll.isClosed || poll.status === "closed" || poll.status === "expired") {
        return true;
    }

    if (poll.expiresAt) {
        const expiresMs = Date.parse(poll.expiresAt);
        return Number.isFinite(expiresMs) && expiresMs <= Date.now();
    }

    return false;
};

const formatPollTime = (poll: Poll): string => {
    if (poll.expiresAt) {
        const expiresMs = Date.parse(poll.expiresAt);
        if (Number.isFinite(expiresMs)) {
            const diffMs = expiresMs - Date.now();
            if (diffMs <= 0) return "Đã hết hạn";
            const hours = Math.ceil(diffMs / (60 * 60 * 1000));
            if (hours < 24) return `Còn ${hours} giờ`;
            return `Còn ${Math.ceil(hours / 24)} ngày`;
        }
    }

    if (poll.createdAt) {
        return new Date(poll.createdAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return "";
};

const sameSet = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every((item) => rightSet.has(item));
};

export const PollCard: React.FC<PollCardProps> = ({
    poll,
    currentUserId,
    canManage,
    members = [],
    onVote,
    onLock,
    onPin,
    onUnpin,
    onDelete,
    onAddOption,
}) => {
    const [pendingOptionIds, setPendingOptionIds] = useState<string[] | null>(null);
    const [showAddOption, setShowAddOption] = useState(false);
    const [showVotersModal, setShowVotersModal] = useState(false);
    const [newOptionText, setNewOptionText] = useState("");
    const [isVoting, setIsVoting] = useState(false);
    const [isAddingOption, setIsAddingOption] = useState(false);
    const closed = isPollClosed(poll);
    const pinned = !!(poll.pinned || poll.isPinned);
    const canChangeVote = !!poll.allowChangeVote;
    const totalVotes = poll.totalVotes || poll.options.reduce((sum, option) => sum + (option.voteCount || 0), 0);
    const showResults = poll.showResultsBeforeClose !== false || closed || currentUserId === poll.createdBy || currentUserId === poll.creatorId;
    const canShowVoters = showResults && !poll.hideVoters;

    const userVotedOptionIds = useMemo(() => {
        return poll.options
            .filter((option) => option.votedUserIds?.includes(currentUserId))
            .map((option) => option.id);
    }, [poll.options, currentUserId]);

    const hasVoted = userVotedOptionIds.length > 0;
    const effectiveOptionIds = pendingOptionIds ?? userVotedOptionIds;
    const hasSelectionChanges = pendingOptionIds !== null && !sameSet(pendingOptionIds, userVotedOptionIds);

    const getVoterName = (userId: string): string => {
        const member = members.find((item) => String(item.userId || item.id || item._id || "") === String(userId));
        return member?.displayName || member?.name || userId;
    };

    const handleOptionPress = async (optionId: string) => {
        if (closed || isVoting) return;
        if (hasVoted && !canChangeVote) return;

        if (poll.isMultipleChoice) {
            const baseSelection = pendingOptionIds ?? userVotedOptionIds;
            setPendingOptionIds(
                baseSelection.includes(optionId)
                    ? baseSelection.filter((id) => id !== optionId)
                    : [...baseSelection, optionId]
            );
            return;
        }

        if (userVotedOptionIds.includes(optionId) && hasVoted) {
            return;
        }

        try {
            setIsVoting(true);
            await onVote(poll.id, [optionId]);
        } catch (error: any) {
            Alert.alert("Lỗi", error?.message || "Không thể bình chọn");
        } finally {
            setIsVoting(false);
        }
    };

    const submitMultipleChoice = async () => {
        if (!hasSelectionChanges || isVoting || pendingOptionIds === null) return;

        try {
            setIsVoting(true);
            await onVote(poll.id, pendingOptionIds);
            setPendingOptionIds(null);
        } catch (error: any) {
            Alert.alert("Lỗi", error?.message || "Không thể bình chọn");
        } finally {
            setIsVoting(false);
        }
    };

    const openVotersModal = () => {
        if (!showResults) {
            Alert.alert("Kết quả đang ẩn", "Kết quả sẽ hiển thị khi bình chọn được đóng.");
            return;
        }

        if (poll.hideVoters) {
            Alert.alert("Đã ẩn người bình chọn", "Bình chọn này không hiển thị danh sách người đã chọn.");
            return;
        }

        setShowVotersModal(true);
    };

    const openActions = () => {
        const actions: any[] = [{ text: "Hủy", style: "cancel" }];

        if (!closed && onLock) {
            actions.unshift({
                text: "Đóng bình chọn",
                onPress: () => onLock(poll.id).catch((error: any) => Alert.alert("Lỗi", error?.message || "Không thể đóng bình chọn")),
            });
        }

        if (pinned && onUnpin) {
            actions.unshift({
                text: "Bỏ ghim",
                onPress: () => onUnpin(poll.id).catch((error: any) => Alert.alert("Lỗi", error?.message || "Không thể bỏ ghim")),
            });
        } else if (onPin) {
            actions.unshift({
                text: "Ghim",
                onPress: () => onPin(poll.id).catch((error: any) => Alert.alert("Lỗi", error?.message || "Không thể ghim")),
            });
        }

        if (onDelete) {
            actions.unshift({
                text: "Xóa bình chọn",
                style: "destructive",
                onPress: () => {
                    Alert.alert("Xóa bình chọn", "Xóa bình chọn này khỏi nhóm?", [
                        { text: "Hủy", style: "cancel" },
                        {
                            text: "Xóa",
                            style: "destructive",
                            onPress: () => onDelete(poll.id).catch((error: any) => Alert.alert("Lỗi", error?.message || "Không thể xóa bình chọn")),
                        },
                    ]);
                },
            });
        }

        Alert.alert("Tùy chọn bình chọn", poll.question, actions);
    };

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View style={styles.titleWrap}>
                    <View style={styles.badgeRow}>
                        <View style={styles.badge}>
                            <Ionicons name="stats-chart" size={13} color={colors.accentStrong} />
                            <Text style={styles.badgeText}>Bình chọn</Text>
                        </View>
                        {pinned && (
                            <View style={styles.badge}>
                                <Ionicons name="pin" size={13} color={colors.accentStrong} />
                                <Text style={styles.badgeText}>Đã ghim</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.question}>{poll.question}</Text>
                </View>
                {canManage && (
                    <Pressable style={styles.iconButton} onPress={openActions} hitSlop={8}>
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                    </Pressable>
                )}
            </View>

            <View style={styles.metaRow}>
                <Text style={styles.metaText}>{poll.creatorName ? `Tạo bởi ${poll.creatorName}` : "Bình chọn nhóm"}</Text>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText}>{closed ? "Đã đóng" : formatPollTime(poll)}</Text>
            </View>

            <View style={styles.options}>
                {poll.options.map((option) => {
                    const voteCount = option.voteCount || 0;
                    const percentage = showResults && totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const selected = effectiveOptionIds.includes(option.id);
                    const voted = userVotedOptionIds.includes(option.id);
                    const pendingChanged = pendingOptionIds !== null;
                    const pendingAdded = pendingChanged && selected && !voted;
                    const pendingRemoved = pendingChanged && voted && !selected;
                    const selectedLabel = !showResults && selected
                        ? "Đã chọn"
                        : pendingAdded
                            ? "Thêm"
                            : pendingRemoved
                                ? "Bỏ"
                                : "";

                    return (
                        <Pressable
                            key={option.id}
                            style={[
                                styles.option,
                                selected && styles.optionSelected,
                                pendingRemoved && styles.optionRemoving,
                                closed && styles.optionDisabled,
                            ]}
                            onPress={() => handleOptionPress(option.id)}
                            disabled={closed || isVoting || (hasVoted && !canChangeVote)}
                        >
                            {showResults && <View style={[styles.optionFill, { width: `${percentage}%` }]} />}
                            <View style={styles.optionContent}>
                                <View style={[styles.selectMark, selected && styles.selectMarkActive]}>
                                    {selected && <Ionicons name="checkmark" size={12} color={colors.textOnAccent} />}
                                </View>
                                <Text style={styles.optionText} numberOfLines={2}>{option.text}</Text>
                                {selectedLabel ? (
                                    <Text style={[styles.optionCount, pendingRemoved && styles.removeLabel]}>{selectedLabel}</Text>
                                ) : showResults ? (
                                    <Text style={styles.optionCount}>{percentage}%</Text>
                                ) : null}
                            </View>
                            {showResults && (
                                <Pressable
                                    style={styles.voteCountButton}
                                    onPress={openVotersModal}
                                    disabled={!canShowVoters}
                                >
                                    <Text style={styles.voteCount}>
                                        {poll.hideVoters ? "Ẩn người chọn" : `${voteCount} lượt chọn`}
                                    </Text>
                                </Pressable>
                            )}
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.footerRow}>
                <Text style={styles.footerText}>
                    {showResults ? `${totalVotes} lượt bình chọn` : "Kết quả đang ẩn"}{poll.isMultipleChoice ? " • Chọn nhiều" : ""}
                </Text>
                {isVoting && <ActivityIndicator size="small" color={colors.accentStrong} />}
                {!closed && poll.isMultipleChoice && (
                    <Pressable
                        style={[styles.submitButton, (!hasSelectionChanges || isVoting) && styles.submitButtonDisabled]}
                        onPress={submitMultipleChoice}
                        disabled={!hasSelectionChanges || isVoting}
                    >
                        <Text style={styles.submitButtonText}>
                            {hasVoted ? `Cập nhật (${effectiveOptionIds.length})` : `Bình chọn (${effectiveOptionIds.length})`}
                        </Text>
                    </Pressable>
                )}
                {closed && <Text style={styles.closedText}>Đã khóa</Text>}
                {!closed && hasVoted && !canChangeVote && <Text style={styles.closedText}>Đã chọn</Text>}
                {!closed && hasVoted && canChangeVote && <Text style={styles.closedText}>Có thể đổi</Text>}
            </View>

            <Pressable
                style={styles.resultsButton}
                onPress={openVotersModal}
            >
                <Ionicons name="people-outline" size={15} color={colors.accentStrong} />
                <Text style={styles.resultsButtonText}>
                    {showResults ? (poll.hideVoters ? "Người bình chọn đang ẩn" : "Xem tổng hợp bình chọn") : "Kết quả đang ẩn"}
                </Text>
            </Pressable>

            {!closed && poll.allowAddOption && onAddOption && (
                <View style={styles.addOptionWrap}>
                    {showAddOption ? (
                        <View style={styles.addOptionForm}>
                            <TextInput
                                style={styles.addOptionInput}
                                placeholder="Nhập phương án mới"
                                placeholderTextColor={colors.textMuted}
                                value={newOptionText}
                                onChangeText={setNewOptionText}
                                maxLength={120}
                                editable={!isAddingOption}
                            />
                            <Pressable
                                style={[styles.smallButton, (!newOptionText.trim() || isAddingOption) && styles.smallButtonDisabled]}
                                disabled={!newOptionText.trim() || isAddingOption}
                                onPress={async () => {
                                    const text = newOptionText.trim();
                                    if (!text) return;
                                    try {
                                        setIsAddingOption(true);
                                        await onAddOption(poll.id, text);
                                        setNewOptionText("");
                                        setShowAddOption(false);
                                    } catch (error: any) {
                                        Alert.alert("Lỗi", error?.message || "Không thể thêm phương án");
                                    } finally {
                                        setIsAddingOption(false);
                                    }
                                }}
                            >
                                {isAddingOption ? (
                                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                                ) : (
                                    <Ionicons name="checkmark" size={18} color={colors.textOnAccent} />
                                )}
                            </Pressable>
                            <Pressable
                                style={styles.cancelSmallButton}
                                disabled={isAddingOption}
                                onPress={() => {
                                    setShowAddOption(false);
                                    setNewOptionText("");
                                }}
                            >
                                <Ionicons name="close" size={18} color={colors.text} />
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable style={styles.addOptionButton} onPress={() => setShowAddOption(true)}>
                            <Ionicons name="add" size={16} color={colors.accentStrong} />
                            <Text style={styles.addOptionText}>Thêm phương án</Text>
                        </Pressable>
                    )}
                </View>
            )}

            <Modal
                visible={showVotersModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowVotersModal(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowVotersModal(false)}>
                    <Pressable style={styles.votersModal} onPress={() => { }}>
                        <View style={styles.votersModalHeader}>
                            <Text style={styles.votersModalTitle}>Tổng hợp bình chọn</Text>
                            <Pressable onPress={() => setShowVotersModal(false)} hitSlop={8}>
                                <Ionicons name="close" size={22} color={colors.text} />
                            </Pressable>
                        </View>
                        <Text style={styles.votersModalQuestion} numberOfLines={2}>{poll.question}</Text>
                        <ScrollView style={styles.votersList} contentContainerStyle={styles.votersListContent}>
                            {poll.options.map((option) => {
                                const voterIds = option.votedUserIds || [];
                                return (
                                    <View key={option.id} style={styles.optionVotersBlock}>
                                        <View style={styles.optionVotersHeader}>
                                            <Text style={styles.votersOptionText}>{option.text}</Text>
                                            <Text style={styles.optionVotersCount}>{voterIds.length} chọn</Text>
                                        </View>
                                        {voterIds.length > 0 ? (
                                            voterIds.map((userId) => (
                                                <View key={`${option.id}-${userId}`} style={styles.voterRow}>
                                                    <View style={styles.voterAvatar}>
                                                        <Text style={styles.voterAvatarText}>
                                                            {getVoterName(userId).slice(0, 1).toUpperCase()}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.voterName} numberOfLines={1}>
                                                        {getVoterName(userId)}
                                                    </Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyVotersText}>Chưa có ai chọn</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignSelf: "center",
        width: "92%",
        backgroundColor: colors.surfaceSoftTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        borderRadius: 14,
        padding: 16,
        gap: 12,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 6,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    titleWrap: {
        flex: 1,
        gap: 8,
    },
    badgeRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: colors.surfaceTransparent,
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.accentStrong,
    },
    question: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
        lineHeight: 22,
    },
    iconButton: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    metaText: {
        fontSize: 12,
        color: colors.textMuted,
    },
    metaDot: {
        fontSize: 12,
        color: colors.textMuted,
    },
    options: {
        gap: 8,
    },
    option: {
        borderWidth: 1,
        borderColor: colors.overlayWhite10,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.surfaceTransparent,
    },
    optionSelected: {
        borderColor: colors.accentStrong,
        backgroundColor: "rgba(79, 140, 255, 0.12)",
    },
    optionRemoving: {
        borderColor: colors.danger || "#dc2626",
        backgroundColor: "rgba(220, 38, 38, 0.08)",
    },
    optionDisabled: {
        opacity: 0.78,
    },
    optionFill: {
        ...StyleSheet.absoluteFillObject,
        right: undefined,
        backgroundColor: "rgba(79, 140, 255, 0.16)",
    },
    optionContent: {
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 10,
    },
    selectMark: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: colors.overlayWhite30,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
    },
    selectMarkActive: {
        borderColor: colors.accentStrong,
        backgroundColor: colors.accentStrong,
    },
    optionText: {
        flex: 1,
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        lineHeight: 19,
    },
    optionCount: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.text,
        minWidth: 36,
        textAlign: "right",
    },
    removeLabel: {
        color: colors.danger || "#dc2626",
    },
    voteCount: {
        fontSize: 11,
        color: colors.textMuted,
    },
    voteCountButton: {
        alignSelf: "flex-start",
        paddingHorizontal: 36,
        paddingBottom: 10,
    },
    footerRow: {
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    footerText: {
        flex: 1,
        fontSize: 12,
        color: colors.textMuted,
    },
    submitButton: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: colors.accentStrong,
    },
    submitButtonDisabled: {
        opacity: 0.45,
    },
    submitButtonText: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.textOnAccent,
    },
    closedText: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.textMuted,
    },
    resultsButton: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(79, 140, 255, 0.12)",
    },
    resultsButtonText: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.accentStrong,
    },
    addOptionWrap: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 10,
    },
    addOptionButton: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        paddingVertical: 6,
    },
    addOptionText: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.accentStrong,
    },
    addOptionForm: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    addOptionInput: {
        flex: 1,
        minHeight: 38,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 9,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        color: colors.text,
        backgroundColor: colors.background,
    },
    smallButton: {
        width: 38,
        height: 38,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accentStrong,
    },
    smallButtonDisabled: {
        opacity: 0.45,
    },
    cancelSmallButton: {
        width: 38,
        height: 38,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
    },
    votersModal: {
        width: "100%",
        maxWidth: 380,
        maxHeight: "78%",
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        gap: 12,
    },
    votersModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    votersModalTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: colors.text,
    },
    votersModalQuestion: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        lineHeight: 20,
    },
    optionVotersBlock: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 10,
        gap: 8,
        backgroundColor: colors.surfaceElevated,
    },
    optionVotersHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
    },
    votersOptionText: {
        flex: 1,
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        lineHeight: 20,
    },
    optionVotersCount: {
        fontSize: 12,
        fontWeight: "800",
        color: colors.accentStrong,
    },
    votersList: {
        maxHeight: 280,
    },
    votersListContent: {
        gap: 8,
        paddingBottom: 4,
    },
    voterRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: colors.background,
    },
    voterAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accentStrong,
    },
    voterAvatarText: {
        color: colors.textOnAccent,
        fontSize: 12,
        fontWeight: "800",
    },
    voterName: {
        flex: 1,
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    emptyVotersText: {
        color: colors.textMuted,
        fontSize: 13,
        textAlign: "center",
        paddingVertical: 18,
    },
});
