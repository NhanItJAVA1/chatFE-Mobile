import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme'; // Adjusted standard colors

export const SystemMessageBubble = ({ text }: { text: string }) => {
    return (
        <View style={styles.systemContainer}>
            <Text style={styles.systemText}>{text}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    systemContainer: {
        alignSelf: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        marginVertical: 10,
        maxWidth: '85%',
    },
    systemText: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        lineHeight: 16,
    }
});
