"use client";
import "client-only";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Identity,
  LogEntry,
  LogKind,
  ServerMessage,
  GroupedMessages,
} from "@/types/chat";

const STORAGE_NAME_KEY = "wschat_name";
const STORAGE_SID_KEY = "wschat_sid";

const now = () => new Date().toLocaleTimeString();
const newSid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// Вспомогательная функция: безопасное объединение входящих сообщений без дублей
function mergeMessages(
  prev: ServerMessage[],
  incoming: ServerMessage[],
  mySid?: string
): ServerMessage[] {
  if (!incoming.length) return prev;
  const byId = new Map(prev.map((m) => [m.message_id, m]));

  const result = [...prev];

  for (const inc of incoming) {
    // 1) Если пришло сообщение с таким же message_id — заменяем (на случай апдейтов)
    const existing = byId.get(inc.message_id);
    if (existing) {
      const idx = result.findIndex((m) => m.message_id === inc.message_id);
      if (idx !== -1) result[idx] = { ...existing, ...inc };
      continue;
    }

    // 2) Если это echo моего локального сообщения (по эвристике: мой sid + тот же текст + близкое время)
    if (mySid && inc.user?.session_id === mySid) {
      const echoIdx = result.findIndex((m) => {
        if (m.user?.session_id !== mySid) return false;
        if (!m.__local) return false;
        if (m.text !== inc.text) return false;
        // в окне 5 секунд
        const dt = Math.abs(
          new Date(inc.send_time).getTime() - new Date(m.send_time).getTime()
        );
        return dt <= 5000;
      });
      if (echoIdx !== -1) {
        // заменяем локальное сообщение серверным
        result[echoIdx] = { ...inc, __local: false } as ServerMessage & {
          __local?: boolean;
        };
        byId.set(inc.message_id, result[echoIdx]);
        continue;
      }
    }

    // 3) Обычная вставка нового сообщения в конец
    result.push(inc);
    byId.set(inc.message_id, inc);
  }

  return result;
}

