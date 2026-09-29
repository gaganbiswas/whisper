import { Platform } from "react-native";
import { Alert as AlertN } from "react-native";

export default function Alert(title: string = "", message: string = "") {
  if (Platform.OS === "web") window.alert(title + "\n" + message);
  else return AlertN.alert(title, message);
}
