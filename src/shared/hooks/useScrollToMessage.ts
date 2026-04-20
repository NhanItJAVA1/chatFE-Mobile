import { useRef, useState, useCallback, useEffect } from "react";
import { FlatList, Animated } from "react-native";
import { MessagePayload } from "../services/socketService";

export interface UseScrollToMessageOptions {
    fetchMissingMessage?: (messageId: string) => Promise<boolean>;
}

export const useScrollToMessage = (options?: UseScrollToMessageOptions) => {
    const flatListRef = useRef<FlatList<any>>(null);
    const messageIndexMapRef = useRef<Map<string, number>>(new Map());
    
    // External states for highlighting and pending jumps
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const executeScroll = useCallback((messageId: string, index: number) => {
        try {
            flatListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.5,
            });
        } catch (error) {
            console.warn("[useScrollToMessage] scrollToIndex failed, falling back to offset", error);
            try {
                flatListRef.current?.scrollToOffset({
                    offset: index * 100,
                    animated: true,
                });
            } catch (fallbackError) {
                console.error("[useScrollToMessage] Fallback failed", fallbackError);
            }
        }

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        setHighlightedMessageId(messageId);

        timeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
            timeoutRef.current = null;
        }, 2000);
    }, []);

    const buildMessageIndexMap = useCallback((messages: any[]) => {
        const map = new Map<string, number>();
        messages.forEach((msg, idx) => {
            const id = msg._id || msg.id;
            if (id) {
                map.set(id, idx);
            }
        });
        messageIndexMapRef.current = map;

        // If we were waiting for a message to arrive into the flat list, check it now
        setPendingScrollId((prevPendingId) => {
            if (prevPendingId && map.has(prevPendingId)) {
                const index = map.get(prevPendingId)!;
                // Defer the scroll slightly so FlatList has a chance to lay out the new item
                setTimeout(() => {
                    executeScroll(prevPendingId, index);
                }, 100);
                return null;
            }
            return prevPendingId;
        });
    }, [executeScroll]);

    const scrollToMessage = useCallback(async (messageId: string) => {
        const index = messageIndexMapRef.current.get(messageId);

        if (index !== undefined) {
            executeScroll(messageId, index);
            return;
        }

        if (options?.fetchMissingMessage) {
            setPendingScrollId(messageId);
            const success = await options.fetchMissingMessage(messageId);
            if (!success) {
                // Fetch failed or message not found
                setPendingScrollId(null);
            }
        } else {
            console.warn(`[useScrollToMessage] Target message ${messageId} not found locally.`);
        }
    }, [executeScroll, options]);

    return {
        flatListRef,
        highlightedMessageId,
        scrollToMessage,
        buildMessageIndexMap,
        isScrollingToPending: !!pendingScrollId,
    };
};

export const useMessageHighlightAnimation = (isHighlighted: boolean) => {
    const animation = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isHighlighted) {
            Animated.sequence([
                Animated.timing(animation, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(animation, {
                    toValue: 0,
                    duration: 500,
                    delay: 1200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            animation.setValue(0);
        }
    }, [isHighlighted, animation]);

    const animatedStyle = {
        transform: [
            {
                scale: animation.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1, 1.05, 1],
                }),
            },
        ],
        opacity: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.8],
        }),
    };

    return animatedStyle;
};
