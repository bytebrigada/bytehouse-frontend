"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

type Room = { name: string; members: number; createdAt: number };

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [yourName, setYourName] = useState<string>(() => {
    return (
      process.env.NEXT_PUBLIC_DEFAULT_NAME ||
      (typeof window !== "undefined"
        ? window.navigator.userAgent.includes("Windows")
          ? "Пользователь"
          : "Гость"
        : "Гость")
    );
  });

  async function refreshRooms() {
    const res = await fetch(`${API}/rooms`);
    const data = await res.json();
    setRooms(data.rooms);
  }

  async function createRoom() {
    const res = await fetch(`${API}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_name: roomName || undefined }),
    });
    const data = await res.json();
    const name = data.room.name as string;
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
        <h1 style={{ marginTop: 0 }}>Байт хаус прайм</h1>
        <p className="small"></p>
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
                className="btn"
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
