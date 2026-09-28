import { ActivityIndicator, Text, View } from "react-native";
import { Portal } from "./ui/portal";
import { useTheme } from "@/lib/theme";

const Loader = ({
  children,
  visible,
}: {
  children?: string;
  visible?: boolean;
}) => {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <Portal name="loader">
      <View className="h-full items-center justify-center gap-4 absolute z-[9999] bg-panel left-0 right-0 dark:bg-panel-dark">
        <ActivityIndicator size={"small"} color={colors.muted} />
        {children ? <Text className="text-fg-muted dark:text-fg-muted-dark">{children}</Text> : null}
      </View>
    </Portal>
  );
};

export default Loader;
