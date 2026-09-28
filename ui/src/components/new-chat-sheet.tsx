import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { BottomSheet, RNHostView } from "@expo/ui";
import { saveConversation } from "@/db/init";
import { getMyUserId } from "@/lib/auth";
import { lookupUserByEmail } from "@/lib/users";
import { useTheme } from "@/lib/theme";

export default function NewChatSheet({
  visible,
  onClose,
  onStarted,
}: {
  visible: boolean;
  onClose: () => void;
  onStarted: (peerId: number) => void;
}) {
  const { colors } = useTheme();

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      containerColor={colors.panel}
      contentPadding={0}
    >
      <RNHostView matchContents>
        <NewChatForm onStarted={onStarted} />
      </RNHostView>
    </BottomSheet>
  );
}

function NewChatForm({ onStarted }: { onStarted: (peerId: number) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const startChat = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const [currentUserId, user] = await Promise.all([
        getMyUserId(),
        lookupUserByEmail(normalizedEmail),
      ]);
      if (!user) {
        setError("No one with that email uses PingMe yet.");
        return;
      }
      if (user.id === currentUserId) {
        setError("That's your own account. Try someone else's email.");
        return;
      }
      await saveConversation(user.id);
      onStarted(user.id);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.message || "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      className={`px-5 pb-6 ${Platform.OS === "ios" ? "pt-8" : "pt-2"}`}
      style={{ width }}
    >
      <Text className="text-xl font-bold text-fg dark:text-fg-dark">
        New chat
      </Text>
      <Text className="mt-1 text-fg-muted dark:text-fg-muted-dark">
        Enter the email address of the person you want to message.
      </Text>

      <TextInput
        className={`mt-5 rounded-2xl border bg-field px-4 py-3.5 text-fg dark:bg-field-dark dark:text-fg-dark ${error ? "border-rose-400" : "border-divider dark:border-divider-dark"}`}
        placeholder="name@example.com"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        autoFocus
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) setError(null);
        }}
        onSubmitEditing={startChat}
        returnKeyType="go"
        editable={!submitting}
      />
      {error ? (
        <Text className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </Text>
      ) : null}

      <Pressable
        className="mt-5 h-12 items-center justify-center rounded-2xl bg-emerald-600 disabled:opacity-40"
        onPress={startChat}
        disabled={!email.trim() || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="font-semibold text-white">Start chat</Text>
        )}
      </Pressable>
    </View>
  );
}
