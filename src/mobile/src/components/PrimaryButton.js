import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme";

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

const styles = StyleSheet.create({
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
});
