import { useWebSocketChat } from "./hooks/useWebSocketChat";
import Header from "./components/Header/Header";
import Log from "./components/Log/Log";
import MessageComposer from "./components/MessageComposer/MessageComposer";

export default function App() {
  const chat = useWebSocketChat();

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
        setRoom={chat.setRoom}
        setName={chat.setName}
        setDialSec={chat.setDialSec}
        setWriteSec={chat.setWriteSec}
        setReadSec={chat.setReadSec}
        onConnect={chat.connect}
        onDisconnect={() => chat.disconnect()}
        connected={chat.connected}
        statusText={chat.status.text}
        statusTone={chat.status.tone}
      />

      <Log
        logs={chat.logs}
        logEndRef={chat.logEndRef}
        onCopy={copyLog}
        onClear={() => chat.setLogs([])}
        autoscroll={chat.autoscroll}
        setAutoscroll={chat.setAutoscroll}
      />

      <MessageComposer
        disabled={!chat.connected}
        onSend={(t) => chat.sendMessage(t)}
      />
    </div>
  );
}
