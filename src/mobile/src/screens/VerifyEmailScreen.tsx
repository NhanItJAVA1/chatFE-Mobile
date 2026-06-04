import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { authService } from "../../../shared/services/authService";
import { PrimaryButton, TextField } from "../components";
import { AuthShell } from "./AuthShell";
import { colors } from "../theme";

type VerifyEmailScreenProps = {
    email?: string;
    phone?: string;
    shouldSendInitialOtp?: boolean;
    onVerified: () => void;
    onBackToLogin: () => void;
};

const getErrorMessage = (error: any, fallback: string) => {
    return error?.message || error?.responseBody?.message || error?.responseBody?.msg || fallback;
};

export const VerifyEmailScreen = ({
    email: initialEmail = "",
    phone,
    shouldSendInitialOtp = false,
    onVerified,
    onBackToLogin,
}: VerifyEmailScreenProps) => {
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState("");
    const [fieldError, setFieldError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const initialOtpSentRef = useRef(false);

    useEffect(() => {
        const prepareEmailAndOtp = async () => {
            if (initialOtpSentRef.current || !shouldSendInitialOtp) {
                return;
            }

            initialOtpSentRef.current = true;

            try {
                setLoading(true);
                let targetEmail = email.trim();
                if (!targetEmail && phone) {
                    targetEmail = await authService.getUnverifiedEmail(phone.trim());
                    setEmail(targetEmail);
                }

                if (targetEmail) {
                    await authService.sendVerification(targetEmail);
                    Alert.alert("Verification code sent", "Please check your email for the OTP.");
                }
            } catch (error: any) {
                Alert.alert("Unable to send OTP", getErrorMessage(error, "Please try again."));
            } finally {
                setLoading(false);
            }
        };

        void prepareEmailAndOtp();
    }, [email, phone, shouldSendInitialOtp]);

    const handleVerify = async () => {
        const targetEmail = email.trim();
        const cleanCode = code.trim();

        setFieldError("");
        if (!targetEmail) {
            setFieldError("Email is required");
            return;
        }

        if (!/^\d{6}$/.test(cleanCode)) {
            setFieldError("OTP must be 6 digits");
            return;
        }

        try {
            setLoading(true);
            await authService.verifyEmail(targetEmail, cleanCode);
            Alert.alert("Email verified", "Please login to continue.", [
                { text: "OK", onPress: onVerified },
            ]);
        } catch (error: any) {
            Alert.alert("Verification failed", getErrorMessage(error, "Invalid or expired OTP."));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        const targetEmail = email.trim();
        setFieldError("");

        if (!targetEmail) {
            setFieldError("Email is required");
            return;
        }

        try {
            setResending(true);
            await authService.resendVerification(targetEmail);
            setCode("");
            Alert.alert("New OTP sent", "Please use the latest code from your email.");
        } catch (error: any) {
            Alert.alert("Unable to resend OTP", getErrorMessage(error, "Please try again later."));
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthShell
            title="Verify your email"
            subtitle="Enter the 6-digit code sent to your mailbox."
            footer={
                <Pressable onPress={onBackToLogin} style={styles.authFooterLink}>
                    <Text style={styles.authFooterText}>Back to login</Text>
                </Pressable>
            }
        >
            <View style={styles.formGap}>
                <TextField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading && !initialEmail}
                />
                <TextField
                    label="OTP Code"
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                />
                {!!fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
                <PrimaryButton label="Verify email" onPress={handleVerify} loading={loading} />
                <PrimaryButton
                    label="Resend OTP"
                    onPress={handleResend}
                    loading={resending}
                    disabled={loading}
                    variant="secondary"
                />
            </View>
        </AuthShell>
    );
};

const styles = StyleSheet.create({
    formGap: {
        gap: 14,
    },
    fieldError: {
        color: "#ff9b9b",
        fontSize: 13,
    },
    authFooterLink: {
        alignItems: "center",
        paddingVertical: 6,
    },
    authFooterText: {
        color: colors.accent,
        fontWeight: "700",
    },
});
