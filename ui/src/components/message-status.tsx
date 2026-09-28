import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { MessageStatus } from "@/db/init";
import { useTheme } from "@/lib/theme";

const SIZE = 12;

const LABELS: Record<MessageStatus, string> = {
  pending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  seen: "Seen",
};

function Check({ color, offset }: { color: string; offset?: boolean }) {
  return (
    <SymbolView
      name={{ ios: "checkmark", android: "check", web: "check" }}
      size={SIZE}
      tintColor={color}
      style={offset ? { marginLeft: -SIZE / 2 } : undefined}
    />
  );
}

export default function MessageStatusIcon({
  status,
}: {
  status: MessageStatus;
}) {
  const { colors } = useTheme();

  return (
    <View
      className="ml-1 flex-row items-center"
      accessible
      accessibilityLabel={LABELS[status]}
    >
      {status === "pending" ? (
        <SymbolView
          name={{ ios: "clock", android: "schedule", web: "schedule" }}
          size={SIZE - 1}
          tintColor={colors.muted}
        />
      ) : status === "sent" ? (
        <Check color={colors.muted} />
      ) : (
        <>
          <Check color={status === "seen" ? colors.check : colors.muted} />
          <Check color={status === "seen" ? colors.check : colors.muted} offset />
        </>
      )}
    </View>
  );
}
