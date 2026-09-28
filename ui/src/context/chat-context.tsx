import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { API_BASE_URL } from "@/lib/axios";
import { getMyUserId } from "@/lib/auth";
import { useChatSocket } from "@/lib/chat";

const WS_URL =
  API_BASE_URL.replace(/^http/, "ws").replace(/\/api$/, "") + "/ws";

type ChatContextValue = {
  myUserId: number | null;
  isConnected: boolean;
  messageVersion: number;
  sendMessage: (toUserId: number, text: string) => Promise<void>;
  markSeen: (peerId: number) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: PropsWithChildren) {
  const [myUserId, setMyUserId] = useState<number | null>(null);

  useEffect(() => {
    getMyUserId()
      .then(setMyUserId)
      .catch((error) => {
        console.warn("Could not load chat user", error);
      });
  }, []);

  const socket = useChatSocket(myUserId ?? 0, WS_URL);

  return (
    <ChatContext.Provider value={{ myUserId, ...socket }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used inside ChatProvider");
  return context;
}
