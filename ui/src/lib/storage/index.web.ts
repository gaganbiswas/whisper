import lf from "localforage";
import { StorageAdapter } from "./types";

const localforage = lf.createInstance({
  name: "Whisper",
  storeName: "whisper_store",
  description: "Whisper local storage for web",
});

const storage: StorageAdapter = {
  async getItem(key: string) {
    return await localforage.getItem(key);
  },

  async setItem(key: string, value: string) {
    await localforage.setItem(key, value);
  },

  async deleteItem(key: string) {
    await localforage.removeItem(key);
  },
};

export default storage;
