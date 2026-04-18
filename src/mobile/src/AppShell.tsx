import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View, Text } from "react-native";
import { useAuth, useFriendRequests, useFriendship } from "../../shared/hooks";
import { BottomTabBar } from "./components";
import {
    ChatScreen,
    HomeScreen,
    LoginScreen,
    ProfileScreen,
    RegisterScreen,
    AddFriendScreen,
    FriendRequestsScreen,
    CreateGroupScreen,
    GroupChatScreen,
    GroupSettingsScreen,
} from "./screens";
import { colors } from "./theme";

const LoadingState = () => (
    <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.accent} />
    </View>
);

type AuthMode = "login" | "register";

const AuthGate = () => {
    const [mode, setMode] = useState<AuthMode>("login");

    if (mode === "register") {
        return (
            <RegisterScreen onSwitchToLogin={() => setMode("login")} />
        );
    }

    return (
        <LoginScreen onSwitchToRegister={() => setMode("register")} />
    );
};

type TabKey = "home" | "chat" | "addFriend" | "requests" | "profile" | "createGroup" | "groupSettings";

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

const MainShell = () => {
    const [activeTab, setActiveTab] = useState<TabKey>("home");
    const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
    const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
    const [createdGroupData, setCreatedGroupData] = useState<any>(null);
    const { isAuthenticated } = useAuth();
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
        }
    }, [isAuthenticated]);

    const renderScreen = () => {
        if (activeTab === "createGroup") {
            return (
                <CreateGroupScreen
                    onGroupCreated={(groupId, groupData) => {
                        setCreatedGroupId(groupId);
                        setCreatedGroupData(groupData);
                        setActiveTab("home");
                    }}
                    onBackPress={() => {
                        setActiveTab("home");
                    }}
                />
            );
        }

        if (activeTab === "groupSettings") {
            const groupId = selectedChat?.conversationId;
            if (!groupId) {
                return (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text>Error: Group ID not found</Text>
                    </View>
                );
            }
            return (
                <GroupSettingsScreen
                    route={{ params: { groupId } }}
                    navigation={{}}
                    onBackPress={() => {
                        setActiveTab("chat");
                    }}
                />
            );
        }

        if (activeTab === "chat") {
            // Check if it's a GROUP or PRIVATE chat
            if (selectedChat?.conversationType === 'GROUP') {
                const groupId = selectedChat.conversationId;
                // console.log('[AppShell] Rendering GroupChatScreen:', {
                //     groupId,
                //     selectedChat
                // });
                if (!groupId) {
                    return (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text>Error: Group ID not found. {JSON.stringify(selectedChat)}</Text>
                        </View>
                    );
                }
                return (
                    <GroupChatScreen
                        route={{ params: { groupId } }}
                        navigation={{}}
                        onBackPress={() => {
                            setActiveTab("home");
                            setSelectedChat(null);
                        }}
                        onSettingsPress={() => {
                            setActiveTab("groupSettings");
                        }}
                    />
                );
            }

            return (
                <ChatScreen
                    chatUser={selectedChat}
                    onBackPress={() => {
                        setActiveTab("home");
                        setSelectedChat(null);
                    }}
                />
            );
        }

        if (activeTab === "profile") {
            return <ProfileScreen />;
        }

        if (activeTab === "addFriend") {
            return <AddFriendScreen state={friendshipResult.state} actions={friendshipResult.actions} />;
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
                    setSelectedChat(friend);
                    setActiveTab("chat");
                }}
                onGroupPress={(conversation) => {
                    // console.log('[AppShell] Group conversation selected:', {
                    //     conversationId: conversation._id || conversation.id,
                    //     name: conversation.name,
                    // });
                    setSelectedChat({
                        conversationId: conversation._id || conversation.id,
                        conversationType: 'GROUP',
                        conversationName: conversation.name,
                        ...conversation,
                    });
                    setActiveTab("chat");
                }}
                onCreateGroupPress={() => {
                    setActiveTab("createGroup");
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

    return (
        <View style={styles.appShell}>
            <View style={styles.content}>{renderScreen()}</View>
            {activeTab !== "chat" && activeTab !== "createGroup" && activeTab !== "groupSettings" && (
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

    if (loading) {
        return <LoadingState />;
    }

    if (!isAuthenticated) {
        return <AuthGate />;
    }

    return <MainShell />;
};

export default AppShell;

const styles = StyleSheet.create({
    loadingWrap: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
    },
    appShell: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
    },
});
