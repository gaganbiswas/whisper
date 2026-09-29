import * as SecureStore from "expo-secure-store";
import { StorageAdapter } from "./types";

const storage: StorageAdapter = {
  async getItem(key: string) {
    return await SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

export default storage;
