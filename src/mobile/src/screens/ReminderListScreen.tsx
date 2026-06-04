import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import ReminderService from "../../../shared/services/reminderService";
import type { GroupReminder, GroupReminderStatus } from "../../../shared/services/socketService";

type ReminderTab = "active" | "done" | "cancelled";

const TABS: Array<{ key: ReminderTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: "active", label: "Đang đặt", icon: "calendar-outline" },
    { key: "done", label: "Đã báo", icon: "checkmark-done-outline" },
    { key: "cancelled", label: "Đã hủy", icon: "close-circle-outline" },
];

const normalizeStatus = (status?: GroupReminderStatus | string): ReminderTab => {
    if (status === "done") return "done";
    if (status === "cancelled") return "cancelled";
    return "active";
};

const getReminderId = (reminder: GroupReminder): string => {
    return String(reminder.id || (reminder as any)._id || (reminder as any).reminderId || "");
};

const formatReminderDate = (iso?: string): string => {
    if (!iso) return "Chưa có thời gian";

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Thời gian không hợp lệ";

    return date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const sortReminders = (items: GroupReminder[]): GroupReminder[] => {
    return [...items].sort((left, right) => {
        const leftTime = new Date(left.remindAt || left.createdAt || "").getTime();
        const rightTime = new Date(right.remindAt || right.createdAt || "").getTime();
        return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
    });
};

export const ReminderListScreen: React.FC<{
    route: any;
    navigation?: any;
    onBackPress?: () => void;
}> = ({ route, navigation, onBackPress }) => {
    const {
        conversationId,
        conversationType = "PRIVATE",
        title = "Lịch hẹn",
    } = route.params || {};
    const initialRemindersRef = useRef<GroupReminder[]>(
        sortReminders(Array.isArray(route.params?.initialReminders) ? route.params.initialReminders : []),
    );
    const [activeTab, setActiveTab] = useState<ReminderTab>("active");
    const [reminders, setReminders] = useState<GroupReminder[]>(() => initialRemindersRef.current);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadReminders = useCallback(async (silent = false, force = false) => {
        if (!conversationId) {
            setLoading(false);
            return;
        }

        try {
            if (!silent) setLoading(true);
            const nextReminders =
                String(conversationType).toUpperCase() === "GROUP"
                    ? await ReminderService.listGroupReminders(String(conversationId), { force })
                    : await ReminderService.listConversationReminders(String(conversationId), { force });
            setReminders(sortReminders(nextReminders));
        } catch (error: any) {
            if (String(conversationType).toUpperCase() !== "GROUP" && (error?.status === 404 || error?.status === 405)) {
                setReminders(initialRemindersRef.current);
                return;
            }

            if (error?.status === 429 || error?.responseBody?.statusCode === 429) {
                Alert.alert("Thông báo", "Backend đang giới hạn request. Vui lòng chờ một lúc rồi thử lại.");
                return;
            }

            Alert.alert("Lỗi", error?.message || "Không thể tải lịch hẹn.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [conversationId, conversationType]);

    useEffect(() => {
        loadReminders();
    }, [loadReminders]);

    const tabCounts = useMemo(() => {
        return reminders.reduce<Record<ReminderTab, number>>(
            (counts, reminder) => {
                counts[normalizeStatus(reminder.status)] += 1;
                return counts;
            },
            { active: 0, done: 0, cancelled: 0 },
        );
    }, [reminders]);

    const visibleReminders = useMemo(
        () => reminders.filter((reminder) => normalizeStatus(reminder.status) === activeTab),
        [activeTab, reminders],
    );

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadReminders(true, true);
    }, [loadReminders]);

    const handleCancelReminder = useCallback((reminder: GroupReminder) => {
        const reminderId = getReminderId(reminder);
        if (!conversationId || !reminderId) {
            Alert.alert("Thông báo", "Không tìm thấy lịch hẹn để hủy.");
            return;
        }

        Alert.alert(
            "Hủy lịch hẹn",
            "Bạn có chắc muốn hủy lịch hẹn này?",
            [
                { text: "Không" },
                {
                    text: "Hủy lịch",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setProcessingId(reminderId);
                            const updated = await ReminderService.cancelReminder(String(conversationId), reminderId);
                            setReminders((current) => sortReminders(
                                current.map((item) =>
                                    getReminderId(item) === reminderId
                                        ? { ...item, ...(updated || {}), status: "cancelled" }
                                        : item,
                                ),
                            ));
                            setActiveTab("cancelled");
                        } catch (error: any) {
                            Alert.alert("Lỗi", error?.message || "Không thể hủy lịch hẹn.");
                        } finally {
                            setProcessingId(null);
                        }
                    },
                },
            ],
        );
    }, [conversationId]);

    const renderReminder = ({ item }: { item: GroupReminder }) => {
        const reminderId = getReminderId(item);
        const status = normalizeStatus(item.status);
        const isProcessing = processingId === reminderId;

        return (
            <View style={styles.reminderCard}>
                <View style={styles.reminderIconWrap}>
                    <Ionicons
                        name={status === "done" ? "notifications-outline" : status === "cancelled" ? "close-outline" : "calendar-outline"}
                        size={22}
                        color={status === "cancelled" ? colors.dangerSoft : status === "done" ? colors.success : colors.accentStrong}
                    />
                </View>
                <View style={styles.reminderBody}>
                    <Text style={styles.reminderTitle} numberOfLines={2}>{item.title || "Lịch hẹn"}</Text>
                    {item.description ? (
                        <Text style={styles.reminderDescription} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <View style={styles.reminderMetaRow}>
                        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.reminderMeta}>{formatReminderDate(item.remindAt)}</Text>
                    </View>
                </View>
                {status === "active" ? (
                    <Pressable
                        style={[styles.cancelButton, isProcessing && styles.disabledButton]}
                        onPress={() => handleCancelReminder(item)}
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color={colors.dangerSoft} />
                        ) : (
                            <>
                                <Ionicons name="close-circle-outline" size={16} color={colors.dangerSoft} />
                                <Text style={styles.cancelButtonText}>Hủy lịch</Text>
                            </>
                        )}
                    </Pressable>
                ) : null}
            </View>
        );
    };

    return (
        <View style={styles.screen}>
            <View style={styles.header}>
                <Pressable style={styles.headerButton} onPress={onBackPress || (() => navigation?.goBack?.())}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>{title}</Text>
                <Pressable style={styles.headerButton} onPress={handleRefresh}>
                    <Ionicons name="refresh" size={21} color={colors.text} />
                </Pressable>
            </View>

            <View style={styles.tabs}>
                {TABS.map((tab) => {
                    const selected = activeTab === tab.key;
                    return (
                        <Pressable
                            key={tab.key}
                            style={[styles.tabButton, selected && styles.tabButtonActive]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Ionicons
                                name={tab.icon}
                                size={16}
                                color={selected ? colors.textOnAccent : colors.textMuted}
                            />
                            <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                                {tab.label} ({tabCounts[tab.key]})
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {loading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator color={colors.accentStrong} />
                    <Text style={styles.centerText}>Đang tải lịch hẹn...</Text>
                </View>
            ) : (
                <FlatList
                    data={visibleReminders}
                    keyExtractor={(item, index) => getReminderId(item) || `${activeTab}-${index}`}
                    renderItem={renderReminder}
                    contentContainerStyle={visibleReminders.length ? styles.listContent : styles.emptyListContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.accentStrong}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="calendar-clear-outline" size={44} color={colors.textMuted} />
                            <Text style={styles.emptyTitle}>Chưa có lịch hẹn</Text>
                            <Text style={styles.emptyText}>
                                {activeTab === "active"
                                    ? "Các lịch đang đặt sẽ xuất hiện tại đây."
                                    : activeTab === "done"
                                        ? "Các lịch đã báo sẽ được chuyển vào mục này."
                                        : "Các lịch đã hủy sẽ được lưu tại đây."}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        minHeight: 58,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 12,
        paddingHorizontal: 12,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerButton: {
        width: 42,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        flex: 1,
        color: colors.text,
        fontSize: 18,
        fontWeight: "800",
        textAlign: "center",
    },
    tabs: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    tabButton: {
        flex: 1,
        minHeight: 38,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 5,
        paddingHorizontal: 8,
    },
    tabButtonActive: {
        borderColor: colors.accentStrong,
        backgroundColor: colors.accentStrong,
    },
    tabText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "800",
    },
    tabTextActive: {
        color: colors.textOnAccent,
    },
    listContent: {
        padding: 12,
        gap: 10,
    },
    emptyListContent: {
        flexGrow: 1,
    },
    reminderCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    reminderIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceElevated,
    },
    reminderBody: {
        flex: 1,
        gap: 5,
    },
    reminderTitle: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "800",
    },
    reminderDescription: {
        color: colors.textSoft,
        fontSize: 12,
        lineHeight: 17,
    },
    reminderMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    reminderMeta: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: "700",
    },
    cancelButton: {
        minHeight: 34,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.dangerSoft,
        paddingHorizontal: 10,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 5,
    },
    cancelButtonText: {
        color: colors.dangerSoft,
        fontSize: 12,
        fontWeight: "800",
    },
    disabledButton: {
        opacity: 0.6,
    },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    centerText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: "600",
    },
    emptyState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        gap: 10,
    },
    emptyTitle: {
        color: colors.text,
        fontSize: 17,
        fontWeight: "800",
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 13,
        lineHeight: 18,
        textAlign: "center",
    },
});
