import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../shared/hooks";
import { PrimaryButton, TextField } from "../components";
import { AuthShell } from "./AuthShell";
import { colors } from "../theme";

export const LoginScreen = ({ onSwitchToRegister }) => {
    const { login, loading, error } = useAuth();
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [localError, setLocalError] = useState("");

    const handleSubmit = async () => {
        try {
            setLocalError("");
            if (!phone || !password) {
                setLocalError("Please fill in all fields");
                return;
            }

            await login(phone, password);
        } catch (submitError) {
            setLocalError(submitError.message || "Login failed");
        }
    };

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Login to continue chatting with your friends."
            footer={
                <Pressable onPress={onSwitchToRegister} style={styles.authFooterLink}>
                    <Text style={styles.authFooterText}>Don't have an account? </Text>
                    <Text style={styles.authFooterAccent}>Register now</Text>
                </Pressable>
            }
        >
            <View style={styles.formGap}>
                <TextField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="0912345678" keyboardType="phone-pad" editable={!loading} />
                <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry editable={!loading} />
                {!!(localError || error) && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{localError || error}</Text>
                    </View>
                )}
                <PrimaryButton label="Login" onPress={handleSubmit} loading={loading} />
            </View>
        </AuthShell>
    );
};

const styles = StyleSheet.create({
    formGap: {
        gap: 14,
    },
    errorBox: {
        backgroundColor: "rgba(239,68,68,0.12)",
        borderColor: "rgba(239,68,68,0.28)",
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },
    errorText: {
        color: "#ff9b9b",
        fontSize: 13,
    },
    authFooterLink: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 6,
    },
    authFooterText: {
        color: colors.textSoft,
    },
    authFooterAccent: {
        color: colors.accent,
        fontWeight: "700",
    },
});
