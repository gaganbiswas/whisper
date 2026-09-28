import { router, Stack } from "expo-router";
import { ChatProvider } from "@/context/chat-context";
import { Pressable } from "react-native";
import { SymbolView } from "expo-symbols";

export default function PrivateLayout() {
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
                  <SymbolView name={{ ios: "plus", android: "add" }} />
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
