"use client";
import { useParams } from "next/navigation";
import { useWebSocketChat } from "@/hooks/useWebSocketChat";
import Header from "@/app/components/Header/Header";
import Chat from "@/app/components/Chat/Chat";
import MessageComposer from "@/app/components/MessageComposer/MessageComposer";

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const chat = useWebSocketChat({ roomFromPath: roomId });

  const copyLog = () => {
    const serialized = chat.logs
      .map((l) =>
        typeof l.content === "string"
          ? l.content
          : (() => {
              try {
                return JSON.stringify(l.content, null, 2);
              } catch {
                return String(l.content);
              }
            })()
      )
      .join("\n\n");
    navigator.clipboard.writeText(serialized).then(
      () => chat.append("system", "лог скопирован в буфер обмена"),
      () => chat.append("error", "не удалось скопировать лог")
    );
  };
  return (
    <div className="container">
      <Header
        url={chat.url}
        room={chat.room}
        name={chat.name}
        dialSec={chat.dialSec}
        writeSec={chat.writeSec}
        readSec={chat.readSec}
        setUrl={chat.setUrl}
        setName={chat.setName}
        setDialSec={chat.setDialSec}
        setWriteSec={chat.setWriteSec}
        setReadSec={chat.setReadSec}
        onConnect={chat.connect}
        onDisconnect={() => chat.disconnect()}
        connected={chat.connected}
        statusText={chat.status.text}
        statusTone={chat.status.tone}
        onCopyLog={copyLog}
        onClearLog={() => chat.setLogs([])}
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
    </div>
  );
}
