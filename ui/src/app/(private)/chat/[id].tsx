import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMyUserId } from "@/lib/auth";
import {
  getMessagesWith,
  initLocalDb,
  saveConversation,
  type ChatMessage,
} from "@/db/init";
import { getUserEmail } from "@/lib/users";
import { useChat } from "@/context/chat-context";
import MessageStatusIcon from "@/components/message-status";
import { useTheme } from "@/lib/theme";
import { Lucide } from "@react-native-vector-icons/lucide";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const peerId = Number(id);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [peerEmail, setPeerEmail] = useState("Chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const { isConnected, sendMessage, markSeen, messageVersion } = useChat();
  const { colors } = useTheme();

  const loadChat = useCallback(async () => {
    if (!Number.isInteger(peerId) || peerId <= 0) {
      Alert.alert("Invalid conversation", "This chat could not be opened.");
      router.back();
      return;
    }
    try {
      const userId = await getMyUserId();
      await initLocalDb();
      await saveConversation(peerId);
      const [chatMessages, email] = await Promise.all([
        getMessagesWith(userId, peerId),
        getUserEmail(peerId),
      ]);
      setMyUserId(userId);
      setPeerEmail(email);
      setMessages(chatMessages);
    } catch (error: any) {
      Alert.alert("Could not open chat", error?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (!myUserId) return;
    getMessagesWith(myUserId, peerId).then(setMessages);
  }, [myUserId, peerId, messageVersion]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  // Only report messages as seen while this chat is actually on screen.
  useEffect(() => {
    if (!myUserId || !isConnected || !appActive) return;
    markSeen(peerId).catch((error) =>
      console.warn("Could not send seen receipt", error),
    );
  }, [myUserId, peerId, isConnected, appActive, messageVersion, markSeen]);

  const submitMessage = async () => {
    const text = draft.trim();
    if (!text || !myUserId || sending) return;
    try {
      setSending(true);
      await sendMessage(peerId, text);
      setDraft("");
    } catch (error: any) {
      Alert.alert(
        "Message not sent",
        error?.message || "Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.panel }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
      >
        {loading ? (
          <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            className="flex-1 bg-canvas dark:bg-canvas-dark"
            data={messages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={{
              padding: 16,
              flexGrow: 1,
              justifyContent: "flex-end",
            }}
            renderItem={({ item }) => {
              const mine = item.from_user === myUserId;
              return (
                <View
                  className={`mb-3 max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "self-end rounded-br-sm bg-bubble-out dark:bg-bubble-out-dark" : "self-start rounded-bl-sm bg-bubble-in dark:bg-bubble-in-dark"}`}
                >
                  <Text className="text-fg dark:text-fg-dark">{item.text}</Text>
                  <View className="mt-1 flex-row items-center justify-end">
                    <Text className="text-[10px] text-fg-muted dark:text-fg-muted-dark">
                      {new Date(item.ts).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                    {mine ? <MessageStatusIcon status={item.status} /> : null}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-center text-fg-muted dark:text-fg-muted-dark">
                  <Lucide
                    name={"lock"}
                    size={14}
                    className="text-center dark:text-[#8696a0] text-[#667781]"
                  />{" "}
                  Messages are end-to-end encrypted.
                </Text>
              </View>
            }
          />
        )}

        <View className="flex-row items-end border-t border-divider bg-panel px-3 py-4 dark:border-divider-dark dark:bg-panel-dark gap-3">
          <TextInput
            className="min-h-10 flex-1 rounded-full bg-field px-4 py-3 text-fg dark:bg-field-dark dark:text-fg-dark"
            placeholder="Write a message"
            placeholderTextColor={colors.placeholder}
            multiline
            value={draft}
            onChangeText={setDraft}
          />
          <Pressable
            className="w-10 h-10 items-center justify-center rounded-full bg-emerald-600 disabled:opacity-40"
            onPress={submitMessage}
            disabled={!draft.trim() || sending}
          >
            <Lucide name={"send-horizonal"} color={"white"} size={20} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
