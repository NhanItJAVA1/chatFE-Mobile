import React, { FC } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, configureRuntime, configureStorage } from "../shared";
import AppShell from "./src/AppShell";
import { ExplosionProvider } from "./src/components/ExplosionProvider";

interface RuntimeConfig {
  apiUrl: string;
}

interface StorageConfig {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

configureRuntime({
  apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.6:3000/v1",
} as RuntimeConfig);

configureStorage({
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
} as StorageConfig);

const App: FC = () => {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <ExplosionProvider>
          <AppShell />
        </ExplosionProvider>
      </SafeAreaView>
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
