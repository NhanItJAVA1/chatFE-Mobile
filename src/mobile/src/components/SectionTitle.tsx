import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { SectionTitleProps } from "@/types";

export const SectionTitle = ({
    title,
    subtitle,
    rightLabel,
}: SectionTitleProps) => (
    <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {subtitle ? (
                <Text style={styles.sectionSubtitle}>{subtitle}</Text>
            ) : null}
        </View>
        {rightLabel ? (
            <Text style={styles.sectionRight}>{rightLabel}</Text>
        ) : null}
    </View>
);

const styles = StyleSheet.create({
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
});
