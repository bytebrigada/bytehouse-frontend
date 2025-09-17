import { create } from "zustand";

type PingState = {
  lastPingAtMs: number | null;
  lastPongAtMs: number | null;
  lastRttMs: number | null;
  inFlight: boolean;
  sendPing: (ws: WebSocket | null) => void;
  onPong: (tsIso?: string) => void;
};

export const usePingStore = create<PingState>((set, get) => ({
  lastPingAtMs: null,
  lastPongAtMs: null,
  lastRttMs: null,
  inFlight: false,
  sendPing: (ws: WebSocket | null) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    set({ lastPingAtMs: now, inFlight: true });
    const payload = {
      type: "ping",
      ts: new Date(now).toISOString(),
    } as const;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  },
  onPong: (_tsIso?: string) => {
    const now = Date.now();
    const { lastPingAtMs, inFlight } = get();
    const rtt =
      lastPingAtMs && inFlight ? Math.max(0, now - lastPingAtMs) : null;
    set({ lastPongAtMs: now, lastRttMs: rtt, inFlight: false });
  },
}));
