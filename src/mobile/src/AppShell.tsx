import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ImageBackground, StyleSheet, View, Text, Pressable } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, useFriendRequests, useFriendship } from "../../shared/hooks";
import { SocketService, type MessagePayload } from "../../shared/services/socketService";
import { playIncomingMessageSound } from "../../shared/services/messageSoundService";
import { BottomTabBar } from "./components";
import {
    ChatScreen,
    HomeScreen,
    LoginScreen,
    ProfileScreen,
    RegisterScreen,
    VerifyEmailScreen,
    ForgotPasswordScreen,
    AddFriendScreen,
    FriendRequestsScreen,
    CreateGroupScreen,
    GroupChatScreen,
    GroupSettingsScreen,
    AddMembersScreen,
} from "./screens";
import { assets, colors } from "./theme";

const LoadingState = () => (
    <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent} />
    </View>
);

type AuthMode = "login" | "register" | "verifyEmail" | "forgotPassword";

type VerifyEmailParams = {
    email?: string;
    phone?: string;
    displayName?: string;
    shouldSendInitialOtp?: boolean;
};

const AuthGate = () => {
    const [mode, setMode] = useState<AuthMode>("login");
    const [verifyEmailParams, setVerifyEmailParams] = useState<VerifyEmailParams>({});

    const goToLogin = () => {
        setMode("login");
        setVerifyEmailParams({});
    };

    if (mode === "register") {
        return (
            <RegisterScreen
                onSwitchToLogin={goToLogin}
                onNeedEmailVerification={(params) => {
                    setVerifyEmailParams(params);
                    setMode("verifyEmail");
                }}
            />
        );
    }

    if (mode === "verifyEmail") {
        return (
            <VerifyEmailScreen
                email={verifyEmailParams.email}
                phone={verifyEmailParams.phone}
                shouldSendInitialOtp={verifyEmailParams.shouldSendInitialOtp}
                onVerified={goToLogin}
                onBackToLogin={goToLogin}
            />
        );
    }

    if (mode === "forgotPassword") {
        return <ForgotPasswordScreen onBackToLogin={goToLogin} />;
    }

    return (
        <LoginScreen
            onSwitchToRegister={() => setMode("register")}
            onForgotPassword={() => setMode("forgotPassword")}
            onNeedEmailVerification={(params) => {
                setVerifyEmailParams(params);
                setMode("verifyEmail");
            }}
        />
    );
};

type TabKey = "home" | "chat" | "addFriend" | "requests" | "profile" | "createGroup" | "groupSettings" | "addMembers";

interface SelectedChat {
    // PRIVATE chat fields
    friendId?: string;
    friendName?: string;
    friendAvatar?: string;
    // GROUP chat fields
    conversationId?: string;
    conversationType?: 'PRIVATE' | 'GROUP';
    conversationName?: string;
    // General fields
    [key: string]: any;
}

type MessageNotification = {
    id: string;
    senderName: string;
    preview: string;
};

