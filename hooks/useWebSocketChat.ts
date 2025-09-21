"use client";
import "client-only";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LogEntry,
  LogKind,
  OutgoingMessage,
  ServerMessage,
  GroupedMessages,
} from "@/types/chat";

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

export function useWebSocketChat({ roomFromPath }: { roomFromPath: string }) {
  // БАЗОВЫЙ url до каталога rooms (без окончания /)
  const [url, setUrl] = useState("wss://bytehouse.ru/ws/rooms");
  const [room, setRoom] = useState(roomFromPath);
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

  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const mySessionIdRef = useRef<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const dialTimerRef = useRef<number | null>(null);
  const readTimerRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // имя по умолчанию
    if (!name) setName(randomName());
  }, []);

  useEffect(() => {
    // если меняется id в пути — синхронизируем стейт комнаты
    setRoom(roomFromPath);
  }, [roomFromPath]);

  // автоскролл: либо по логам, либо по чату
  useEffect(() => {
    if (!autoscroll) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoscroll]);

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

    // Строим URL: `${base}/rooms/${room}`
    const base = url.replace(/\/$/, "");
    const endpoint = `${base}/${encodeURIComponent(room)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
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

      // Ничего не шлём (никаких join). Просто ждём сообщения.
      append(
        "system",
        `Connected to room \"${room}\" at ${endpoint}. Type messages and press Enter.`
      );

      resetReadDeadlineTimer();
    });
    ws.addEventListener("message", (ev) => {
      resetReadDeadlineTimer();
      try {
        const raw = typeof ev.data === "string" ? ev.data : undefined;
        if (!raw) return;
        const parsed = JSON.parse(raw);

        // Сервер может прислать одно сообщение или массив
        const incoming: ServerMessage[] = Array.isArray(parsed)
          ? parsed
          : [parsed];

        setMessages((prev) => {
          const next = [...prev, ...incoming];

          // Заодно попробуем зафиксировать мой session_id
          if (!mySessionIdRef.current) {
            for (let i = incoming.length - 1; i >= 0; i--) {
              const m = incoming[i];
              if (
                m?.user?.name &&
                m?.user?.session_id &&
                m.user.name === name
              ) {
                mySessionIdRef.current = m.user.session_id;
                setMySessionId(m.user.session_id);
                break;
              }
            }
          }

          return next;
        });

        append("incoming", incoming);
      } catch {
        append("incoming", ev.data);
      }
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
      // НЕ добавляем локально в messages — ждём echo от сервера
      append("outgoing", msg);
    } catch (e) {
      append("error", `send error: ${(e as Error).message}`);
      disconnect("send failed");
    }
  }

  // Группировка подряд идущих сообщений по session_id
  const groups: GroupedMessages[] = useMemo(() => {
    const out: GroupedMessages[] = [];
    for (const m of messages) {
      const mine = mySessionId
        ? m.user.session_id === mySessionId
        : m.user.name === name; // fallback пока не узнали свой session_id

      const last = out[out.length - 1];
      if (last && last.session_id === m.user.session_id && last.mine === mine) {
        last.items.push({
          id: m.message_id,
          text: m.text,
          send_time: m.send_time,
        });
      } else {
        out.push({
          key: `${m.user.session_id}-${m.message_id}`,
          session_id: m.user.session_id,
          name: m.user.name,
          mine,
          items: [{ id: m.message_id, text: m.text, send_time: m.send_time }],
        });
      }
    }
    return out;
  }, [messages, mySessionId, name]);

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
    // room берём из маршрута, но экспортируем readonly для UI
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
    chatEndRef,
    messages,
    groups,
    mySessionId,
    // actions
    connect,
    disconnect,
    sendMessage,
  } as const;
}
