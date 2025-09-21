import styles from "./Header.module.scss";
import StatusBadge from "../StatusBadge/StatusBadge";

interface Props {
  url: string;
  room: string; // readonly — из маршрута
  name: string;
  dialSec: number;
  writeSec: number;
  readSec: number;
  setUrl: (v: string) => void;
  setName: (v: string) => void;
  setDialSec: (n: number) => void;
  setWriteSec: (n: number) => void;
  setReadSec: (n: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  connected: boolean;
  statusText: string;
  statusTone: "ok" | "err" | "warn" | "muted";
  onCopyLog: () => void;
  onClearLog: () => void;
}

export default function Header(props: Props) {
  const {
    url,
    room,
    name,
    dialSec,
    writeSec,
    readSec,
    setUrl,
    setName,
    setDialSec,
    setWriteSec,
    setReadSec,
    onConnect,
    onDisconnect,
    connected,
    statusText,
    statusTone,
    onCopyLog,
    onClearLog,
  } = props;
  return (
    <div className={styles.header}>
      <div className={styles.topbar}>
        <div className={styles.title}>WS Chat</div>
        <StatusBadge text={statusText} tone={statusTone} />
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onConnect();
        }}
      >
        <label>
          <span>WebSocket base</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            type="url"
            placeholder="wss://bytehouse.ru/ws/rooms"
          />
        </label>

        <label>
          <span>Room</span>
          <input value={room} readOnly type="text" />
        </label>

        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            placeholder="user-xxxxxx"
          />
        </label>

        <label className={styles.desktopOnly}>
          <span>Dial timeout, s</span>
          <input
            value={dialSec}
            onChange={(e) => setDialSec(Number(e.target.value) || 0)}
            min={0}
            type="number"
          />
        </label>
        <label className={styles.desktopOnly}>
          <span>Write timeout, s</span>
          <input
            value={writeSec}
            onChange={(e) => setWriteSec(Number(e.target.value) || 0)}
            min={0}
            type="number"
          />
        </label>
        <label className={styles.desktopOnly}>
          <span>Read timeout, s</span>
          <input
            value={readSec}
            onChange={(e) => setReadSec(Number(e.target.value) || 0)}
            min={0}
            type="number"
          />
        </label>

        <div className={styles.actions}>
          <button type="button" onClick={onConnect} className={styles.primary}>
            Подключиться
          </button>
          <button type="button" onClick={onDisconnect} disabled={!connected}>
            Отключиться
          </button>
          <button type="button" onClick={onCopyLog}>
            Копировать лог
          </button>
          <button type="button" onClick={onClearLog}>
            Очистить лог
          </button>
        </div>
      </form>
    </div>
  );
}
