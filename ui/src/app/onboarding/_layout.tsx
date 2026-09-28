import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: "" }} />
      <Stack.Screen name="login" options={{ title: "" }} />
      <Stack.Screen name="verify" options={{ title: "" }} />
    </Stack>
  );
}
