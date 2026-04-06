import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../shared/hooks";
import { Avatar, Card, PrimaryButton, SectionTitle, TextField } from "./components";
import { chats, conversation } from "./data";
import { colors, gradients } from "./theme";

const AuthShell = ({ children, title, subtitle, footer }) => (
  <LinearGradient colors={gradients.auth} style={styles.authScreen}>
    <View style={styles.authGlowOne} />
    <View style={styles.authGlowTwo} />
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authKeyboard}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.authBadge}>
          <Ionicons name="paper-plane" size={16} color={colors.text} />
          <Text style={styles.authBadgeText}>Telegram</Text>
        </View>
        <Text style={styles.authTitle}>{title}</Text>
        <Text style={styles.authSubtitle}>{subtitle}</Text>
        <Card style={styles.authCard}>{children}</Card>
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  </LinearGradient>
);

export const LoginScreen = ({ onSwitchToRegister }) => {
  const { login, loading, error } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async () => {
    try {
      setLocalError("");
      if (!phone || !password) {
        setLocalError("Please fill in all fields");
        return;
      }

      await login(phone, password);
    } catch (submitError) {
      setLocalError(submitError.message || "Login failed");
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Login to continue chatting with your friends."
      footer={
        <Pressable onPress={onSwitchToRegister} style={styles.authFooterLink}>
          <Text style={styles.authFooterText}>Don't have an account? </Text>
          <Text style={styles.authFooterAccent}>Register now</Text>
        </Pressable>
      }
    >
      <View style={styles.formGap}>
        <TextField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="0912345678" keyboardType="phone-pad" editable={!loading} />
        <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry editable={!loading} />
        {!!(localError || error) && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{localError || error}</Text>
          </View>
        )}
        <PrimaryButton label="Login" onPress={handleSubmit} loading={loading} />
      </View>
    </AuthShell>
  );
};

export const RegisterScreen = ({ onSwitchToLogin }) => {
  const { register, loading, error } = useAuth();
  const [formData, setFormData] = useState({ phone: "", password: "", confirmPassword: "", email: "", displayName: "" });
  const [localError, setLocalError] = useState("");

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.phone || !formData.password || !formData.email || !formData.displayName) {
      setLocalError("Please fill in all fields");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setLocalError("Passwords do not match");
      return false;
    }

    if (formData.password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return false;
    }

    if (!/^0\d{9}$/.test(formData.phone)) {
      setLocalError("Phone number must be 10 digits starting with 0");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setLocalError("Please enter a valid email");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    try {
      setLocalError("");
      if (!validateForm()) {
        return;
      }

      const { confirmPassword, ...payload } = formData;
      await register(payload);
      Alert.alert("Success", "Account created. Please login.");
      onSwitchToLogin();
    } catch (submitError) {
      setLocalError(submitError.message || "Registration failed");
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join the chat and start connecting with your friends."
      footer={
        <Pressable onPress={onSwitchToLogin} style={styles.authFooterLink}>
          <Text style={styles.authFooterText}>Already have an account? </Text>
          <Text style={styles.authFooterAccent}>Back to login</Text>
        </Pressable>
      }
    >
      <View style={styles.formGap}>
        <TextField label="Display Name" value={formData.displayName} onChangeText={(value) => updateField("displayName", value)} placeholder="Your name" editable={!loading} />
        <TextField label="Email" value={formData.email} onChangeText={(value) => updateField("email", value)} placeholder="your@email.com" keyboardType="email-address" autoCapitalize="none" editable={!loading} />
        <TextField label="Phone Number" value={formData.phone} onChangeText={(value) => updateField("phone", value)} placeholder="0912345678" keyboardType="phone-pad" editable={!loading} />
        <TextField label="Password" value={formData.password} onChangeText={(value) => updateField("password", value)} placeholder="Enter password" secureTextEntry editable={!loading} />
        <TextField label="Confirm Password" value={formData.confirmPassword} onChangeText={(value) => updateField("confirmPassword", value)} placeholder="Confirm password" secureTextEntry editable={!loading} />
        {!!(localError || error) && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{localError || error}</Text>
          </View>
        )}
        <PrimaryButton label="Register" onPress={handleSubmit} loading={loading} />
      </View>
    </AuthShell>
  );
};

