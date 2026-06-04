import React, { FC } from "react";
import { LogBox, SafeAreaView, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";
import { AuthProvider, CallProvider, configureRuntime, configureStorage } from "../shared";
import AppShell from "./src/AppShell";
import { ExplosionProvider } from "./src/components/ExplosionProvider";

registerGlobals();
LogBox.ignoreAllLogs(true);

interface RuntimeConfig {
  apiUrl: string;
}

interface StorageConfig {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

configureRuntime({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
} as RuntimeConfig);

configureStorage({
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
} as StorageConfig);

const App: FC = () => {
  return (
    <AuthProvider>
      <CallProvider>
        <SafeAreaView style={styles.root}>
          <StatusBar style="light" />
          <ExplosionProvider>
            <AppShell />
          </ExplosionProvider>
        </SafeAreaView>
      </CallProvider>
    </AuthProvider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
});

export default App;
