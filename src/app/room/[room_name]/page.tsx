"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePingStore } from "@/store/ping";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;
const ICE_URLS = (
  process.env.NEXT_PUBLIC_ICE_URLS || "stun:stun.l.google.com:19302"
)
  .split(",")
  .map((s) => s.trim());

type MemberItem = { member_id: string; name: string };

type ServerMessage =
  | { type: "ping"; ts: number }
  | { type: "connect"; data: { session_id: string } }
  | { type: "state.members"; data: { items: MemberItem[] } }
  | { type: "join.member"; data: any }
  | { type: "leave.member"; data: any }
  | { type: "webrtc.answer"; data: { sdp: string } }
  | {
      type: "webrtc.ice";
      data: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
      };
    }
  | { type: "error"; data: any }
  | { type: "pong"; ts?: string };

function useQuery() {
  return useMemo(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      ),
    []
  );
}

export default function RoomPage({
  params,
}: {
  params: { room_name: string };
}) {
  const qs = useQuery();
  const yourName = qs.get("name") || "Гость";
  const room = decodeURIComponent(params.room_name);

  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const { lastRttMs, inFlight, sendPing, onPong } = usePingStore();

  function addLog(...args: any[]) {
    const s = args
      .map((x) =>
        typeof x === "string"
          ? x
          : (() => {
              try {
                return JSON.stringify(x);
              } catch {
                return String(x);
              }
            })()
      )
      .join(" ");
    setLog((prev) => [s, ...prev].slice(0, 200));
  }

  async function ensureLocalStream(): Promise<MediaStream | null> {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (e) {
      addLog("getUserMedia error", e);
      alert("Нужен доступ к микрофону");
      return null;
    }
  }

  function cleanup() {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    sessionIdRef.current = null;
    iceQueueRef.current = [];
    setStatus("closed");
  }

  async function ensureWebRTCAndOffer(currentWs: WebSocket) {
    if (pcRef.current) return;

    const local = await ensureLocalStream();
    if (!local) return;

    const pc = new RTCPeerConnection({
      iceServers: ICE_URLS.map((url) => ({ urls: url })),
    });
    pcRef.current = pc;

    pc.addEventListener("track", (ev) => {
      addLog("ontrack kind=", ev.track?.kind);
      if (ev.track?.kind === "audio") {
        const inbound = ev.streams?.[0] || new MediaStream([ev.track]);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = inbound;
        }
      }
    });

    for (const t of local.getAudioTracks()) {
      pc.addTrack(t, local);
    }

    pc.addEventListener("icecandidate", (ev) => {
      if (!ev.candidate) return;
      const c = ev.candidate;
      const payload = {
        type: "webrtc.ice",
        data: {
          candidate: c.candidate,
          sdpMid: c.sdpMid ?? null,
          sdpMLineIndex:
            typeof c.sdpMLineIndex === "number" ? c.sdpMLineIndex : null,
        },
      };
      if (currentWs.readyState === WebSocket.OPEN)
        currentWs.send(JSON.stringify(payload));
    });

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    const msg = {
      type: "webrtc.offer",
      request_id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      data: {
        room_name: room,
        sdp: offer.sdp,
        direction: "sendrecv",
        media: { audio: true, video: false },
      },
    };
    currentWs.send(JSON.stringify(msg));
    addLog("C→S webrtc.offer (sent)");
  }

  // no-op closePeer; SFU uses single pc

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?room_name=${encodeURIComponent(
        room
      )}&name=${encodeURIComponent(yourName)}`
    );
    wsRef.current = ws;
    setStatus("ws:connecting");

    ws.onopen = () => {
      setStatus("ws:open");
      addLog("WS open");
    };
    ws.onclose = () => {
      addLog("WS closed");
      cleanup();
    };

    ws.onmessage = async (ev) => {
      let msg: ServerMessage | null = null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg) return;

      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong", ts: (msg as any).ts }));
          break;
        case "connect":
          sessionIdRef.current = msg.data.session_id;
          setStatus(`connected:${sessionIdRef.current.slice(0, 8)}`);
          addLog("S→C connect", msg.data);
          break;
        case "state.members":
          setMembers(msg.data.items || []);
          addLog("S→C state.members", msg.data);
          await ensureWebRTCAndOffer(ws);
          break;
        case "join.member":
          addLog("S→all join.member", msg.data);
          break;
        case "leave.member":
          addLog("S→all leave.member", msg.data);
          break;
        case "webrtc.answer":
          addLog("S→C webrtc.answer");
          if (pcRef.current) {
            try {
              await pcRef.current.setRemoteDescription({
                type: "answer",
                sdp: msg.data.sdp,
              });
              while (iceQueueRef.current.length) {
                const c = iceQueueRef.current.shift()!;
                try {
                  await pcRef.current.addIceCandidate(c);
                } catch (e) {
                  addLog("addIceCandidate(after answer) error", e);
                }
              }
            } catch (e) {
              addLog("setRemoteDescription(answer) error", e);
            }
          }
          break;
        case "webrtc.ice": {
          if (!pcRef.current) break;
          const candidate: RTCIceCandidateInit = {
            candidate: msg.data.candidate,
            sdpMid: msg.data.sdpMid ?? null,
            sdpMLineIndex:
              typeof msg.data.sdpMLineIndex === "number"
                ? msg.data.sdpMLineIndex
                : null,
          };
          if (
            pcRef.current.remoteDescription &&
            pcRef.current.remoteDescription.type === "answer"
          ) {
            try {
              await pcRef.current.addIceCandidate(candidate);
            } catch (e) {
              addLog("addIceCandidate error", e);
            }
          } else {
            iceQueueRef.current.push(candidate);
          }
          break;
        }
        case "error":
          addLog("S→C error", (msg as any).data);
          break;
        case "pong":
          onPong((msg as any).ts);
          break;
        default:
          break;
      }
    };

    return () => {
      cleanup();
    };
  }, [room, yourName]);

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="small">Комната</div>
            <div className="mono">{room}</div>
            <div className="small" id="status">
              {status}
            </div>
          </div>
          <a className="btn secondary" href="/">
            ← Выйти
          </a>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button
            className="btn secondary"
            onClick={() => sendPing(wsRef.current)}
            disabled={
              !wsRef.current ||
              wsRef.current.readyState !== WebSocket.OPEN ||
              inFlight
            }
            title={inFlight ? "Ожидание pong..." : "Отправить ping"}
          >
            Ping
          </button>
          <div className="small">
            RTT: <span className="mono">{lastRttMs ?? "—"}</span> ms
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <audio ref={remoteAudioRef} id="remoteAudio" autoPlay playsInline />
        </div>
        <div className="row" style={{ marginTop: 12, gap: 16 }}>
          <button
            className="btn"
            onClick={async () => {
              const s = await ensureLocalStream();
              if (s) addLog("Микрофон включен");
            }}
          >
            Включить микрофон
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((t) => t.stop());
                localStreamRef.current = null;
                addLog("Микрофон выключен");
              }
            }}
          >
            Выключить микрофон
          </button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Участники</h3>
        <ul id="members" className="list">
          {members.map((m) => (
            <li
              key={m.member_id}
              className="row"
              style={{ justifyContent: "space-between" }}
            >
              <div>{m.name}</div>
              <div className="mono small">{m.member_id.slice(0, 8)}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Журнал</h3>
        <div id="log" className="mono small" style={{ whiteSpace: "pre-wrap" }}>
          {log.join("\n")}
        </div>
      </div>
    </div>
  );
}
