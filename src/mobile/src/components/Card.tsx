import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";
import type { CardProps } from "@/types";

export const Card = ({ style, children }: CardProps) => (
    <View style={[styles.card, style]}>{children}</View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
});
