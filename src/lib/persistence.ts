import type { UIMessage } from "@/lib/chat";
import { bumpRecents } from "@/lib/chat-nav";
import { platform } from "@/platform";

/**
 * Saved chats, notes and Companion activity, wherever AceMate runs: the
 * claude.ai account's private storage, or the standalone site's server.
 * Everything is a no-op for guests.
 */

export type { ActivitySession, ChatSummary, NoteSummary } from "@/platform/types";

export async function saveChat(chatId: string, messages: UIMessage[]) {
  await platform.store.saveChat(chatId, messages);
  bumpRecents();
}

export const listChats = () => platform.store.listChats();
export const loadChat = (chatId: string) => platform.store.loadChat(chatId);
export const saveNotes = (subject: string, result: unknown) => platform.store.saveNotes(subject, result);
export const listNotes = () => platform.store.listNotes();
export const loadNote = (id: string) => platform.store.loadNote(id);
export const saveCompanionSessionStart = (subject: string) => platform.store.saveCompanionSessionStart(subject);
export const setCompanionSessionCount = (sessionId: string, count: number) =>
  platform.store.setCompanionSessionCount(sessionId, count);
export const listCompanionActivity = (year: number, month: number) =>
  platform.store.listCompanionActivity(year, month);
