import React from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import { colors } from "../theme";
import type { AvatarProps } from "@/types";

export const Avatar = ({
    label,
    size = 56,
    backgroundColor = colors.surfaceElevated,
    textSize = 18,
    imageUrl,
    style,
}: AvatarProps) => {
    const bgColor = backgroundColor || colors.surfaceElevated;

    // If imageUrl is provided, display the image
    if (imageUrl) {
        return (
            <View
                style={[
                    styles.avatar,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        overflow: 'hidden',
                    },
                    style,
                ]}
            >
                <Image
                    source={{ uri: imageUrl }}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                    }}
                    resizeMode="cover"
                />
            </View>
        );
    }

    // Fallback to initials
    return (
        <View
            style={[
                styles.avatar,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bgColor,
                },
                style,
            ]}
        >
            <Text
                style={{
                    color: colors.text,
                    fontSize: textSize,
                    fontWeight: "700",
                    letterSpacing: 0.5,
                }}
            >
                {label}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    avatar: {
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
});
