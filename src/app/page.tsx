"use client";

import { useEffect, useMemo, useState } from "react";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

type Room = { name: string };

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [yourName, setYourName] = useState("Гость");
  const [loading, setLoading] = useState(false);

  async function refreshRooms() {
    try {
      const res = await fetch(`${API}/rooms`, { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      const list: string[] = Array.isArray(data?.rooms) ? data.rooms : [];
      setRooms(list.map((name) => ({ name })));
    } catch {
      setRooms([]);
    }
  }

  async function createRoom() {
    if (!yourName.trim()) return alert("Введите имя");
    setLoading(true);
    try {
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName || "general" }),
      });
      const data = await res.json();
      const name =
        (typeof data?.new_room_name === "string" && data.new_room_name) ||
        roomName ||
        "general";
      window.location.href = `/room/${encodeURIComponent(
        name
      )}?name=${encodeURIComponent(yourName)}`;
    } catch (e) {
      alert("Не удалось создать комнату");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshRooms();
    const t = setInterval(refreshRooms, 5000);
    return () => clearInterval(t);
  }, []);

  const canCreate = yourName.trim().length > 0 && !loading;

  return (
    <div className="layout">
      <div className="card p-24">
        <h1 className="title">Байт Хаус</h1>
        <p className="muted">Сосал?</p>

        <div className="row mt-16">
          <input
            className="input grow"
            placeholder="Ваше имя (например, Николай)"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
          />
        </div>

        <div className="row mt-8 gap-8">
          <input
            className="input grow"
            placeholder="Название комнаты (опционально)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button className="btn" disabled={!canCreate} onClick={createRoom}>
            {loading ? "Создаю..." : "Создать и войти"}
          </button>
        </div>
      </div>

      <div className="card p-24">
        <div className="row between">
          <h3 className="h3">Комнаты</h3>
          <button className="btn secondary" onClick={refreshRooms}>
            Обновить
          </button>
        </div>

        <div className="list mt-12">
          {rooms.length === 0 && (
            <div className="muted">Пока пусто — создайте первую комнату.</div>
          )}
          {rooms.map((r) => (
            <div key={r.name} className="row between item">
              <div>
                <div className="mono channel"># {r.name}</div>
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

      <div className="muted small">
        Backend URL: <span className="mono">{API || "—"}</span>
      </div>
    </div>
  );
}
