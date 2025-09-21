import React, { useEffect, useMemo, useRef, useState } from "react";

interface JoinRoomInput {
  name: string;
  room_name: string;
  session_id: string;
}
interface OutgoingMessage {
  text: string;
}
type LogKind = "incoming" | "outgoing" | "system" | "error" | "timeout";
interface LogEntry {
  id: string;
  kind: LogKind;
  time: string;
  content: unknown;
}

function randomName(): string {
  const id = (
    crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  )
    .toString()
    .replace(/-/g, "")
    .slice(0, 8);
  return `user-${id}`;
}
const now = () => new Date().toLocaleTimeString();
const cx = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");

export default function App() {
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
  }>({
    text: "disconnected",
    tone: "muted",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoscroll, setAutoscroll] = useState(true);
  const [text, setText] = useState("");

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
          } catch {
            console.log();
          }
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
        } catch {
          console.log();
        }
        return;
      }

      resetReadDeadlineTimer();
    });

    ws.addEventListener("message", (ev) => {
      resetReadDeadlineTimer();
      let payload: unknown = ev.data;
      try {
        if (typeof ev.data === "string") payload = JSON.parse(ev.data);
      } catch {
        console.log();
      }
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
    } catch {
      console.log();
    }
  }

  async function sendMessage() {
    const value = text.trim();
    if (!value) return;
    const msg: OutgoingMessage = { text: value };
    try {
      await safeSendJSON(msg);
      append("outgoing", msg);
      setText("");
    } catch (e) {
      append("error", `send error: ${(e as Error).message}`);
      disconnect("send failed");
    }
  }

  function copyLog() {
    const serialized = logs
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
      () => append("system", "лог скопирован в буфер обмена"),
      () => append("error", "не удалось скопировать лог")
    );
  }

  const statusDotClass = useMemo(
    () =>
      ({
        ok: "bg-emerald-400",
        err: "bg-rose-500",
        warn: "bg-amber-400",
        muted: "bg-slate-500",
      }[status.tone]),
    [status.tone]
  );

  return (
    <div className="min-h-screen text-slate-100 bg-[#0f1221] [background:radial-gradient(1000px_600px_at_10%_-20%,rgba(124,156,255,.15),transparent_60%),radial-gradient(900px_500px_at_110%_20%,rgba(104,224,207,.12),transparent_60%),#0f1221]">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-3">
          <form
            className="grid gap-3 md:grid-cols-7 grid-cols-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
          >
            <label className="text-xs text-slate-400 grid gap-1 col-span-2 md:col-span-2">
              WebSocket URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                type="url"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <label className="text-xs text-slate-400 grid gap-1">
              Room
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                required
                type="text"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <label className="text-xs text-slate-400 grid gap-1">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="user-xxxxxx"
                type="text"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <label className="text-xs text-slate-400 grid gap-1 hidden md:block">
              Dial timeout, s
              <input
                value={dialSec}
                onChange={(e) => setDialSec(Number(e.target.value) || 0)}
                min={0}
                type="number"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <label className="text-xs text-slate-400 grid gap-1 hidden md:block">
              Write timeout, s
              <input
                value={writeSec}
                onChange={(e) => setWriteSec(Number(e.target.value) || 0)}
                min={0}
                type="number"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <label className="text-xs text-slate-400 grid gap-1 hidden md:block">
              Read timeout, s
              <input
                value={readSec}
                onChange={(e) => setReadSec(Number(e.target.value) || 0)}
                min={0}
                type="number"
                className="w-full rounded-lg border border-white/10 bg-[#0d1021] px-3 py-2 outline-none focus:ring-4 focus:ring-indigo-400/30"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={connect}
                className="px-3 py-2 rounded-xl border border-indigo-400/60 bg-white/10 hover:brightness-110 active:translate-y-px"
              >
                Подключиться
              </button>
              <button
                type="button"
                onClick={() => disconnect()}
                disabled={!connected}
                className="px-3 py-2 rounded-xl border border-rose-400/60 bg-white/10 hover:brightness-110 active:translate-y-px disabled:opacity-50"
              >
                Отключиться
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 flex-wrap">
            <div className="inline-flex items-center gap-2 text-sm text-slate-400 bg-[#0d1021] border border-white/10 rounded-full px-2 py-1">
              <span className={cx("w-2 h-2 rounded-full", statusDotClass)} />
              <span>{status.text}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={copyLog}
                className="px-3 py-2 rounded-xl border border-white/15 bg-transparent hover:bg-white/5"
              >
                Копировать лог
              </button>
              <button
                onClick={() => setLogs([])}
                className="px-3 py-2 rounded-xl border border-white/15 bg-transparent hover:bg-white/5"
              >
                Очистить
              </button>
              <label className="inline-flex items-center gap-2 text-sm text-slate-400 border border-white/10 rounded-full px-2 py-1">
                <input
                  type="checkbox"
                  checked={autoscroll}
                  onChange={(e) => setAutoscroll(e.target.checked)}
                />{" "}
                автоскролл
              </label>
            </div>
          </div>

          <div className="p-3 max-h-[70vh] overflow-auto" aria-live="polite">
            {logs.map((l) => (
              <div
                key={l.id}
                className={cx(
                  "rounded-xl p-3 border shadow-inner bg-[#0d1021] mb-2",
                  l.kind === "incoming" && "border-indigo-400/40",
                  l.kind === "outgoing" && "border-teal-300/40",
                  l.kind === "system" && "border-white/20",
                  l.kind === "error" && "border-rose-500/60",
                  l.kind === "timeout" && "border-amber-400/60"
                )}
              >
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-1">
                  <span className="px-2 py-0.5 rounded-full border border-white/20">
                    {l.kind.toUpperCase()}
                  </span>
                  <span>{l.time}</span>
                </div>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {typeof l.content === "string"
                    ? l.content
                    : (() => {
                        try {
                          return JSON.stringify(l.content, null, 2);
                        } catch {
                          return String(l.content);
                        }
                      })()}
                </pre>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sticky bottom-0">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <div className="flex items-stretch gap-2 bg-[#0d1021] border border-white/10 rounded-xl p-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Введите сообщение и нажмите Enter"
                disabled={!connected}
                className="flex-1 bg-transparent outline-none px-3 py-2 text-slate-100"
                type="text"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!connected}
              className="px-4 py-2 rounded-xl border border-white/15 bg-white/10 hover:brightness-110 active:translate-y-px disabled:opacity-50"
            >
              Отправить
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Отправляется как JSON:{" "}
            <code>
              {"{"}`"text"`{": "}"..."{"}"}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
