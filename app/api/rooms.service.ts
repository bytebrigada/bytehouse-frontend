const BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://bytehouse.ru";

export async function apiGetRooms() {
  const res = await fetch(`${BASE}/api/rooms`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось получить комнаты");
  const data = (await res.json()) as { rooms: string[] };
  return data.rooms;
}

export async function apiCreateRoom(name: string) {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Не удалось создать комнату");
  }
  const data = (await res.json()) as { new_room_name: string };
  return data.new_room_name;
}
