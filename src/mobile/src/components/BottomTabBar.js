import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export const BottomTabBar = ({ activeTab, onChangeTab }) => {
    const items = [
        { key: "home", label: "Danh Bạ", icon: "people-outline" },
        { key: "chat", label: "Chat", icon: "chatbubbles-outline" },
        { key: "profile", label: "Cài Đặt", icon: "settings-outline" },
    ];

    return (
        <View style={styles.tabShell}>
            <View style={styles.tabBar}>
                {items.map((item) => {
                    const active = activeTab === item.key;
                    return (
                        <Pressable key={item.key} onPress={() => onChangeTab(item.key)} style={styles.tabItem}>
                            <Ionicons name={item.icon} size={24} color={active ? colors.accent : colors.tabInactive} />
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    tabShell: {
        paddingHorizontal: 14,
        paddingBottom: 10,
        paddingTop: 6,
        backgroundColor: colors.background,
    },
    tabBar: {
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        paddingHorizontal: 8,
        justifyContent: "space-between",
    },
    tabItem: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 4,
    },
    tabLabel: {
        color: colors.tabInactive,
        fontSize: 11,
        fontWeight: "600",
    },
    tabLabelActive: {
        color: colors.accent,
    },
});
