import { api } from '@/lib/api';

export interface ChatMessage {
  id: string;
  sender_side: 'user' | 'admin' | string;
  sender_name: string;
  body: string;
  created_at: string | null;
  read_at: string | null;
}

export interface ChatThreadSummary {
  id: string;
  display_name: string;
  email: string;
  role: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_admin: number;
  unread_for_user: number;
  is_archived: boolean;
  created_at: string | null;
}

export const MESSAGE_MAX_CHARS = 2000;

export const getMyChat = () => api.get<ChatMessage[]>('/chat/me');

export const getMyChatUnread = () => api.get<{ unread: number }>('/chat/me/unread');

export const sendMyChatMessage = (body: string) =>
  api.post<ChatMessage>('/chat/me', { body });

export const listChatThreads = (includeArchived = false) =>
  api.get<ChatThreadSummary[]>(
    includeArchived ? '/chat/threads?include_archived=true' : '/chat/threads',
  );

export const chatThreadsUnread = () =>
  api.get<{ unread: number; messages: number }>('/chat/threads/unread-count');

export const getChatThread = (threadId: string) =>
  api.get<ChatMessage[]>(`/chat/threads/${threadId}`);

export const replyToChatThread = (threadId: string, body: string) =>
  api.post<ChatMessage>(`/chat/threads/${threadId}`, { body });

export const archiveChatThread = (threadId: string, archived = true) =>
  api.patch<{ id: string; is_archived: boolean }>(
    `/chat/threads/${threadId}/archive?archived=${archived}`,
    {},
  );
