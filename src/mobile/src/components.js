import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "./theme";

export const Card = ({ style, children }) => <View style={[styles.card, style]}>{children}</View>;

export const PrimaryButton = ({ label, onPress, loading = false, variant = "primary", style }) => (
  <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [
    styles.button,
    variant === "secondary" && styles.secondaryButton,
    pressed && styles.pressed,
    loading && styles.disabled,
    style,
  ]}>
    <Text style={[styles.buttonText, variant === "secondary" && styles.secondaryButtonText]}>{loading ? "Loading..." : label}</Text>
  </Pressable>
);

export const TextField = ({ label, ...props }) => (
  <View style={styles.fieldWrap}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />
  </View>
);

export const BottomTabBar = ({ activeTab, onChangeTab }) => {
  const items = [
    { key: "home", label: "Danh b\u1ea1", icon: "people-outline" },
    { key: "chat", label: "Chat", icon: "chatbubbles-outline" },
    { key: "profile", label: "C\u00e0i \u0111\u1eb7t", icon: "settings-outline" },
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

export const SectionTitle = ({ title, subtitle, rightLabel }) => (
  <View style={styles.sectionHeader}>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
    {rightLabel ? <Text style={styles.sectionRight}>{rightLabel}</Text> : null}
  </View>
);

export const Avatar = ({ label, size = 56, backgroundColor = colors.surfaceElevated, textSize = 18, style }) => (
  <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor }, style]}>
    <Text style={{ color: colors.text, fontSize: textSize, fontWeight: "700" }}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  button: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButtonText: {
    color: colors.text,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.7,
  },
  fieldWrap: {
    gap: 8,
  },
  label: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  sectionRight: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
