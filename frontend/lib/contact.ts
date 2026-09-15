import { api } from '@/lib/api';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'archived';
  created_at: string | null;
  handled_at: string | null;
}

/** Public — no account required. */
export const sendContactMessage = (body: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => api.post<{ id: string; received: boolean; message: string }>('/contact', body);

export const listContactMessages = (statusFilter?: ContactMessage['status']) =>
  api.get<ContactMessage[]>(
    statusFilter ? `/contact?status_filter=${statusFilter}` : '/contact',
  );

export const contactUnreadCount = () => api.get<{ unread: number }>('/contact/unread-count');

export const setContactStatus = (id: string, status: ContactMessage['status']) =>
  api.patch<{ id: string; status: string }>(`/contact/${id}?new_status=${status}`, {});