type RootStackParamList = {
    Main: undefined;
    Chat: { chatUser: SelectedChat | null };
    GroupChat: { selectedChat: SelectedChat; version: number };
    CreateGroup: undefined;
    GroupSettings: { groupId: string };
    AddMembers: { groupId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const getMessageConversationId = (message: any, fallback?: string): string => {
    return String(message?.conversationId || fallback || "");
};

const getMessagePreview = (message: Partial<MessagePayload> & { content?: string; message?: string }): string => {
    const text = String(message?.text || message?.content || message?.message || "").trim();
    if (text) return text;

    const type = String(message?.messageType || message?.type || "").toLowerCase();
    if (type.includes("image")) return "đã gửi 1 ảnh";
    if (type.includes("audio") || type.includes("voice")) return "đã gửi 1 đoạn ghi âm";
    if (type.includes("file") || type.includes("document")) return "đã gửi 1 file đính kèm";
    if (type.includes("video")) return "đã gửi 1 video";

    if (Array.isArray(message?.media) && message.media.length > 0) {
        const mediaType = String(message.media[0]?.mediaType || message.media[0]?.mimetype || "").toLowerCase();
        if (mediaType.includes("image")) return "đã gửi 1 ảnh";
        if (mediaType.includes("audio")) return "đã gửi 1 đoạn ghi âm";
        if (mediaType.includes("video")) return "đã gửi 1 video";
        return "đã gửi 1 file đính kèm";
    }

    return "đã gửi 1 tin nhắn";
};

const MainShell = () => {
    const [activeTab, setActiveTab] = useState<TabKey>("home");
    const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
    const [createdGroupData, setCreatedGroupData] = useState<any>(null);
    const [groupChatVersion, setGroupChatVersion] = useState(0);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList>("Main");
    const [messageNotification, setMessageNotification] = useState<MessageNotification | null>(null);
    const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { isAuthenticated, token, user } = useAuth();
    const {
        requests,
        loading,
        error,
        acceptRequest,
        declineRequest,
        refresh,
    } = useFriendRequests();

    // Shared friendship state (for sent requests, friends list, etc.)
    const friendshipResult = useFriendship();

    useEffect(() => {
        if (!isAuthenticated) {
            setActiveTab("home");
            setActiveConversationId(null);
        }
    }, [isAuthenticated]);

    const currentUserId = useMemo(
        () => String(user?.id || (user as any)?._id || (user as any)?.userId || ""),
        [user],
    );

    useEffect(() => {
        if (!token || !currentUserId) return;

        try {
            if (!SocketService.isConnected()) {
                SocketService.connect(token);
            }
        } catch {
            return;
        }

        const socket = SocketService.getSocket();
        if (!socket) return;

        const showNotification = (message: any, fallbackConversationId?: string) => {
            const conversationId = getMessageConversationId(message, fallbackConversationId);
            const senderId = String(message?.senderId || "");

            if (!conversationId || !senderId || senderId === currentUserId) {
                return;
            }

            const isChatRoute = currentRouteName === "Chat" || currentRouteName === "GroupChat";
            const isCurrentOpenChat = isChatRoute && activeConversationId === conversationId;
            const shouldPlaySound = !isChatRoute || !isCurrentOpenChat;
            const shouldShowBanner = isChatRoute && !isCurrentOpenChat;
            if (!shouldPlaySound) {
                return;
            }

            void playIncomingMessageSound();
            if (!shouldShowBanner) {
                return;
            }

            setMessageNotification({
                id: String(message?._id || message?.id || `${conversationId}-${Date.now()}`),
                senderName: message?.senderName || message?.sender?.displayName || "Tin nhắn mới",
                preview: getMessagePreview(message),
            });

            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
            }
            notificationTimerRef.current = setTimeout(() => {
                setMessageNotification(null);
            }, 3500);
        };

        const handleReceiveMessage = (data: any) => {
            const message = data?.message || data?.systemMessage || data?.activityMessage || data;
            showNotification(message, data?.conversationId);
        };

        const handleQuotedMessage = (data: any) => {
            showNotification(data?.message, data?.conversationId);
        };

        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("message:quoted", handleQuotedMessage);

        return () => {
            socket.off("receiveMessage", handleReceiveMessage);
            socket.off("message:quoted", handleQuotedMessage);
            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
                notificationTimerRef.current = null;
            }
        };
    }, [activeConversationId, currentRouteName, currentUserId, token]);

    const openPrivateChat = (navigation: any, targetUser: any) => {
        const chatUser = {
            id: targetUser.id || targetUser._id || targetUser.userId,
            displayName: targetUser.displayName || targetUser.name || "Người dùng",
            avatar: targetUser.avatar || targetUser.avatarUrl,
            avatarUrl: targetUser.avatarUrl || targetUser.avatar,
            phone: targetUser.phone || targetUser.phoneNumber,
            conversationType: "PRIVATE",
            relationship: targetUser.relationship || "stranger",
            ...targetUser,
        };

        setActiveConversationId(null);
        navigation.navigate("Chat", { chatUser });
    };

    const renderMainScreen = (navigation: NativeStackScreenProps<RootStackParamList, "Main">["navigation"]) => {
        if (activeTab === "profile") {
            return <ProfileScreen />;
        }

        if (activeTab === "addFriend") {
            return (
                <AddFriendScreen
                    state={friendshipResult.state}
                    actions={friendshipResult.actions}
                    onChatPress={(user) => {
                        openPrivateChat(navigation, {
                            ...user,
                            id: user.id || (user as any)._id,
                            phone: user.phone || (user as any).phoneNumber,
                            relationship: "stranger",
                        });
                    }}
                />
            );
        }

        if (activeTab === "requests") {
            return (
                <FriendRequestsScreen
                    requests={requests}
                    loading={loading}
                    error={error}
                    acceptRequest={acceptRequest}
                    declineRequest={declineRequest}
                    refresh={refresh}
                />
            );
        }

        return (
            <HomeScreen
                onFriendPress={(friend) => {
                    openPrivateChat(navigation, friend);
                }}
                onGroupPress={(conversation) => {
                    const selectedChat = {
                        conversationId: conversation._id || conversation.id,
                        conversationType: "GROUP" as const,
                        conversationName: conversation.name,
                        ...conversation,
                    };
                    const groupId = selectedChat.conversationId;
                    if (!groupId) return;
                    setActiveConversationId(String(groupId));
                    navigation.navigate("GroupChat", {
                        selectedChat,
                        version: groupChatVersion,
                    });
                }}
                onCreateGroupPress={() => {
                    navigation.navigate("CreateGroup");
                }}
                createdGroupId={createdGroupId}
                createdGroupData={createdGroupData}
                onGroupCreatedAck={() => {
                    setCreatedGroupId(null);
                    setCreatedGroupData(null);
                }}
            />
        );
    };

    const renderChatScreen = ({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Chat">) => (
        <ChatScreen
            chatUser={route.params.chatUser}
            onConversationReady={(conversationId) => setActiveConversationId(conversationId)}
            onBackPress={() => {
                setActiveConversationId(null);
                navigation.goBack();
            }}
            onOpenPrivateChat={(targetUser) => openPrivateChat(navigation, targetUser)}
        />
    );

    const renderGroupChatScreen = ({ route, navigation }: NativeStackScreenProps<RootStackParamList, "GroupChat">) => {
        const selectedChat = route.params.selectedChat;
        const groupId = selectedChat.conversationId || selectedChat._id || selectedChat.id;

        if (!groupId) {
            return (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <Text>Error: Group ID not found. {JSON.stringify(selectedChat)}</Text>
                </View>
            );
        }

        return (
            <GroupChatScreen
                key={`${groupId}-${groupChatVersion}`}
                route={{
                    params: {
                        groupId,
                        searchTargetMessageId: selectedChat?.searchTargetMessageId,
                        searchTargetMessage: selectedChat?.searchTargetMessage,
                        searchContextMessages: selectedChat?.searchContextMessages,
                    },
                }}
                navigation={{}}
                onBackPress={() => {
                    setActiveConversationId(null);
                    navigation.goBack();
                }}
                onSettingsPress={() => navigation.navigate("GroupSettings", { groupId })}
                onAddMembersPress={() => navigation.navigate("AddMembers", { groupId })}
                onOpenPrivateChat={(targetUser) => openPrivateChat(navigation, targetUser)}
            />
        );
    };

    return (
        <View style={styles.appShell}>
            {messageNotification ? (
                <Pressable style={styles.messageBanner} onPress={() => setMessageNotification(null)}>
                    <Text style={styles.messageBannerTitle} numberOfLines={1}>
                        {messageNotification.senderName}
                    </Text>
                    <Text style={styles.messageBannerPreview} numberOfLines={1}>
                        {messageNotification.preview}
                    </Text>
                </Pressable>
            ) : null}
            <NavigationContainer
                ref={navigationRef}
                onReady={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name || "Main")}
                onStateChange={() => {
                    const routeName = navigationRef.getCurrentRoute()?.name || "Main";
                    setCurrentRouteName(routeName);
                    if (routeName === "Main") {
                        setActiveConversationId(null);
                    }
                }}
            >
                <View style={styles.content}>
                    <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
                        <Stack.Screen name="Main">
                            {({ navigation }) => renderMainScreen(navigation)}
                        </Stack.Screen>
                        <Stack.Screen name="Chat">
                            {(props) => renderChatScreen(props)}
                        </Stack.Screen>
                        <Stack.Screen name="GroupChat">
                            {(props) => renderGroupChatScreen(props)}
                        </Stack.Screen>
                        <Stack.Screen name="CreateGroup">
                            {({ navigation }) => (
                                <CreateGroupScreen
                                    onGroupCreated={(groupId, groupData) => {
                                        setCreatedGroupId(groupId);
                                        setCreatedGroupData(groupData);
                                        navigation.goBack();
                                    }}
                                    onBackPress={() => navigation.goBack()}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="GroupSettings">
                            {({ route, navigation }) => (
                                <GroupSettingsScreen
                                    route={{ params: { groupId: route.params.groupId } }}
                                    navigation={{
                                        goHome: () => {
                                            navigation.popToTop();
                                            setActiveTab("home");
                                        },
                                    }}
                                    onBackPress={() => {
                                        setGroupChatVersion((version) => version + 1);
                                        navigation.goBack();
                                    }}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="AddMembers">
                            {({ route, navigation }) => (
                                <AddMembersScreen
                                    route={{ params: { groupId: route.params.groupId } }}
                                    onBackPress={() => navigation.goBack()}
                                />
                            )}
                        </Stack.Screen>
                    </Stack.Navigator>
                </View>
            </NavigationContainer>
            {currentRouteName === "Main" && (
                <BottomTabBar
                    activeTab={activeTab}
                    onChangeTab={(tab) => setActiveTab(tab as TabKey)}
                    friendRequestCount={requests.length}
                />
            )}
        </View>
    );
};

const AppShell = () => {
    const { loading, isAuthenticated } = useAuth();

    return (
        <ImageBackground source={assets.chatBackground} style={styles.appShell} resizeMode="cover">
            {loading ? <LoadingState /> : !isAuthenticated ? <AuthGate /> : <MainShell />}
        </ImageBackground>
    );
};

export default AppShell;

const styles = StyleSheet.create({
    loadingWrap: {
        flex: 1,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    appShell: {
        flex: 1,
        backgroundColor: "transparent",
    },
    content: {
        flex: 1,
    },
    messageBanner: {
        position: "absolute",
        top: 14,
        left: 14,
        right: 14,
        zIndex: 100,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.overlayWhite18,
        backgroundColor: colors.overlayDark94,
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 8,
    },
    messageBannerTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "800",
    },
    messageBannerPreview: {
        color: colors.textSoft,
        fontSize: 13,
        marginTop: 3,
    },
});
