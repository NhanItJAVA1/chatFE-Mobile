import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, configureRuntime, configureStorage } from "../shared";
import AppShell from "./src/AppShell";

configureRuntime({
  apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/v1",
});

configureStorage({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
});

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <AppShell />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
