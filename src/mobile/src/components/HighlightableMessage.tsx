import React from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { useMessageHighlightAnimation } from '../../../shared/hooks/useScrollToMessage';

interface HighlightableMessageProps extends Omit<PressableProps, 'style'> {
    isHighlighted: boolean;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const HighlightableMessage: React.FC<HighlightableMessageProps> = ({ 
    isHighlighted, 
    children, 
    style,
    ...props 
}) => {
    const animatedStyle = useMessageHighlightAnimation(isHighlighted);

    return (
        <AnimatedPressable 
            style={[style, animatedStyle]} 
            {...props}
        >
            {children}
        </AnimatedPressable>
    );
};
