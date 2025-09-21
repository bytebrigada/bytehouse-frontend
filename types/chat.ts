export type ServerUser = {
  session_id: string;
  name: string;
};

export type ServerMessage = {
  message_id: string;
  text: string;
  send_time: string; // ISO-строка от сервера
  user: ServerUser;
};

export type GroupedMessages = {
  key: string; // уникальный ключ группы
  session_id: string;
  name: string;
  mine: boolean;
  items: Array<{
    id: string;
    text: string;
    send_time: string;
  }>;
};

export type LogKind = "system" | "incoming" | "outgoing" | "error" | "timeout";

export type LogEntry = {
  id: string;
  kind: LogKind;
  time: string;
  content: unknown;
};

export type OutgoingMessage = { text: string };
