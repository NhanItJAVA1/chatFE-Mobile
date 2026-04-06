import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "../../shared/hooks";
import { BottomTabBar } from "./components";
import { ChatScreen, HomeScreen, LoginScreen, ProfileScreen, RegisterScreen } from "./screens";
import { colors } from "./theme";

const LoadingState = () => (
  <View style={styles.loadingWrap}>
    <ActivityIndicator size="large" color={colors.accent} />
  </View>
);

const AuthGate = () => {
  const [mode, setMode] = useState("login");

  if (mode === "register") {
    return <RegisterScreen onSwitchToLogin={() => setMode("login")} />;
  }

  return <LoginScreen onSwitchToRegister={() => setMode("register")} />;
};

const MainShell = () => {
  const [activeTab, setActiveTab] = useState("home");
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveTab("home");
    }
  }, [isAuthenticated]);

  const renderScreen = () => {
    if (activeTab === "chat") {
      return <ChatScreen onBackPress={() => setActiveTab("home")} />;
    }

    if (activeTab === "profile") {
      return <ProfileScreen />;
    }

    return <HomeScreen />;
  };

  return (
    <View style={styles.appShell}>
      <View style={styles.content}>{renderScreen()}</View>
      {activeTab !== "chat" && <BottomTabBar activeTab={activeTab} onChangeTab={setActiveTab} />}
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
