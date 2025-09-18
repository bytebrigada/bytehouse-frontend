"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

type Room = { name: string; members: number; createdAt: number };
type ApiRoomItem = { room_name: string; members: number; updated_at?: string };

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [yourName, setYourName] = useState("Гость");

  async function refreshRooms() {
    try {
      const res = await fetch(`${API}/rooms`);
      if (!res.ok) {
        setRooms([]);
        return;
      }
      const data = await res.json();
      const items: ApiRoomItem[] = Array.isArray(data?.items)
        ? (data.items as ApiRoomItem[])
        : [];
      const mapped: Room[] = items.map((it) => ({
        name: it.room_name,
        members: typeof it.members === "number" ? it.members : 0,
        createdAt: it.updated_at ? Date.parse(it.updated_at) : Date.now(),
      }));
      setRooms(mapped);
    } catch {
      setRooms([]);
    }
  }

  async function createRoom() {
    const res = await fetch(`${API}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_name: roomName || undefined }),
    });
    const data = await res.json();
    const name = (data?.room?.name as string) || roomName;
    window.location.href = `/room/${encodeURIComponent(
      name
    )}?name=${encodeURIComponent(yourName || "Гость")}`;
  }

  useEffect(() => {
    refreshRooms();
    const t = setInterval(refreshRooms, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid gap-6">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Байт Хаус</h1>
        <p className="small">Минимальный голосовой чат</p>
        <div className="row" style={{ marginTop: 12 }}>
          <input
            className="input"
            placeholder="Ваше имя (например, Николай)"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
          />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder="Название комнаты (опционально)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button className="btn" onClick={createRoom}>
            Создать и войти
          </button>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Комнаты</h3>
          <button className="btn secondary" onClick={refreshRooms}>
            Обновить
          </button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {rooms.length === 0 && (
            <div className="small">Пока пусто — создайте первую комнату.</div>
          )}
          {rooms.map((r) => (
            <div
              key={r.name}
              className="row"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                <div className="mono">{r.name}</div>
                <div className="small">
                  {new Date(r.createdAt).toLocaleString()} • участников:{" "}
                  {r.members}
                </div>
              </div>
              <a
                className="btn tonal"
                href={`/room/${encodeURIComponent(
                  r.name
                )}?name=${encodeURIComponent(yourName || "Гость")}`}
              >
                Войти
              </a>
            </div>
          ))}
        </div>
      </div>
      <div className="small">
        Backend URL: <span className="mono">{API}</span>
      </div>
    </div>
  );
}
