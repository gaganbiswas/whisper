import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { getConversations, initLocalDb, type Conversation } from "@/db/init";
import { getUserEmail } from "@/lib/users";
import { useChat } from "@/context/chat-context";
import NewChatSheet from "@/components/new-chat-sheet";
import { useTheme } from "@/lib/theme";

function openChat(peerId: number) {
  router.push({
    pathname: "/(private)/chat/[id]",
    params: { id: String(peerId) },
  });
}

export default function ChatsScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [emails, setEmails] = useState<Record<number, string>>({});
  const { action } = useLocalSearchParams();
  const { colors } = useTheme();
  const router = useRouter();

  const loadConversations = useCallback(async () => {
    try {
      await initLocalDb();
      const rows = await getConversations();
      setConversations(rows);
      const names = await Promise.all(
        rows.map(
          async ({ peer_id }) =>
            [peer_id, await getUserEmail(peer_id)] as const,
        ),
      );
      setEmails(Object.fromEntries(names));
    } catch (error: any) {
      Alert.alert(
        "Could not load chats",
        error?.message || "Please try again.",
      );
    }
  }, []);

  const { messageVersion } = useChat();

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations, messageVersion]),
  );

  const closeNewChat = () => {
    router.setParams({ action: "" });
  };

  const startedChat = useCallback((peerId: number) => {
    closeNewChat();
    openChat(peerId);
  }, []);

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <NewChatSheet
        visible={action === "new-chat"}
        onClose={closeNewChat}
        onStarted={startedChat}
      />

      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.peer_id)}
        renderItem={({ item }) => (
          <ChatItem
            peerId={item.peer_id}
            name={emails[item.peer_id] || ""}
            lastMessage={item.last_message ?? ""}
          />
        )}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={
          <View className="h-[1px] bg-divider dark:bg-divider-dark"></View>
        }
      />
    </SafeAreaView>
  );
}

function ChatItem({
  peerId,
  name,
  lastMessage,
}: {
  peerId: number;
  name: string;
  lastMessage: string;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      className="flex-row bg-panel p-4 dark:bg-panel-dark"
      onPress={() => openChat(peerId)}
    >
      <View
        className="mr-4 h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.avatar }}
      >
        <Text
          className="text-lg font-bold"
          style={{ color: colors.avatarText }}
        >
          {name[0]?.toUpperCase()}
        </Text>
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-semibold text-fg dark:text-fg-dark">{name}</Text>
        <Text
          className="text-fg-muted dark:text-fg-muted-dark"
          numberOfLines={1}
        >
          {lastMessage}
        </Text>
      </View>
    </Pressable>
  );
}
