import { router, Stack } from "expo-router";
import { ChatProvider } from "@/context/chat-context";
import { Pressable } from "react-native";
import { Lucide } from "@react-native-vector-icons/lucide";
import { useTheme } from "@/lib/theme";

export default function PrivateLayout() {
  const { colors } = useTheme();
  return (
    <ChatProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "Chats",
            headerLargeTitleEnabled: true,
            headerRight: () => {
              return (
                <Pressable
                  onPress={() =>
                    router.setParams({
                      action: "new-chat",
                    })
                  }
                  hitSlop={8}
                >
                  <Lucide name="plus" color={colors.primary} size={24} />
                </Pressable>
              );
            },
          }}
        />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      </Stack>
    </ChatProvider>
  );
}
