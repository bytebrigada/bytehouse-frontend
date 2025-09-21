import { Room } from "@/types/room";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://bytehouse.ru";

export async function apiGetRooms(): Promise<Room[]> {
  const res = await fetch(`${BASE}/api/rooms`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось получить комнаты");
  return (await res.json()).rooms as Room[];
}

export async function apiCreateRoom(name: string): Promise<Room> {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Не удалось создать комнату");
  }
  return (await res.json()) as Room;
}
