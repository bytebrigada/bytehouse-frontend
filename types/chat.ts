export type Identity = {
  name: string;
  session_id: string;
};

export type ServerUser = {
  session_id: string;
  name: string;
};

export type ServerMessage = {
  message_id: string;
  text: string;
  send_time: string;
  user: ServerUser;
  __local: unknown;
};

export type GroupedMessages = {
  key: string;
  session_id: string;
  name: string;
  mine: boolean;
  items: Array<{ id: string; text: string; send_time: string }>;
};

export type LogKind = "system" | "incoming" | "outgoing" | "error" | "timeout";

export type LogEntry = {
  id: string;
  kind: LogKind;
  time: string;
  content: unknown;
};

export type OutgoingMessage = { text: string };
