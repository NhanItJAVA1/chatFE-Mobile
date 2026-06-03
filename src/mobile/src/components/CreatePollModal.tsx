import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CreatePollRequest } from "@/types";
import { colors } from "../theme";

interface CreatePollModalProps {
    visible: boolean;
    isSubmitting: boolean;
    onDismiss: () => void;
    onSubmit: (payload: CreatePollRequest) => Promise<void>;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
    visible,
    isSubmitting,
    onDismiss,
    onSubmit,
}) => {
    const [question, setQuestion] = useState("");
    const [options, setOptions] = useState(["", ""]);
    const [isMultipleChoice, setIsMultipleChoice] = useState(false);
    const [allowChangeVote, setAllowChangeVote] = useState(true);
    const [showResultsBeforeClose, setShowResultsBeforeClose] = useState(true);
    const [allowAddOption, setAllowAddOption] = useState(true);
    const [hideVoters, setHideVoters] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmedOptions = useMemo(
        () => options.map((option) => option.trim()).filter(Boolean),
        [options]
    );

    const reset = () => {
        setQuestion("");
        setOptions(["", ""]);
        setIsMultipleChoice(false);
        setAllowChangeVote(true);
        setShowResultsBeforeClose(true);
        setAllowAddOption(true);
        setHideVoters(false);
        setError(null);
    };

    const handleDismiss = () => {
        if (isSubmitting) return;
        reset();
        onDismiss();
    };

    const updateOption = (index: number, value: string) => {
        setOptions((prev) => {
            const next = prev.map((item, idx) => (idx === index ? value : item));
            if (index === prev.length - 1 && value.trim() && prev.length < 10) {
                next.push("");
            }
            return next;
        });
    };

    const addOption = () => {
        if (options.length >= 10) return;
        setOptions((prev) => [...prev, ""]);
    };

    const removeOption = (index: number) => {
        if (options.length <= 2) return;
        setOptions((prev) => prev.filter((_, idx) => idx !== index));
    };

    const submit = async () => {
        const trimmedQuestion = question.trim();
        if (trimmedQuestion.length < 1 || trimmedQuestion.length > 500) {
            setError("Câu hỏi cần từ 1 đến 500 ký tự");
            return;
        }

        if (trimmedOptions.length < 2 || trimmedOptions.length > 10) {
            setError("Cần từ 2 đến 10 phương án");
            return;
        }

        setError(null);

        const payload: CreatePollRequest = {
            question: trimmedQuestion,
            options: trimmedOptions,
            isMultipleChoice,
            allowAddOption,
            allowChangeVote,
            showResultsBeforeClose,
            hideVoters,
        };

        await onSubmit(payload);
        reset();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Tạo bình chọn</Text>
                        <Pressable style={styles.iconButton} onPress={handleDismiss} hitSlop={8}>
                            <Ionicons name="close" size={22} color={colors.text} />
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        <TextInput
                            style={[styles.input, styles.questionInput]}
                            placeholder="Câu hỏi"
                            placeholderTextColor={colors.textMuted}
                            value={question}
                            onChangeText={setQuestion}
                            multiline
                            maxLength={500}
                        />

                        <View style={styles.optionList}>
                            {options.map((option, index) => (
                                <View key={index} style={styles.optionRow}>
                                    <TextInput
                                        style={styles.optionInput}
                                        placeholder={`Phương án ${index + 1}`}
                                        placeholderTextColor={colors.textMuted}
                                        value={option}
                                        onChangeText={(value) => updateOption(index, value)}
                                        maxLength={120}
                                    />
                                    <Pressable
                                        style={[styles.removeButton, options.length <= 2 && styles.disabledButton]}
                                        onPress={() => removeOption(index)}
                                        disabled={options.length <= 2}
                                    >
                                        <Ionicons name="remove" size={18} color={colors.text} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>

                        <Pressable
                            style={[styles.addOptionButton, options.length >= 10 && styles.disabledButton]}
                            onPress={addOption}
                            disabled={options.length >= 10}
                        >
                            <Ionicons name="add" size={18} color={colors.text} />
                            <Text style={styles.addOptionText}>Thêm phương án</Text>
                        </Pressable>

                        <Pressable style={styles.toggleRow} onPress={() => setAllowChangeVote((prev) => !prev)}>
                            <Ionicons
                                name={allowChangeVote ? "checkbox" : "square-outline"}
                                size={22}
                                color={colors.accentStrong}
                            />
                            <Text style={styles.toggleText}>Cho phép thay đổi bình chọn</Text>
                        </Pressable>

                        <Pressable style={styles.toggleRow} onPress={() => setShowResultsBeforeClose((prev) => !prev)}>
                            <Ionicons
                                name={showResultsBeforeClose ? "checkbox" : "square-outline"}
                                size={22}
                                color={colors.accentStrong}
                            />
                            <Text style={styles.toggleText}>Hiện kết quả trước khi đóng</Text>
                        </Pressable>

                        <Pressable style={styles.toggleRow} onPress={() => setAllowAddOption((prev) => !prev)}>
                            <Ionicons
                                name={allowAddOption ? "checkbox" : "square-outline"}
                                size={22}
                                color={colors.accentStrong}
                            />
                            <Text style={styles.toggleText}>Thành viên thêm phương án</Text>
                        </Pressable>

                        <Pressable style={styles.toggleRow} onPress={() => setIsMultipleChoice((prev) => !prev)}>
                            <Ionicons
                                name={isMultipleChoice ? "checkbox" : "square-outline"}
                                size={22}
                                color={colors.accentStrong}
                            />
                            <Text style={styles.toggleText}>Cho phép chọn nhiều</Text>
                        </Pressable>

                        <Pressable style={styles.toggleRow} onPress={() => setHideVoters((prev) => !prev)}>
                            <Ionicons
                                name={hideVoters ? "checkbox" : "square-outline"}
                                size={22}
                                color={colors.accentStrong}
                            />
                            <Text style={styles.toggleText}>Ẩn người bình chọn</Text>
                        </Pressable>

                        {error && <Text style={styles.errorText}>{error}</Text>}
                    </ScrollView>

                    <View style={styles.footer}>
                        <Pressable style={[styles.footerButton, styles.cancelButton]} onPress={handleDismiss}>
                            <Text style={styles.cancelButtonText}>Hủy</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.footerButton, styles.submitButton, isSubmitting && styles.disabledButton]}
                            onPress={submit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator size="small" color={colors.textOnAccent} />
                            ) : (
                                <Text style={styles.submitButtonText}>Tạo</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "flex-end",
    },
    sheet: {
        maxHeight: "88%",
        backgroundColor: colors.background,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingTop: 14,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    iconButton: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        padding: 16,
        gap: 12,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        backgroundColor: colors.surface,
    },
    questionInput: {
        minHeight: 84,
        textAlignVertical: "top",
    },
    optionList: {
        gap: 8,
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    optionInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        backgroundColor: colors.surface,
    },
    removeButton: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    addOptionButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
    },
    addOptionText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 4,
    },
    toggleText: {
        fontSize: 14,
        color: colors.text,
    },
    errorText: {
        fontSize: 13,
        color: colors.danger || "#dc2626",
    },
    footer: {
        flexDirection: "row",
        gap: 10,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    footerButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelButton: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    submitButton: {
        backgroundColor: colors.accentStrong,
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
    },
    submitButtonText: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.textOnAccent,
    },
    disabledButton: {
        opacity: 0.45,
    },
});
