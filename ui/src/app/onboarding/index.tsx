import PrimaryButton from "@/components/ui/button";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Image } from "expo-image";

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ backgroundColor: colors.panel, flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          paddingVertical: 32,
        }}
      >
        <Image
          source={require("../../../assets/images/onboarding.png")}
          style={{
            width: "100%",
            aspectRatio: 1,
            maxWidth: 400,
            marginHorizontal: "auto",
          }}
          contentFit="contain"
        />

        <View>
          <Text className="text-center text-3xl font-semibold text-fg dark:text-fg-dark">
            Welcome to Whisper
          </Text>

          <Text className="text-center mt-3 mb-10 text-fg-muted dark:text-fg-muted-dark">
            Read our Privacy Policy. Tap "Agree & continue"{"\n"}to accept our
            Terms of Service
          </Text>

          <View className="items-center justify-center px-8 w-full">
            <PrimaryButton onPress={() => router.push("/onboarding/login")}>
              Agree & continue
            </PrimaryButton>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
