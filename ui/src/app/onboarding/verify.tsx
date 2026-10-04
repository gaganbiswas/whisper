import { ScrollView, Text, View } from "react-native";
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { toByteArray } from "base64-js";
import OtpInput, { type OtpInputHandle } from "@/components/ui/otp-input";
import Loader from "@/components/loader";
import ax from "@/lib/axios";
import { generateSecurityPairs } from "@/lib/signal-protocol/security";
import { generateAndUploadPrekeys } from "@/lib/signal-protocol/prekeys";
import { useAuth } from "@/context/auth-context";
import { getDeviceId, STORAGE_KEYS } from "@/lib/utils";
import { saveMyUserId } from "@/lib/auth";
import { clearLocalChatData } from "@/db/init";
import { clearSessions } from "@/lib/signal-protocol/session-store";
import storage from "@/lib/storage";
import Alert from "@/components/alert";

export default function VerifyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);

  const { privateKeyBase64, publicKeyBase64 } = useMemo(
    generateSecurityPairs,
    [],
  );

  const handleVerification = async (otp: string) => {
    if (loading) return;
    try {
      setLoading(true);
      const deviceId = await getDeviceId();
      const { data } = await ax.post("/verify-otp", {
        otp,
        publicKey: publicKeyBase64,
        email,
        deviceId,
      });
      await storage.setItem(STORAGE_KEYS.token, data.token);
      await saveMyUserId(data.userId);

      // A fresh login registers a new identity
      await Promise.all([clearLocalChatData(), clearSessions()]);
      await generateAndUploadPrekeys(toByteArray(privateKeyBase64));
      await storage.setItem(STORAGE_KEYS.identityKey, privateKeyBase64);
      signIn();
      router.replace("/(private)");
    } catch (error: any) {
      otpRef.current?.clear();
      otpRef.current?.focus();
      Alert(
        "Error!",
        error?.response?.data?.message || error?.message || "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Loader visible={loading}>Validating code...</Loader>
      <SafeAreaView
        edges={["bottom", "left", "right"]}
        style={{ backgroundColor: colors.panel, flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior="padding"
          automaticOffset
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, alignItems: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-2xl font-semibold text-center text-fg dark:text-fg-dark">
              Verify your email
            </Text>
            <Text className="text-center mt-2 text-fg-muted dark:text-fg-muted-dark">
              Enter the 6-digit code we sent to{"\n"}
              {email}
            </Text>

            <View className="p-8 items-center justify-center w-full">
              <OtpInput
                ref={otpRef}
                autoFocus
                length={6}
                disabled={loading}
                onComplete={handleVerification}
              />
            </View>

            <Text className="text-emerald-600 text-lg dark:text-emerald-400">
              Didn't receive code?
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
