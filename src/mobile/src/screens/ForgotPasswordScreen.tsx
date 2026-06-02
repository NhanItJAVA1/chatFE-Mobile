import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { authService } from "../../../shared/services/authService";
import { PrimaryButton, TextField } from "../components";
import { AuthShell } from "./AuthShell";
import { colors } from "../theme";

type ForgotPasswordScreenProps = {
    onBackToLogin: () => void;
};

type ResetStep = "email" | "otp" | "password";

const getErrorMessage = (error: any, fallback: string) => {
    return error?.message || error?.responseBody?.message || error?.responseBody?.msg || fallback;
};

const readExpiresIn = (response: any) => {
    return Number(response?.expiresIn || response?.data?.expiresIn || 300);
};

const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const rest = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
};

export const ForgotPasswordScreen = ({ onBackToLogin }: ForgotPasswordScreenProps) => {
    const [step, setStep] = useState<ResetStep>("email");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [tempToken, setTempToken] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fieldError, setFieldError] = useState("");
    const [countdown, setCountdown] = useState(0);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (step !== "otp" || countdown <= 0) {
            return;
        }

        const timer = setInterval(() => {
            setCountdown((current) => Math.max(current - 1, 0));
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown, step]);

    const title = useMemo(() => {
        if (step === "password") {
            return "Create new password";
        }
        if (step === "otp") {
            return "Enter reset OTP";
        }
        return "Reset password";
    }, [step]);

    const subtitle = useMemo(() => {
        if (step === "password") {
            return "Use a new password for your next login.";
        }
        if (step === "otp") {
            return `Code expires in ${formatCountdown(countdown)}.`;
        }
        return "We will send a 6-digit code to your email.";
    }, [countdown, step]);

    const handleSendOtp = async () => {
        const targetEmail = email.trim();
        setFieldError("");

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
            setFieldError("Please enter a valid email");
            return;
        }

        try {
            setLoading(true);
            const response = await authService.forgotPassword({ email: targetEmail });
            setEmail(targetEmail);
            setOtp("");
            setTempToken("");
            setCountdown(readExpiresIn(response));
            setStep("otp");
            Alert.alert("OTP sent", "Please check your email.");
        } catch (error: any) {
            Alert.alert("Unable to send OTP", getErrorMessage(error, "Please try again later."));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        const targetEmail = email.trim();
        const cleanOtp = otp.trim();
        setFieldError("");

        if (!/^\d{6}$/.test(cleanOtp)) {
            setFieldError("OTP must be 6 digits");
            return;
        }

        if (countdown <= 0) {
            setFieldError("OTP has expired. Please request a new code.");
            return;
        }

        try {
            setLoading(true);
            const response = await authService.verifyResetOtp(targetEmail, cleanOtp);
            const token = response?.data?.tempToken || response?.tempToken;
            if (!token) {
                throw new Error("Reset token was not returned");
            }
            setTempToken(token);
            setStep("password");
            Alert.alert("OTP verified", "You can now set a new password.");
        } catch (error: any) {
            Alert.alert("OTP verification failed", getErrorMessage(error, "Invalid or expired OTP."));
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        const targetEmail = email.trim();
        setFieldError("");

        try {
            setResending(true);
            const response = await authService.resendResetOtp(targetEmail);
            setOtp("");
            setTempToken("");
            setCountdown(readExpiresIn(response));
            setStep("otp");
            Alert.alert("New OTP sent", "Please use the latest code from your email.");
        } catch (error: any) {
            Alert.alert("Unable to resend OTP", getErrorMessage(error, "Please try again later."));
        } finally {
            setResending(false);
        }
    };

    const handleResetPassword = async () => {
        setFieldError("");

        if (!tempToken) {
            setFieldError("Please verify OTP again");
            return;
        }

        if (password.length < 6) {
            setFieldError("Password must be at least 6 characters");
            return;
        }

        if (password !== confirmPassword) {
            setFieldError("Passwords do not match");
            return;
        }

        try {
            setLoading(true);
            await authService.resetPassword(tempToken, password);
            await authService.clearLocalSession();
            Alert.alert("Password reset", "Please login with your new password.", [
                { text: "OK", onPress: onBackToLogin },
            ]);
        } catch (error: any) {
            Alert.alert("Reset failed", getErrorMessage(error, "Please try again."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title={title}
            subtitle={subtitle}
            footer={
                <Pressable onPress={onBackToLogin} style={styles.authFooterLink}>
                    <Text style={styles.authFooterText}>Back to login</Text>
                </Pressable>
            }
        >
            <View style={styles.formGap}>
                {step === "email" && (
                    <>
                        <TextField
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            placeholder="your@email.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!loading}
                        />
                        {!!fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
                        <PrimaryButton label="Send OTP" onPress={handleSendOtp} loading={loading} />
                    </>
                )}

                {step === "otp" && (
                    <>
                        <TextField
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            editable={false}
                        />
                        <TextField
                            label="OTP Code"
                            value={otp}
                            onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="123456"
                            keyboardType="number-pad"
                            maxLength={6}
                            editable={!loading && !tempToken}
                        />
                        {!!fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
                        <PrimaryButton label="Verify OTP" onPress={handleVerifyOtp} loading={loading} />
                        <PrimaryButton
                            label="Resend OTP"
                            onPress={handleResendOtp}
                            loading={resending}
                            disabled={loading}
                            variant="secondary"
                        />
                    </>
                )}

                {step === "password" && (
                    <>
                        <TextField
                            label="New Password"
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Enter new password"
                            secureTextEntry
                            editable={!loading}
                        />
                        <TextField
                            label="Confirm Password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Confirm new password"
                            secureTextEntry
                            editable={!loading}
                        />
                        {!!fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}
                        <PrimaryButton
                            label="Reset password"
                            onPress={handleResetPassword}
                            loading={loading}
                        />
                        <PrimaryButton
                            label="Use a new OTP"
                            onPress={handleResendOtp}
                            loading={resending}
                            disabled={loading}
                            variant="secondary"
                        />
                    </>
                )}
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
