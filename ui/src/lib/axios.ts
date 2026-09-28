import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { STORAGE_KEYS } from "./utils";

export const API_BASE_URL = "https://6kjj4dgg-8000.uks1.devtunnels.ms/api";
const ax = axios.create({ baseURL: API_BASE_URL });

ax.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default ax;