export function useWebSocketChat({ roomId }: { roomId: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    tone: "ok" | "err" | "warn" | "muted";
  }>({ text: "disconnected", tone: "muted" });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoscroll, setAutoscroll] = useState(true);
  const [messages, setMessages] = useState<ServerMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const dialTimerRef = useRef<number | null>(null);
  const readTimerRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const dialSec = 30,
    writeSec = 5,
    readSec = 0;

  // 1) Инициализация identity из LS
  useEffect(() => {
    try {
      const name = localStorage.getItem(STORAGE_NAME_KEY) || "";
      const sid = localStorage.getItem(STORAGE_SID_KEY) || "";
      if (name && sid) setIdentity({ name, session_id: sid });
    } catch {}
  }, []);

  const needName = !identity;

  const saveIdentity = useCallback((name: string) => {
    const sid = newSid();
    const ident: Identity = { name, session_id: sid };
    setIdentity(ident);
    try {
      localStorage.setItem(STORAGE_NAME_KEY, name);
      localStorage.setItem(STORAGE_SID_KEY, sid);
    } catch {}
    return ident;
  }, []);

  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_NAME_KEY);
      localStorage.removeItem(STORAGE_SID_KEY);
    } catch {}
    setIdentity(null);
  }, []);

  // автоскролл
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
      append("timeout", "read deadline exceeded — продолжаем слушать");
      resetReadDeadlineTimer();
    }, ms);
  };

  async function safeSendJSON(payload: unknown): Promise<void> {
    const ws = wsRef.current;
    if (!ws) throw new Error("нет активного соединения");
    const writeMs = Math.max(0, Math.floor(writeSec * 1000));
    const trySend = () => ws.send(JSON.stringify(payload));
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

  async function fetchHistory(roomUuid: string) {
    try {
      setStatus({ text: "loading history…", tone: "warn" });
      const res = await fetch(
        `https://bytehouse.ru/api/rooms/${encodeURIComponent(
          roomUuid
        )}/messages`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const arr: ServerMessage[] = Array.isArray(data?.messages)
        ? data.messages
        : [];
      setMessages(arr);
      append("system", `history loaded: ${arr.length} messages`);
    } catch (e) {
      append("error", `history error: ${(e as Error).message}`);
    }
  }

  function connect() {
    if (!identity) {
      setStatus({ text: "enter name to connect", tone: "warn" });
      return;
    }
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    )
      return;

    setStatus({ text: "connecting…", tone: "warn" });
    const endpoint = "wss://bytehouse.ru/ws/rooms/join";

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
      setStatus({ text: "joining…", tone: "warn" });

      const join = {
        session_id: identity.session_id,
        name: identity.name,
        room_id: roomId,
      };

      try {
        await safeSendJSON(join);
        append("system", `joined as ${join.name} to room ${join.room_id}`);
      } catch (e) {
        append("error", `join send error: ${(e as Error).message}`);
        try {
          ws.close(1011, "join failed");
        } catch {}
        return;
      }

      await fetchHistory(roomId);
      setStatus({ text: "connected", tone: "ok" });
      resetReadDeadlineTimer();
    });

    ws.addEventListener("message", (ev) => {
      resetReadDeadlineTimer();
      try {
        const raw = typeof ev.data === "string" ? ev.data : undefined;
        if (!raw) return;
        const parsed = JSON.parse(raw);

        let incoming: ServerMessage[] = [];
        if (Array.isArray(parsed)) {
          incoming = parsed as ServerMessage[];
        } else if (parsed && Array.isArray(parsed.messages)) {
          incoming = parsed.messages as ServerMessage[];
        } else if (parsed && parsed.message) {
          incoming = [parsed.message as ServerMessage];
        } else if (parsed && parsed.message_id) {
          incoming = [parsed as ServerMessage];
        }
        if (!incoming.length) return;

        setMessages((prev) =>
          mergeMessages(prev, incoming, identity?.session_id)
        );
        append("incoming", incoming);
      } catch {
        append("incoming", ev.data);
      }
    });

    ws.addEventListener("error", () => {
      setStatus({ text: "error", tone: "err" });
      append("error", "socket error");
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

  function exit() {
    disconnect("exit");
    clearIdentity();
    setMessages([]);
    setLogs([]);
  }

  async function sendMessage(value: string) {
    const v = value.trim();
    if (!v) return;
    if (!identity) {
      append("error", "нет identity — введите имя и переподключитесь");
      return;
    }

    // Оптимистично добавляем сообщение в чат сразу
    const tempId = `local-${
      crypto.randomUUID?.() ?? Math.random().toString(36)
    }`;
    const optimistic: ServerMessage & { __local?: boolean } = {
      message_id: tempId,
      text: v,
      send_time: new Date().toISOString(),
      user: { session_id: identity.session_id, name: identity.name },
      __local: true,
    } as never;

    setMessages((prev) => [...prev, optimistic]);

    try {
      // Передаём текст. Если бэкенд поддерживает client_message_id — пошлём, чтобы потом сматчить echo
      await safeSendJSON({ text: v });
      append("outgoing", { text: v });
    } catch (e) {
      append("error", `send error: ${(e as Error).message}`);
      // Помечаем локальное сообщение как неотправленное
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === tempId ? { ...m, __failed: true } : m
        )
      );
      disconnect("send failed");
    }
  }

  // группировка подряд по session_id
  const groups: GroupedMessages[] = useMemo(() => {
    const out: GroupedMessages[] = [];
    for (const m of messages) {
      const mine = !!identity && m.user.session_id === identity.session_id;
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
  }, [messages, identity]);

  return {
    identity,
    needName,
    saveIdentity,
    clearIdentity,

    roomId,
    connected,
    status,
    logs,
    setLogs,
    append,
    autoscroll,
    setAutoscroll,
    logEndRef,
    chatEndRef,

    messages,
    groups,

    connect,
    disconnect,
    exit,
    sendMessage,
  } as const;
}
