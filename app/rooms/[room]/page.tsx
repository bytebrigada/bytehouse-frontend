"use client";
import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useWebSocketChat } from "@/hooks/useWebSocketChat";
import Header from "@/app/components/Header/Header";
import Chat from "@/app/components/Chat/Chat";
import MessageComposer from "@/app/components/MessageComposer/MessageComposer";
import NameModal from "@/app/components/NameModal/NameModal";

export default function RoomPage() {
  const params = useParams<{ room: string }>();
  const roomId = useMemo(() => {
    if (!params || !("room" in params)) return "";
    const v = Array.isArray(params.room) ? params.room[0] : params.room;
    return v ?? "";
  }, [params]);

  const chat = useWebSocketChat({ roomId });

  useEffect(() => {
    if (chat.identity && !chat.connected && roomId) {
      console.log("useEffect!");
      chat.connect();
    }
  }, [chat.identity, chat.connected, chat.roomId, chat.connect]);

  return (
    <div className="container">
      <Header
        roomId={chat.roomId}
        name={chat.identity?.name ?? null}
        connected={chat.connected}
        statusText={chat.status.text}
        statusTone={chat.status.tone}
        onReconnect={chat.connect}
        onDisconnect={chat.disconnect}
        onExit={chat.exit}
      />
      <Chat
        groups={chat.groups}
        autoscroll={chat.autoscroll}
        setAutoscroll={chat.setAutoscroll}
        chatEndRef={chat.chatEndRef}
      />
      <MessageComposer
        disabled={!chat.connected}
        onSend={(t) => chat.sendMessage(t)}
      />
      <NameModal
        open={chat.needName}
        initialName=""
        onSubmit={(name) => chat.saveIdentity(name)}
      />
    </div>
  );
}
