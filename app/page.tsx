/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.scss";
import StatusBadge from "@/app/components/StatusBadge/StatusBadge";
import { apiCreateRoom, apiGetRooms } from "@/app/api/rooms.service";
import { Room } from "@/types/room";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const router = useRouter();

  const status = useMemo(() => {
    if (error) return { text: error, tone: "err" as const };
    if (creating) return { text: "создаю…", tone: "warn" as const };
    if (loading) return { text: "загружаю…", tone: "muted" as const };
    return { text: "готово", tone: "ok" as const };
  }, [loading, creating, error]);

  const fetchRooms = async () => {
    try {
      setError(null);
      setLoading(true);
      const list = await apiGetRooms();
      setRooms(list);
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const createRoom = async () => {
    const title = name.trim();
    if (!title) return;
    try {
      setCreating(true);
      const created = await apiCreateRoom(title);
      setRooms((prev) => [
        created,
        ...prev.filter((r) => r.room_id !== created.room_id),
      ]);
      setName("");
      router.push(`/rooms/${encodeURIComponent(created.room_id)}`);
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.topbar}>
          <div className={styles.title}>Мачо дача байт хаус</div>
          <StatusBadge text={status.text} tone={status.tone} />
        </div>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            createRoom();
          }}
        >
          <label>
            <span>Название комнаты</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: support"
              type="text"
              required
            />
          </label>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={creating || !name.trim()}
            >
              Создать
            </button>
            <button
              type="button"
              onClick={fetchRooms}
              className={styles.ghost}
              disabled={loading || creating}
            >
              Обновить
            </button>
          </div>
        </form>
      </div>

      <div className={styles.listHeader}>
        <span>Количество комнат: {rooms.length}</span>
      </div>

      <div className={styles.grid}>
        {loading && <div className={styles.skeleton}>Загрузка…</div>}
        {!loading && rooms.length === 0 && (
          <div className={styles.empty}>Комнат пока нет — создайте первую.</div>
        )}

        {rooms.map((room) => (
          <button
            key={room.room_id}
            className={styles.card}
            onClick={() =>
              router.push(`/rooms/${encodeURIComponent(room.room_id)}`)
            }
            title={`Открыть ${room.name}`}
          >
            <div className={styles.cardTitle}>{room.name}</div>
            <div className={styles.cardMeta}>
              адрес: <code>/rooms/{room.room_id}</code>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
