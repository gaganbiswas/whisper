import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/lib/theme";

export interface OtpInputHandle {
  clear: () => void;
  focus: () => void;
}

interface OtpInputProps {
  length?: number;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  ref?: Ref<OtpInputHandle>;
}

// A single invisible TextInput sits on top of the boxes and owns the value.
// This makes typing, backspace, paste and SMS/iOS one-time-code autofill
// behave the same on Android and iOS, unlike one TextInput per digit.
export default function OtpInput({
  length = 6,
  onComplete,
  autoFocus = true,
  disabled = false,
  ref,
}: OtpInputProps) {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { colors } = useTheme();

  useImperativeHandle(ref, () => ({
    clear: () => setCode(""),
    focus: () => inputRef.current?.focus(),
  }));

  const handleChangeText = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, length);
    setCode(next);
    if (next.length === length && next !== code) onComplete?.(next);
  };

  const activeIndex = Math.min(code.length, length - 1);

  return (
    <View style={styles.container}>
      {Array.from({ length }, (_, index) => {
        const isActive = focused && index === activeIndex;
        return (
          <View
            key={index}
            style={[
              styles.box,
              { backgroundColor: colors.field, borderColor: colors.border },
              isActive ? { borderColor: colors.primary } : undefined,
            ]}
          >
            <Text style={[styles.digit, { color: colors.text }]}>
              {code[index] ?? ""}
            </Text>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        underlineColorAndroid="transparent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  digit: {
    fontSize: 22,
    fontWeight: "600",
  },
  // Covers the boxes so taps/long-press (paste) hit the real input. Kept at
  // full opacity with transparent text because iOS ignores touches on views
  // with alpha < 0.01.
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 1,
  },
});
