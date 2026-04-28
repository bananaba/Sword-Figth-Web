export const ROOM_NAME = "world" as const;

export const MessageType = {
  Input: "input",
  Fire: "fire",
  Chat: "chat",
  Rename: "rename",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface ChatMessage {
  from: string;
  text: string;
  ts: number;
}
