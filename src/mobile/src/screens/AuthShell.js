import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Card } from "../components/Card";
import { colors, gradients } from "../theme";

export const AuthShell = ({ children, title, subtitle, footer }) => (
    <LinearGradient colors={gradients.auth} style={styles.authScreen}>
        <View style={styles.authGlowOne} />
        <View style={styles.authGlowTwo} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authKeyboard}>
            <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.authBadge}>
                    <Ionicons name="paper-plane" size={16} color={colors.text} />
                    <Text style={styles.authBadgeText}>Telegram</Text>
                </View>
                <Text style={styles.authTitle}>{title}</Text>
                <Text style={styles.authSubtitle}>{subtitle}</Text>
                <Card style={styles.authCard}>{children}</Card>
                {footer}
            </ScrollView>
        </KeyboardAvoidingView>
    </LinearGradient>
);

const styles = StyleSheet.create({
    authScreen: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: 18,
    },
    authGlowOne: {
        position: "absolute",
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: "rgba(59,130,246,0.18)",
        top: 70,
        left: -70,
    },
    authGlowTwo: {
        position: "absolute",
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: "rgba(124,58,237,0.20)",
        right: -60,
        top: 160,
    },
    authKeyboard: {
        flex: 1,
    },
    authScroll: {
        flexGrow: 1,
        justifyContent: "center",
        paddingVertical: 24,
        gap: 14,
    },
    authBadge: {
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "rgba(59,130,246,0.28)",
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    authBadgeText: {
        color: colors.text,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    authTitle: {
        color: colors.text,
        fontSize: 32,
        fontWeight: "900",
        textAlign: "center",
    },
    authSubtitle: {
        color: colors.textSoft,
        fontSize: 15,
        textAlign: "center",
        marginBottom: 4,
    },
    authCard: {
        padding: 18,
        gap: 14,
    },
});
