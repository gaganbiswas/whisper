import { Pressable, Text } from "react-native";

export default function PrimaryButton({
  children,
  onPress,
  disabled,
}: {
  children: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      className="bg-emerald-600 items-center justify-center h-12 rounded-2xl w-full disabled:opacity-30"
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="text-white font-semibold text-lg">{children}</Text>
    </Pressable>
  );
}
