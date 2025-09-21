import styles from "./Header.module.scss";
import StatusBadge from "../StatusBadge/StatusBadge";
import { useRouter } from "next/navigation";

interface Props {
  roomId: string;
  name: string | null;
  connected: boolean;
  statusText: string;
  statusTone: "ok" | "err" | "warn" | "muted";
  onReconnect: () => void;
  onDisconnect: () => void;
  onExit: () => void;
}

export default function Header({
  roomId,
  name,
  connected,
  statusText,
  statusTone,
  onReconnect,
  onDisconnect,
  onExit,
}: Props) {
  const router = useRouter();
  return (
    <div className={styles.header}>
      <div className={styles.topbar}>
        <div className={styles.title}>WS Chat</div>
        <StatusBadge text={statusText} tone={statusTone} />
      </div>

      <div className={styles.miniline}>
        <div>
          Комната: <strong>{roomId}</strong>
        </div>
        <div>
          Имя: <strong>{name ?? "—"}</strong>
        </div>
      </div>

      <div className={styles.actions}>
        <button onClick={onReconnect} className={styles.primary}>
          Переподключиться
        </button>
        <button onClick={onDisconnect} disabled={!connected}>
          Отключиться
        </button>
        <button onClick={onExit}>Выйти</button>
        <button onClick={() => router.push("/")}>В меню</button>
      </div>
    </div>
  );
}
