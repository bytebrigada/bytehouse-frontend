export interface JoinRoomInput {
  name: string;
  room_name: string;
  session_id: string;
}
export interface OutgoingMessage {
  text: string;
}
export type LogKind = "incoming" | "outgoing" | "system" | "error" | "timeout";
export interface LogEntry {
  id: string;
  kind: LogKind;
  time: string;
  content: unknown;
}
