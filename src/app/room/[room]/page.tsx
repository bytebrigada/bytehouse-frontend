"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ENV_WS_BASE =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_BASE_URL
    : undefined;

function getWsBase(): string {
  if (ENV_WS_BASE && ENV_WS_BASE.trim()) return ENV_WS_BASE.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws`;
  }
  return "wss://bytehouse.ru/ws"; // безопасный дефолт для SSR, заменится в браузере
}

type ChatMsg = {
  id: string;
  name: string;
  text: string;
  ts: number;
};

function useQuery() {
  return useMemo(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      ),
    []
  );
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function RoomPage({ params }: { params: { room: string } }) {
  const qs = useQuery();
  const yourName = (qs.get("name") || "Гость").trim() || "Гость";
  const room = decodeURIComponent(params.room);

  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [typing, setTyping] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(uuid());
  const helloSentRef = useRef(false); // защищает от повторного hello при dev-двойном эффекте
  const closingRef = useRef(false); // чтобы понимать, закрыли мы сами или оборвалось
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // voice mock
  const [micOn, setMicOn] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  function now() {
    const d = new Date();
    return d.toLocaleTimeString();
  }
  function addLog(s: any) {
    const line = `[${now()}] ${String(s)}`;
    console.log(line);
    setLog((prev) => [line, ...prev].slice(0, 400));
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function scheduleReconnect() {
    // не риконнектимся, если мы сами закрываем (unmount / смена комнаты/имени)
    if (closingRef.current) return;
    const attempt = reconnectAttemptsRef.current++;
    const delay = Math.min(1000 * 2 ** attempt, 15000); // эксп. бэкофф до 15с
    addLog(
      `WS: планирую переподключение через ${delay} мс (попытка ${attempt + 1})`
    );
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }

  function connect() {
    const WS_BASE = getWsBase();
    const url = new URL(`${WS_BASE}/rooms/join`);

    // Если предыдущий сокет ещё жив — аккуратно закрываем
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        addLog("WS: закрываю предыдущее соединение перед новым connect()");
        wsRef.current.close(1000, "reconnect");
      }
    } catch {}

    addLog(`WS: создаю соединение -> ${url.toString()}`);
    const ws = new WebSocket(url.toString());
    wsRef.current = ws;
    closingRef.current = false;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      clearReconnectTimer();

      // Отправляем hello ОДИН раз на жизненный цикл вкладки/сессии,
      // даже если StrictMode дёрнет эффект дважды.
      if (!helloSentRef.current) {
        const hello = {
          name: yourName,
          room_name: room,
          session_id: sessionIdRef.current,
        };
        ws.send(JSON.stringify(hello));
        helloSentRef.current = true;
        addLog("WS: open -> hello sent");
      } else {
        addLog("WS: open (hello уже отправлялся ранее, пропускаю)");
      }
    };

    ws.onmessage = (ev) => {
      // Лёгкая телеметрия входящих сообщений
      addLog(`WS: message ${ev.data?.toString()?.slice(0, 100) ?? ""}`);

      try {
        const data = JSON.parse(ev.data);

        const payload =
          data?.type === "message" && data?.data ? data.data : data;

        if (payload && typeof payload?.text === "string") {
          const name =
            typeof payload?.name === "string" && payload.name.trim()
              ? payload.name
              : "Аноним";
          const ts = typeof payload?.ts === "number" ? payload.ts : Date.now();

          const msg: ChatMsg = {
            id: `${ts}-${Math.random().toString(16).slice(2)}`,
            name,
            text: payload.text,
            ts,
          };
          setMessages((prev) => [...prev, msg]);
          setMembers((prev) =>
            prev.includes(name) ? prev : [...prev, name].slice(-100)
          );
        } else if (data?.type === "typing" && typeof data?.name === "string") {
          setTyping((prev) => {
            const next = new Set(prev);
            next.add(data.name);
            return next;
          });
          setTimeout(() => {
            setTyping((prev) => {
              const next = new Set(prev);
              next.delete(data.name);
              return next;
            });
          }, 1500);
        }
      } catch (e) {
        addLog(`WS: parse error ${String(e)}`);
      }
    };

    ws.onerror = (e) => {
      // Браузер часто не даёт деталей, но отметим сам факт
      addLog("WS: onerror (детали недоступны — смотри Network→WS в DevTools)");
    };

    ws.onclose = (ev) => {
      setConnected(false);
      wsRef.current = null;
      addLog(
        `WS: closed code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`
      );

      if (!closingRef.current) {
        // неожиданный разрыв — пробуем переподключиться
        scheduleReconnect();
      }
    };
  }

  // Основной эффект соединения
  useEffect(() => {
    addLog(
      `mount/useEffect: room="${room}" name="${yourName}" sid=${sessionIdRef.current}`
    );
    helloSentRef.current = false; // новый "жизненный цикл" hello для этой комнаты/имени
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    connect();

    return () => {
      addLog("unmount/cleanup: закрываю WS");
      closingRef.current = true;
      clearReconnectTimer();
      try {
        wsRef.current?.close(1000, "component unmount");
      } catch {}
      wsRef.current = null;
    };
    // меняем соединение при смене комнаты или имени
  }, [room, yourName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendText() {
    const t = input.trim();
    if (!t) return;
    const ws = wsRef.current;
    if (!ws) {
      addLog("sendText: нет соединения");
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      addLog(`sendText: сокет не открыт (readyState=${ws.readyState})`);
      return;
    }
    const payload = { text: t };
    ws.send(JSON.stringify(payload));
    addLog(`sendText: "${t}"`);
    setInput("");
  }

  function notifyTyping() {
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "typing", name: yourName }));
        addLog("notifyTyping sent");
      }
    } catch {}
  }

  // ---- Voice mock: локальный микрофон + VU meter, без сетевого стрима ----
  async function toggleMic() {
    if (micOn) {
      setMicOn(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLevel(0);
      addLog("Mic: off");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(rms);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      setMicOn(true);
      addLog("Mic: on");
    } catch {
      alert("Нужен доступ к микрофону");
      addLog("Mic: permission denied");
    }
  }

  const youTyping = input.length > 0;
  useEffect(() => {
    if (!youTyping) return;
    const t = setTimeout(notifyTyping, 120);
    return () => clearTimeout(t);
  }, [input]);

  return (
    <div className="discord">
      {/* left sidebar */}
      <aside className="sidebar left">
        <div className="guild">Байт Хаус</div>
        <div className="section">Текстовые каналы</div>
        <a className="channel active"># {room}</a>
        <div className="section mt-16">Голосовые каналы</div>
        <div className="voiceRow">
          <div className={`micDot ${micOn ? "on" : ""}`} />
          <span>Голос • Общий</span>
        </div>
        <button className="btn w100 mt-8" onClick={toggleMic}>
          {micOn ? "Выключить микрофон" : "Включить микрофон"}
        </button>
        <div className="vu mt-8">
          <div
            className="vuBar"
            style={{ width: `${Math.min(100, Math.round(level * 200))}%` }}
          />
        </div>
        <a className="link mt-16" href="/">
          ← Выйти в лобби
        </a>
      </aside>

      {/* main chat */}
      <main className="chat">
        <header className="chatHeader">
          <span className="hash">#</span> {room}
          <span className="presence">{connected ? "в сети" : "офлайн"}</span>
        </header>

        <div className="messages">
          {messages.map((m) => (
            <div className="msg" key={m.id}>
              <div className="avatar">{m.name.slice(0, 1).toUpperCase()}</div>
              <div className="bubble">
                <div className="meta">
                  <span className="author">{m.name}</span>
                  <span className="time">
                    {new Date(m.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text">{m.text}</div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="composer">
          <input
            className="input grow"
            placeholder="Написать сообщение"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
          />
          <button
            className="btn"
            disabled={!connected || !input.trim()}
            onClick={sendText}
          >
            Отправить
          </button>
        </div>

        {typing.size > 0 && (
          <div className="typing">
            {Array.from(typing).slice(0, 3).join(", ")}
            {typing.size > 3 ? " и др." : ""} печатает…
          </div>
        )}
      </main>

      {/* right sidebar */}
      <aside className="sidebar right">
        <div className="section">Участники</div>
        <div className="members">
          {[yourName, ...members.filter((n) => n !== yourName)].map((n, i) => (
            <div className="member" key={`${n}-${i}`}>
              <div className="dot online" />
              <span>{n}</span>
            </div>
          ))}
        </div>

        <div className="section mt-16">Журнал</div>
        <div className="log">
          {log.map((l, i) => (
            <div key={i} className="logLine">
              {l}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
