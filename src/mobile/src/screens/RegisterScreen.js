import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../shared/hooks";
import { PrimaryButton, TextField } from "../components";
import { AuthShell } from "./AuthShell";
import { colors } from "../theme";

export const RegisterScreen = ({ onSwitchToLogin }) => {
    const { register, loading, error } = useAuth();
    const [formData, setFormData] = useState({ phone: "", password: "", confirmPassword: "", email: "", displayName: "" });
    const [localError, setLocalError] = useState("");

    const updateField = (field, value) => {
        setFormData((current) => ({ ...current, [field]: value }));
    };

    const validateForm = () => {
        if (!formData.phone || !formData.password || !formData.email || !formData.displayName) {
            setLocalError("Please fill in all fields");
            return false;
        }

        if (formData.password !== formData.confirmPassword) {
            setLocalError("Passwords do not match");
            return false;
        }

        if (formData.password.length < 6) {
            setLocalError("Password must be at least 6 characters");
            return false;
        }

        if (!/^0\d{9}$/.test(formData.phone)) {
            setLocalError("Phone number must be 10 digits starting with 0");
            return false;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setLocalError("Please enter a valid email");
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        try {
            setLocalError("");
            if (!validateForm()) {
                return;
            }

            const { confirmPassword, ...payload } = formData;
            await register(payload);
            Alert.alert("Success", "Account created. Please login.");
            onSwitchToLogin();
        } catch (submitError) {
            setLocalError(submitError.message || "Registration failed");
        }
    };

    return (
        <AuthShell
            title="Create your account"
            subtitle="Join the chat and start connecting with your friends."
            footer={
                <Pressable onPress={onSwitchToLogin} style={styles.authFooterLink}>
                    <Text style={styles.authFooterText}>Already have an account? </Text>
                    <Text style={styles.authFooterAccent}>Back to login</Text>
                </Pressable>
            }
        >
            <View style={styles.formGap}>
                <TextField label="Display Name" value={formData.displayName} onChangeText={(value) => updateField("displayName", value)} placeholder="Your name" editable={!loading} />
                <TextField label="Email" value={formData.email} onChangeText={(value) => updateField("email", value)} placeholder="your@email.com" keyboardType="email-address" autoCapitalize="none" editable={!loading} />
                <TextField label="Phone Number" value={formData.phone} onChangeText={(value) => updateField("phone", value)} placeholder="0912345678" keyboardType="phone-pad" editable={!loading} />
                <TextField label="Password" value={formData.password} onChangeText={(value) => updateField("password", value)} placeholder="Enter password" secureTextEntry editable={!loading} />
                <TextField label="Confirm Password" value={formData.confirmPassword} onChangeText={(value) => updateField("confirmPassword", value)} placeholder="Confirm password" secureTextEntry editable={!loading} />
                {!!(localError || error) && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{localError || error}</Text>
                    </View>
                )}
                <PrimaryButton label="Register" onPress={handleSubmit} loading={loading} />
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
