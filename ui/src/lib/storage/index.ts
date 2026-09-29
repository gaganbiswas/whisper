import { Platform } from "react-native";
import type { StorageAdapter } from "./types";

const storage: StorageAdapter =
  Platform.OS === "web"
    ? require("./index.web").default
    : require("./index.native").default;

export default storage;
