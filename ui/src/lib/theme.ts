import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";

const light = {
  background: "#f0f2f5",
  panel: "#ffffff",
  field: "#f0f2f5",
  border: "#e9edef",
  text: "#111b21",
  muted: "#667781",
  placeholder: "#667781",
  primary: "#059669",
  check: "#53bdeb",
  avatar: "#d1fae5",
  avatarText: "#047857",
};

const dark: typeof light = {
  background: "#0a0a0a",
  panel: "#0a0a0a",
  field: "#2a3942",
  border: "#141414",
  text: "#e9edef",
  muted: "#8696a0",
  placeholder: "#8696a0",
  primary: "#10b981",
  check: "#34b7f1",
  avatar: "#064e3b",
  avatarText: "#a7f3d0",
};

export type ThemeColors = typeof light;

export function useTheme() {
  const isDark = useColorScheme() === "dark";
  return { isDark, colors: isDark ? dark : light };
}

export function useNavigationTheme(): Theme {
  const { isDark, colors } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.panel,
      text: colors.text,
      border: colors.border,
    },
  };
}
