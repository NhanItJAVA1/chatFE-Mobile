import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import type { MessageActionButton } from "../../../shared/utils";

export type MessageActionAnchor = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type MessageActionBarProps = {
    anchor: MessageActionAnchor;
    buttons: MessageActionButton[];
    closing: boolean;
    getIconName: (label: string) => keyof typeof Ionicons.glyphMap;
    onActionPress: (button: MessageActionButton) => void;
    onDismiss: () => void;
    onClosed: () => void;
};

const ACTION_SIZE = 40;
const ACTION_GAP = 8;
const BAR_HEIGHT = 52;
const STAGGER_MS = 24;

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
    anchor,
    buttons,
    closing,
    getIconName,
    onActionPress,
    onDismiss,
    onClosed,
}) => {
    const { width } = useWindowDimensions();
    const animatedValues = useRef<Animated.Value[]>([]);
    const barProgress = useRef(new Animated.Value(0)).current;
    const visibleButtons = useMemo(() => buttons.filter((button) => button.style !== "cancel"), [buttons]);

    if (animatedValues.current.length !== visibleButtons.length) {
        animatedValues.current = visibleButtons.map((_, index) => animatedValues.current[index] || new Animated.Value(0));
    }

    const contentWidth = visibleButtons.length * ACTION_SIZE + Math.max(0, visibleButtons.length - 1) * ACTION_GAP;
    const barWidth = Math.min(contentWidth + 24, width - 16);
    const maxLeft = Math.max(8, width - barWidth - 8);
    const anchorCenterX = anchor.x + anchor.width / 2;
    const anchorCenterY = anchor.y + anchor.height / 2;
    const rowLeft = Math.min(Math.max(8, anchorCenterX - contentWidth / 2 - 12), maxLeft);
    const rowTop = Math.max(8, anchor.y - BAR_HEIGHT - 8);
    const barCenterX = rowLeft + barWidth / 2;
    const barCenterY = rowTop + BAR_HEIGHT / 2;
    const barTranslateX = barProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [anchorCenterX - barCenterX, 0],
    });
    const barTranslateY = barProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [anchorCenterY - barCenterY, 0],
    });
    const barScaleX = barProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.16, 1],
    });
    const barScaleY = barProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 1],
    });

    useEffect(() => {
        barProgress.setValue(0);
        animatedValues.current.forEach((value) => value.setValue(0));

        const animations = animatedValues.current.map((value, index) =>
            Animated.spring(value, {
                toValue: 1,
                delay: index * STAGGER_MS,
                friction: 8,
                tension: 90,
                useNativeDriver: true,
            }),
        );
        Animated.parallel([
            Animated.spring(barProgress, {
                toValue: 1,
                friction: 9,
                tension: 95,
                useNativeDriver: true,
            }),
            Animated.stagger(STAGGER_MS, animations),
        ]).start();
    }, [barProgress, visibleButtons.length]);

    useEffect(() => {
        if (!closing) return;

        const closeDuration = 150 + Math.max(0, visibleButtons.length - 1) * 12;
        const animations = [...animatedValues.current]
            .reverse()
            .map((value, index) =>
                Animated.timing(value, {
                    toValue: 0,
                    duration: 150,
                    delay: index * 12,
                    useNativeDriver: true,
                }),
            );

        Animated.parallel([
            Animated.timing(barProgress, {
                toValue: 0,
                duration: closeDuration,
                useNativeDriver: true,
            }),
            Animated.stagger(12, animations),
        ]).start(({ finished }) => {
            if (finished) onClosed();
        });
    }, [barProgress, closing, onClosed, visibleButtons.length]);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
            <Animated.View
                style={[
                    styles.barWrap,
                    {
                        left: rowLeft,
                        top: rowTop,
                        width: barWidth,
                        opacity: barProgress,
                        transform: [
                            { translateX: barTranslateX },
                            { translateY: barTranslateY },
                            { scaleX: barScaleX },
                            { scaleY: barScaleY },
                        ],
                    },
                ]}
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.barContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {visibleButtons.map((button, index) => {
                        const progress = animatedValues.current[index];
                        const finalCenterX = rowLeft + 12 + index * (ACTION_SIZE + ACTION_GAP) + ACTION_SIZE / 2;
                        const finalCenterY = rowTop + 6 + ACTION_SIZE / 2;
                        const initialTranslateX = anchorCenterX - finalCenterX;
                        const initialTranslateY = anchorCenterY - finalCenterY;

                        return (
                            <Animated.View
                                key={`${button.text}-${index}`}
                                style={{
                                    opacity: progress,
                                    transform: [
                                        {
                                            translateX: progress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [initialTranslateX, 0],
                                            }),
                                        },
                                        {
                                            translateY: progress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [initialTranslateY, 0],
                                            }),
                                        },
                                        {
                                            scale: progress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.8, 1],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <Pressable
                                    style={[
                                        styles.actionButton,
                                        button.style === "destructive" && styles.actionButtonDanger,
                                    ]}
                                    onPress={() => onActionPress(button)}
                                >
                                    <Ionicons
                                        name={getIconName(button.text)}
                                        size={19}
                                        color={button.style === "destructive" ? colors.dangerSoft : colors.text}
                                    />
                                </Pressable>
                                <Text style={styles.actionLabel} numberOfLines={1}>
                                    {button.text}
                                </Text>
                            </Animated.View>
                        );
                    })}
                </ScrollView>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    barWrap: {
        position: "absolute",
        minHeight: BAR_HEIGHT,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        backgroundColor: colors.overlayDark94,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 12,
    },
    barContent: {
        minHeight: BAR_HEIGHT,
        alignItems: "center",
        gap: ACTION_GAP,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    actionButton: {
        width: ACTION_SIZE,
        height: ACTION_SIZE,
        borderRadius: ACTION_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
    },
    actionButtonDanger: {
        borderColor: "rgba(255,107,107,0.4)",
        backgroundColor: "rgba(239,68,68,0.18)",
    },
    actionLabel: {
        display: "none",
    },
});

export default MessageActionBar;
