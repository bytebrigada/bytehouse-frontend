"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;
const ICE_URLS = (
  process.env.NEXT_PUBLIC_ICE_URLS || "stun:stun.l.google.com:19302"
)
  .split(",")
  .map((s) => s.trim());

type Member = { id: string; name: string };

type WsMsg =
  | {
      type: "connect";
      selfId: string;
      room: { name: string };
      you: { name: string };
      ts: number;
    }
  | { type: "state.members"; members: Member[] }
  | { type: "join.member"; member: Member }
  | { type: "leave.member"; memberId: string }
  | {
      type: "webrtc.offer" | "webrtc.answer" | "webrtc.ice";
      from: string;
      to: string;
      sdp?: any;
      candidate?: any;
    }
  | { type: "ping"; ts: number };

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
  const [members, setMembers] = useState<Member[]>([]);
  const selfIdRef = useRef<string>("");
  const wsRef = useRef<WebSocket | null>(null);

  // WebRTC peer connections per member
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudios = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  function addLog(s: string) {
    setLog((prev) => [s, ...prev].slice(0, 200));
  }

  async function ensureLocalStream() {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current = stream;
    }
    return localStreamRef.current!;
  }

  function createPeer(targetId: string) {
    let pc = peers.current.get(targetId);
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: ICE_URLS.map((url) => ({ urls: url })),
    });
    peers.current.set(targetId, pc);

    pc.onicecandidate = (ev) => {
      if (ev.candidate && wsRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "webrtc.ice",
            to: targetId,
            candidate: ev.candidate,
          })
        );
      }
    };

    pc.ontrack = (ev) => {
      let el = remoteAudios.current.get(targetId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        el.playsInline = true;
        remoteAudios.current.set(targetId, el);
        document.body.appendChild(el);
      }
      el.srcObject = ev.streams[0];
    };

    return pc;
  }

  async function callPeer(targetId: string) {
    const pc = createPeer(targetId);
    const local = await ensureLocalStream();
    local.getTracks().forEach((t) => pc!.addTrack(t, local));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(
      JSON.stringify({ type: "webrtc.offer", to: targetId, sdp: offer })
    );
    addLog(`→ offer to ${targetId}`);
  }

  function closePeer(targetId: string) {
    const pc = peers.current.get(targetId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
      peers.current.delete(targetId);
    }
    const el = remoteAudios.current.get(targetId);
    if (el) {
      el.pause();
      el.srcObject = null;
      el.remove();
      remoteAudios.current.delete(targetId);
    }
  }

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?room_name=${encodeURIComponent(
        room
      )}&name=${encodeURIComponent(yourName)}`
    );
    wsRef.current = ws;

    ws.onopen = () => addLog("WS connected");
    ws.onclose = () => addLog("WS closed");

    ws.onmessage = async (ev) => {
      const msg: WsMsg = JSON.parse(ev.data);
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (msg.type === "connect") {
        selfIdRef.current = msg.selfId;
        addLog(`selfId=${msg.selfId}`);
      }
      if (msg.type === "state.members") {
        setMembers(msg.members);
        // call everyone already inside
        for (const m of msg.members) {
          if (m.id !== selfIdRef.current) callPeer(m.id);
        }
      }
      if (msg.type === "join.member") {
        setMembers((prev) => [...prev, msg.member]);
        // new member joined -> we are the caller
        callPeer(msg.member.id);
      }
      if (msg.type === "leave.member") {
        setMembers((prev) => prev.filter((m) => m.id !== msg.memberId));
        closePeer(msg.memberId);
      }
      if (msg.type === "webrtc.offer") {
        const from = msg.from;
        const pc = createPeer(from);
        const local = await ensureLocalStream();
        local.getTracks().forEach((t) => {
          // avoid duplicate senders
          if (!pc.getSenders().some((s) => s.track?.id === t.id))
            pc.addTrack(t, local);
        });
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(
          JSON.stringify({ type: "webrtc.answer", to: from, sdp: answer })
        );
        addLog(`← offer from ${from} → answer`);
      }
      if (msg.type === "webrtc.answer") {
        const from = msg.from;
        const pc = createPeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        addLog(`← answer from ${from}`);
      }
      if (msg.type === "webrtc.ice") {
        const from = msg.from;
        const pc = createPeer(from);
        if (msg.candidate)
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    };

    return () => {
      ws.close();
      // stop mic
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      // close peers
      for (const id of Array.from(peers.current.keys())) closePeer(id);
    };
  }, [room, yourName]);

  return (
    <div className="grid gap-6">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="small">Комната</div>
            <div className="mono">{room}</div>
          </div>
          <a className="btn secondary" href="/">
            ← Выйти
          </a>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 16 }}>
          <button
            className="btn"
            onClick={async () => {
              const s = await ensureLocalStream();
              for (const id of Array.from(peers.current.keys())) {
                const pc = peers.current.get(id)!;
                s.getTracks().forEach((t) => pc.addTrack(t, s));
              }
              addLog("Микрофон включен");
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
        <div className="list">
          {members.map((m) => (
            <div
              key={m.id}
              className="row"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                {m.name}{" "}
                {m.id === selfIdRef.current ? (
                  <span className="badge">вы</span>
                ) : null}
              </div>
              <div className="mono small">{m.id.slice(0, 8)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Журнал</h3>
        <div className="mono small" style={{ whiteSpace: "pre-wrap" }}>
          {log.join("\n")}
        </div>
      </div>
    </div>
  );
}
