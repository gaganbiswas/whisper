import { View } from "react-native";
import type { MessageStatus } from "@/db/init";
import { useTheme } from "@/lib/theme";
import Lucide from "@react-native-vector-icons/lucide";

const SIZE = 12;

const LABELS: Record<MessageStatus, string> = {
  pending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  seen: "Seen",
};

function Check({ color, offset }: { color: string; offset?: boolean }) {
  return (
    <Lucide
      name={"check"}
      size={SIZE}
      color={color}
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
        <Lucide name={"clock"} size={SIZE - 1} color={colors.muted} />
      ) : status === "sent" ? (
        <Check color={colors.muted} />
      ) : (
        <>
          <Check color={status === "seen" ? colors.check : colors.muted} />
          <Check
            color={status === "seen" ? colors.check : colors.muted}
            offset
          />
        </>
      )}
    </View>
  );
}
