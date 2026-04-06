import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme";

export const TextField = ({ label, multiline = false, ...props }) => (
    <View style={styles.fieldWrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
            placeholderTextColor={colors.textMuted}
            style={[styles.input, multiline && styles.multilineInput]}
            multiline={multiline}
            {...props}
        />
    </View>
);

const styles = StyleSheet.create({
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
    multilineInput: {
        minHeight: 100,
        paddingVertical: 12,
        textAlignVertical: "top",
    },
});
