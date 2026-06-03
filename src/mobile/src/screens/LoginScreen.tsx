import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../shared/hooks";
import { authService } from "../../../shared/services/authService";
import { PrimaryButton, TextField } from "../components";
import { AuthShell } from "./AuthShell";
import { colors } from "../theme";
import type { LoginScreenProps } from "@/types";

export const LoginScreen = ({
    onSwitchToRegister,
    onForgotPassword,
    onNeedEmailVerification,
}: LoginScreenProps) => {
    const { login, loading } = useAuth();
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [localError, setLocalError] = useState("");

    const isEmailNotVerifiedError = (error: any) => {
        const text = [
            error?.message,
            error?.code,
            error?.responseBody?.message,
            error?.responseBody?.msg,
            error?.responseBody?.code,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return text.includes("not verified") || text.includes("unverified");
    };

    const readEmailFromError = (error: any) => {
        return (
            error?.email ||
            error?.data?.email ||
            error?.responseBody?.email ||
            error?.responseBody?.data?.email
        );
    };

    const getLoginErrorMessage = (error: any) => {
        const rawMessage = String(error?.message || "").trim();
        const text = [
            rawMessage,
            error?.code,
            error?.responseBody?.message,
            error?.responseBody?.msg,
            error?.responseBody?.code,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (
            error?.status === 401 ||
            text.includes("invalid") ||
            text.includes("incorrect") ||
            text.includes("wrong") ||
            text.includes("password")
        ) {
            return "Số điện thoại/email hoặc mật khẩu không đúng.";
        }

        return rawMessage || "Đăng nhập thất bại. Vui lòng thử lại.";
    };

    const handleSubmit = async () => {
        try {
            setLocalError("");
            if (!phone || !password) {
                setLocalError("Please fill in all fields");
                return;
            }

            await login(phone, password);
        } catch (submitError: any) {
            if (isEmailNotVerifiedError(submitError)) {
                try {
                    const emailFromError = readEmailFromError(submitError);
                    const resolvedEmail = emailFromError || await authService.getUnverifiedEmail(phone.trim());
                    Alert.alert("Email not verified", "Please enter the OTP sent to your email.");
                    onNeedEmailVerification?.({
                        email: resolvedEmail,
                        phone: phone.trim(),
                        shouldSendInitialOtp: true,
                    });
                    return;
                } catch (lookupError: any) {
                    Alert.alert(
                        "Email not verified",
                        lookupError?.message || "Please verify your email before logging in."
                    );
                    onNeedEmailVerification?.({
                        phone: phone.trim(),
                        shouldSendInitialOtp: true,
                    });
                    return;
                }
            }

            const message = getLoginErrorMessage(submitError);
            setLocalError(message);
            Alert.alert("Đăng nhập thất bại", message);
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
                <TextField
                    label="Phone Number"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="0912345678"
                    keyboardType="phone-pad"
                    editable={!loading}
                />
                <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry
                    editable={!loading}
                />
                <Pressable onPress={onForgotPassword} style={styles.forgotLink}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
                {!!localError && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{localError}</Text>
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
    forgotLink: {
        alignSelf: "flex-end",
        paddingVertical: 2,
    },
    forgotText: {
        color: colors.accent,
        fontWeight: "700",
        fontSize: 13,
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
