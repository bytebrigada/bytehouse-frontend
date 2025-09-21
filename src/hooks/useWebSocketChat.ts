import { useEffect, useMemo, useRef, useState } from "react";
import type {
  JoinRoomInput,
  LogEntry,
  LogKind,
  OutgoingMessage,
} from "../types";

const now = () => new Date().toLocaleTimeString();
const randomName = () => {
  const id = (
    crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  )
    .toString()
    .replace(/-/g, "")
    .slice(0, 8);
  return `user-${id}`;
};

export function useWebSocketChat() {
  const [url, setUrl] = useState("wss://bytehouse.ru/ws/rooms/join");
  const [room, setRoom] = useState("general");
  const [name, setName] = useState("");
  const [dialSec, setDialSec] = useState(30);
  const [writeSec, setWriteSec] = useState(5);
  const [readSec, setReadSec] = useState(0);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    tone: "ok" | "err" | "warn" | "muted";
  }>({ text: "disconnected", tone: "muted" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoscroll, setAutoscroll] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const dialTimerRef = useRef<number | null>(null);
  const readTimerRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!name) setName(randomName()); /* once */
  }, []);

  useEffect(() => {
    if (!autoscroll || !logEndRef.current) return;
    logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoscroll]);

  const append = (kind: LogKind, content: unknown) => {
    setLogs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID?.() ?? Math.random().toString(36),
        kind,
        time: now(),
        content,
      },
    ]);
  };

  const clearTimers = () => {
    if (dialTimerRef.current !== null) {
      clearTimeout(dialTimerRef.current);
      dialTimerRef.current = null;
    }
    if (readTimerRef.current !== null) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
  };

  const resetReadDeadlineTimer = () => {
    if (!wsRef.current) return;
    if (readTimerRef.current !== null) clearTimeout(readTimerRef.current);
    const ms = Math.max(0, Math.floor(readSec * 1000));
    if (ms === 0) return;
    readTimerRef.current = window.setTimeout(() => {
      append(
        "timeout",
        "read deadline exceeded (контекст истёк) — продолжим слушать"
      );
      resetReadDeadlineTimer();
    }, ms);
  };

  async function safeSendJSON(payload: unknown): Promise<void> {
    const ws = wsRef.current;
    if (!ws) throw new Error("нет активного соединения");
    const writeMs = Math.max(0, Math.floor(writeSec * 1000));
    const trySend = () => {
      ws.send(JSON.stringify(payload));
    };
    if (writeMs === 0) return void trySend();
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (!wsRef.current) return reject(new Error("соединение закрыто"));
        if (wsRef.current.readyState === WebSocket.OPEN) {
          try {
            trySend();
            resolve();
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
          return;
        }
        if (performance.now() - start >= writeMs)
          return reject(new Error("write timeout"));
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function connect() {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    )
      return;
    setStatus({ text: "connecting…", tone: "warn" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setStatus({ text: "dial error", tone: "err" });
      append("error", `dial error: ${(e as Error).message}`);
      return;
    }
    wsRef.current = ws;

    const dms = Math.max(0, Math.floor(dialSec * 1000));
    if (dms > 0) {
      dialTimerRef.current = window.setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          append("error", `dial timeout after ${dms / 1000}s`);
          try {
            ws.close(4000, "dial timeout");
          } catch {}
        }
      }, dms);
    }

    ws.addEventListener("open", async () => {
      if (dialTimerRef.current !== null) {
        clearTimeout(dialTimerRef.current);
        dialTimerRef.current = null;
      }
      setConnected(true);
      setStatus({ text: "connected", tone: "ok" });

      const join: JoinRoomInput = {
        name: name || randomName(),
        room_name: room || "general",
        session_id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      };

      try {
        await safeSendJSON(join);
        append(
          "system",
          `Joined as "${join.name}" to room "${join.room_name}". Type messages and press Enter.`
        );
      } catch (e) {
        append("error", `join send error: ${(e as Error).message}`);
        try {
          ws.close(1011, "join failed");
        } catch {}
        return;
      }

      resetReadDeadlineTimer();
    });

    ws.addEventListener("message", (ev) => {
      resetReadDeadlineTimer();
      let payload: unknown = ev.data;
      try {
        if (typeof ev.data === "string") payload = JSON.parse(ev.data);
      } catch {}
      append("incoming", payload);
    });

    ws.addEventListener("error", () => {
      setStatus({ text: "error", tone: "err" });
      append("error", "read error: произошла ошибка сокета");
    });

    ws.addEventListener("close", (ev) => {
      clearTimers();
      setConnected(false);
      setStatus({ text: `disconnected (${ev.code})`, tone: "muted" });
      append("system", `closed: code=${ev.code} reason=${ev.reason || "—"}`);
    });
  }

  function disconnect(reason = "client exit") {
    try {
      wsRef.current?.close(1000, reason);
    } catch {}
  }

  async function sendMessage(value: string) {
    const v = value.trim();
    if (!v) return;
    const msg: OutgoingMessage = { text: v };
    try {
      await safeSendJSON(msg);
      append("outgoing", msg);
    } catch (e) {
      append("error", `send error: ${(e as Error).message}`);
      disconnect("send failed");
    }
  }

  const statusDotClass = useMemo(
    () => ({ ok: "ok", err: "err", warn: "warn", muted: "muted" }[status.tone]),
    [status.tone]
  );

  return {
    // state
    url,
    room,
    name,
    dialSec,
    writeSec,
    readSec,
    setUrl,
    setRoom,
    setName,
    setDialSec,
    setWriteSec,
    setReadSec,
    connected,
    status,
    statusDotClass,
    logs,
    setLogs,
    append,
    autoscroll,
    setAutoscroll,
    logEndRef,
    // actions
    connect,
    disconnect,
    sendMessage,
  } as const;
}
