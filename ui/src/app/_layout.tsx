import "react-native-get-random-values";
import "../global.css";
import { SplashScreen, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as SecureStore from "expo-secure-store";
import { PortalProvider } from "@/components/ui/portal";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { STORAGE_KEYS } from "@/lib/utils";
import { useNavigationTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const navigationTheme = useNavigationTheme();

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="auto" />
      <KeyboardProvider>
        <PortalProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </PortalProvider>
      </KeyboardProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isLoggedIn, signIn } = useAuth();

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEYS.identityKey)
      .then((identityKey) => {
        if (identityKey) signIn();
      })
      .finally(() => SplashScreen.hideAsync());
  }, [signIn]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(private)" />
      </Stack.Protected>
    </Stack>
  );
}