export const HomeScreen = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const truncateName = (name, maxLength = 20) => {
    if (!name || name.length <= maxLength) {
      return name;
    }
    return name.slice(0, Math.floor(maxLength / 2)) + "...";
  };

  const filteredChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return chats;
    }

    return chats.filter((item) => item.name.toLowerCase().includes(needle) || item.message.toLowerCase().includes(needle));
  }, [query]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.homeContent} keyboardShouldPersistTaps="handled">
        <View style={styles.homeTopRow}>
          <View style={styles.brandPill}>
            <Ionicons name="paper-plane" size={14} color={colors.text} />
            <Text style={styles.brandText}>Telegram</Text>
          </View>
          <Pressable style={styles.actionCircle}>
            <Ionicons name="create-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        <SectionTitle title="Chat" subtitle={user?.displayName ? `Hello, ${truncateName(user.displayName, 20)}` : "Your recent conversations"} rightLabel="S\u1eeda" />

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search chats" placeholderTextColor={colors.textMuted} style={styles.searchInput} />
        </View>

        <View style={styles.filterRow}>
          <View style={[styles.filterChip, styles.filterChipActive]}>
            <Text style={styles.filterTextActive}>All</Text>
          </View>
          <View style={styles.filterChip}><Text style={styles.filterText}>Unread</Text></View>
          <View style={styles.filterChip}><Text style={styles.filterText}>Groups</Text></View>
          <View style={styles.filterChip}><Text style={styles.filterText}>Calls</Text></View>
        </View>

        <Card style={styles.chatListCard}>
          {filteredChats.map((item, index) => (
            <Pressable key={item.id} style={[styles.chatRow, index !== filteredChats.length - 1 && styles.rowDivider]}>
              <Avatar label={item.initials} size={54} backgroundColor={item.accent} textSize={16} />
              <View style={styles.chatMeta}>
                <View style={styles.chatTopLine}>
                  <Text style={styles.chatName} numberOfLines={1}>{truncateName(item.name)}{item.verified ? " " : ""}</Text>
                  <Text style={styles.chatTime}>{item.time}</Text>
                </View>
                <View style={styles.chatBottomLine}>
                  <Text style={styles.chatMessage} numberOfLines={1}>{item.message}</Text>
                  {item.unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{item.unread}</Text></View> : null}
                </View>
              </View>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
};

export const ChatScreen = ({ onBackPress }) => {
  const truncateName = (name, maxLength = 20) => {
    if (!name || name.length <= maxLength) {
      return name;
    }
    return name.slice(0, Math.floor(maxLength / 2)) + "...";
  };

  return (
    <View style={styles.screen}>
      <View style={styles.chatHeaderWrap}>
        <Pressable style={styles.backButton} onPress={onBackPress}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.chatHeaderCard}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>{truncateName("\u0110\u1ee9c Tu\u1ef3n Th\u1ee7")}</Text>
          <Text style={styles.chatHeaderSubtitle}>tr\u1ef1c tuy\u1ebfn 2 gi\u1edd tr\u01b0\u1edbc</Text>
        </View>
        <View style={styles.headerAvatarWrap}>
          <Avatar label="\u0110T" size={52} backgroundColor="#4f8cff" textSize={14} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.chatDateDivider}>8 Th\u00e1ng 2</Text>
        {conversation.map((item) => (
          <View key={item.id} style={[styles.bubbleRow, item.type === "outgoing" ? styles.outgoingRow : styles.incomingRow]}>
            <View style={[styles.bubble, item.type === "outgoing" ? styles.outgoingBubble : styles.incomingBubble]}>
              <Text style={styles.bubbleText}>{item.text}</Text>
              <View style={styles.bubbleMetaRow}>
                <Text style={styles.bubbleTime}>{item.time}</Text>
                {item.edited ? <Text style={styles.editedText}>\u0111\u00e3 s\u1eeda</Text> : null}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.messageComposer}>
        <Pressable style={styles.composerIconButton}><Ionicons name="attach-outline" size={24} color={colors.text} /></Pressable>
        <View style={styles.composerInputWrap}>
          <TextInput placeholder="Tin nh\u1eafn" placeholderTextColor={colors.textMuted} style={styles.composerInput} />
          <Ionicons name="happy-outline" size={22} color={colors.textMuted} style={styles.composerEmoji} />
        </View>
        <Pressable style={styles.composerIconButton}><Ionicons name="mic-outline" size={24} color={colors.text} /></Pressable>
      </View>
    </View>
  );
};

export const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const truncateName = (name, maxLength = 20) => {
    if (!name || name.length <= maxLength) {
      return name;
    }
    return name.slice(0, Math.floor(maxLength / 2)) + "...";
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.profileContent}>
      <View style={styles.profileTopRow}>
        <Pressable style={styles.profileMenuButton}>
          <Ionicons name="grid-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable style={styles.profileEditButton}>
          <Text style={styles.profileEditText}>S\u1eeda</Text>
        </Pressable>
      </View>

      <Avatar label={(user?.displayName || "U").slice(0, 1).toUpperCase()} size={104} backgroundColor="#3d6df2" textSize={34} style={styles.profileAvatar} />
      <Text style={styles.profileName}>{truncateName(user?.displayName || "Hu\u1ef3nh Tr\u1ecdng Nh\u00e2n")}</Text>
      <Text style={styles.profilePhone}>{user?.phone || "+84 91 446 22 97"}</Text>

      <Card style={styles.profileCard}>
        <Pressable style={styles.profileActionRow}>
          <View style={styles.profileActionIcon}><Ionicons name="camera-outline" size={22} color="#4f8cff" /></View>
          <Text style={styles.profileActionText}>\u0110\u1ed5i \u1ea3nh \u0111\u1ea1i di\u1ec7n</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.profileActionRow}>
          <View style={styles.profileActionIcon}><Ionicons name="at-outline" size={22} color="#4f8cff" /></View>
          <Text style={styles.profileActionText}>\u0110\u1eb7t t\u00ean ng\u01b0\u1eddi d\u00f9ng</Text>
        </Pressable>
      </Card>

      <Card style={styles.warningCard}>
        <View style={styles.warningHeader}>
          <View style={styles.warningIcon}><Ionicons name="alert-circle" size={20} color="#ff6b6b" /></View>
          <Text style={styles.warningTitle}>+84 91 446 22 97 v\u1ea9n l\u00e0 s\u1ed1 c\u1ee7a b\u1ea1n?</Text>
        </View>
        <Text style={styles.warningBody}>Ch\u00fa \u00fd ki\u1ec3m tra s\u1ed1 \u0111i\u1ec7n tho\u1ea1i \u0111\u1ec3 b\u1ea1n lu\u00f4n c\u00f3 th\u1ec3 \u0111\u0103ng nh\u1eadp Telegram. T\u00ecm hi\u1ec3u th\u00eam</Text>
        <View style={styles.warningDivider} />
        <Pressable style={styles.warningLinkRow}><Text style={styles.warningLink}>Gi\u1eef s\u1ed1 +84 91 446 22 97</Text></Pressable>
        <View style={styles.warningDivider} />
        <Pressable style={styles.warningLinkRow}><Text style={styles.warningLink}>\u0110\u1ed5i s\u1ed1</Text></Pressable>
      </Card>

      <Card style={styles.profileMenuCard}>
        <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#ff6b5c" }]}><Ionicons name="person" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Trang c\u00e1 nh\u00e2n</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#3b82f6" }]}><Ionicons name="bookmark" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Tin nh\u1eafn \u0111\u00e3 l\u01b0u</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.menuItemRow}><View style={[styles.menuIcon, { backgroundColor: "#22c55e" }]}><Ionicons name="call" size={18} color={colors.text} /></View><Text style={styles.menuItemText}>Cu\u1ed9c g\u1ecdi g\u1ea7n \u0111\u00e2y</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
      </Card>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.text} />
        <Text style={styles.logoutText}>\u0110\u0103ng xu\u1ea5t</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  authScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 18,
  },
  authGlowOne: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(59,130,246,0.18)",
    top: 70,
    left: -70,
  },
  authGlowTwo: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(124,58,237,0.20)",
    right: -60,
    top: 160,
  },
  authKeyboard: {
    flex: 1,
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
    gap: 14,
  },
  authBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(59,130,246,0.28)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  authBadgeText: {
    color: colors.text,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  authTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  authSubtitle: {
    color: colors.textSoft,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 4,
  },
  authCard: {
    padding: 18,
    gap: 14,
  },
  authFooterLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 6,
  },
  authFooterText: {
    color: colors.textSoft,
  },
  authFooterAccent: {
    color: colors.accent,
    fontWeight: "700",
  },
  formGap: {
    gap: 14,
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.28)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  errorText: {
    color: "#ff9b9b",
    fontSize: 13,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  homeContent: {
    padding: 16,
    paddingBottom: 96,
    gap: 14,
  },
  homeTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: "#143f7f",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  brandText: {
    color: colors.text,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 50,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: "rgba(59,130,246,0.18)",
    borderColor: "rgba(59,130,246,0.32)",
  },
  filterText: {
    color: colors.textSoft,
    fontWeight: "600",
    fontSize: 12,
  },
  filterTextActive: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  chatListCard: {
    padding: 0,
    overflow: "hidden",
  },
  chatRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    alignItems: "center",
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chatMeta: {
    flex: 1,
    gap: 5,
  },
  chatTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chatName: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  chatTime: {
    color: colors.textMuted,
    fontSize: 12,
    flexShrink: 0,
  },
  chatBottomLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatMessage: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
  },
  unreadBadge: {
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  chatHeaderWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  chatHeaderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  chatHeaderSubtitle: {
    color: colors.textSoft,
    fontSize: 12,
    marginTop: 2,
  },
  headerAvatarWrap: {
    width: 52,
  },
  chatContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 10,
  },
  chatDateDivider: {
    alignSelf: "center",
    color: colors.textMuted,
    fontSize: 13,
    marginVertical: 10,
  },
  bubbleRow: {
    flexDirection: "row",
  },
  incomingRow: {
    justifyContent: "flex-start",
  },
  outgoingRow: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  incomingBubble: {
    backgroundColor: colors.incoming,
    borderTopLeftRadius: 6,
  },
  outgoingBubble: {
    backgroundColor: colors.outgoing,
    borderTopRightRadius: 6,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleMetaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  bubbleTime: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
  },
  editedText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
  },
  messageComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  composerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInputWrap: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  composerInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  composerEmoji: {
    marginLeft: 8,
  },
  profileContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 30,
    alignItems: "center",
    gap: 16,
  },
  profileTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileMenuButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileEditButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileEditText: {
    color: colors.text,
    fontWeight: "700",
  },
  profileAvatar: {
    marginTop: 6,
  },
  profileName: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  profilePhone: {
    color: colors.textMuted,
    fontSize: 18,
    textAlign: "center",
  },
  profileCard: {
    width: "100%",
    gap: 8,
  },
  profileActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
  },
  profileActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(79,140,255,0.14)",
  },
  profileActionText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  warningCard: {
    width: "100%",
    gap: 10,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  warningTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  warningBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  warningDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  warningLinkRow: {
    paddingVertical: 2,
  },
  warningLink: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  profileMenuCard: {
    width: "100%",
    gap: 2,
  },
  menuItemRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  logoutButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  logoutText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
});


