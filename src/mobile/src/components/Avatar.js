import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export const Avatar = ({ label, size = 56, backgroundColor = colors.surfaceElevated, textSize = 18, style }) => {
    // Ensure backgroundColor is always a valid color
    const bgColor = backgroundColor || colors.surfaceElevated;
    
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
                style
            ]}
        >
            <Text style={{ 
                color: colors.text, 
                fontSize: textSize, 
                fontWeight: "700",
                letterSpacing: 0.5,
            }}>
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
