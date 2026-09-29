import PrimaryButton from "@/components/ui/button";
import { Text, TextInput, View, Keyboard } from "react-native";
import { useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useRouter } from "expo-router";
import Loader from "@/components/loader";
import ax from "@/lib/axios";
import Alert from "@/components/alert";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerification = async () => {
    Keyboard.dismiss();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      setLoading(true);
      await ax.post("/send-verification-code", { email: normalizedEmail });
      router.push({
        pathname: "/onboarding/verify",
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      Alert(
        "Error",
        error?.response?.data?.message || error?.message || "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Loader visible={loading}>Fetching credentials...</Loader>
      <SafeAreaView
        edges={["bottom", "left", "right"]}
        style={{ backgroundColor: colors.panel, flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior="padding"
          automaticOffset
          style={{ flex: 1, alignItems: "center" }}
        >
          <Text className="text-2xl font-semibold text-center text-fg dark:text-fg-dark">
            Enter your email address
          </Text>
          <Text className="text-center mt-2 text-fg-muted dark:text-fg-muted-dark">
            PingMe needs to verify your account, to keep your{"\n"}messages safe
            from hunters
          </Text>

          <View className="p-8 items-center justify-center w-full">
            <TextInput
              className="bg-field rounded-2xl px-4 py-4 w-full text-fg dark:bg-field-dark dark:text-fg-dark"
              placeholder="your email address"
              placeholderTextColor={colors.placeholder}
              textContentType="emailAddress"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="next"
              onChangeText={setEmail}
              onSubmitEditing={() => email.trim() && handleVerification()}
            />
          </View>

          <View className="mt-auto items-center justify-center w-full px-8 pb-4">
            <PrimaryButton
              onPress={handleVerification}
              disabled={!email.trim()}
            >
              Next
            </PrimaryButton>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
