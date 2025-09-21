"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL;

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
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // voice mock
  const [micOn, setMicOn] = useState(false);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  function addLog(s: any) {
    setLog((prev) => [String(s), ...prev].slice(0, 200));
  }

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/rooms/join`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const hello = {
        name: yourName,
        room_name: room,
        session_id: sessionIdRef.current,
      };
      ws.send(JSON.stringify(hello));
      addLog("WS open + hello sent");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // Поддерживаем два формата входящих сообщений:
        // 1) голые {text, name?, ts?}
        // 2) завернутые в объект { type: "message", data: {...} }
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
          // если сервер прислал "кто-то печатает"
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
      } catch {
        // игнор
      }
    };

    ws.onclose = () => {
      setConnected(false);
      addLog("WS closed");
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [room, yourName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendText() {
    const t = input.trim();
    if (!t || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;
    wsRef.current.send(JSON.stringify({ text: t }));
    setInput("");
  }

  function notifyTyping() {
    // необязательный "мок" события typing (на случай, если бек слушает)
    try {
      wsRef.current?.send(JSON.stringify({ type: "typing", name: yourName }));
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
        // расчёт RMS для VU
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(rms); // 0..~0.5
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      setMicOn(true);
    } catch {
      alert("Нужен доступ к микрофону");
    }
  }

  const youTyping = input.length > 0;
  useEffect(() => {
    if (!youTyping) return;
    const t = setTimeout(notifyTyping, 100);
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
