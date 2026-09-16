'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, MessageSquare, Send } from 'lucide-react';

import { contactUnreadCount } from '@/lib/contact';
import { chatThreadsUnread } from '@/lib/chat';

/**
 * Sub-navigation for the Notifications section.
 *
 * The enquiries inbox is a subpage of Notifications rather than its own
 * sidebar entry — it is the same job (things people sent you), so it belongs
 * behind the same top-level item.
 */
export default function NotificationTabs() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      contactUnreadCount().catch(() => ({ unread: 0 })),
      chatThreadsUnread().catch(() => ({ unread: 0, messages: 0 })),
    ]).then(([contact, chat]) => {
      if (cancelled) return;
      setUnread(contact.unread);
      setChatUnread(chat.unread);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  const tabs = [
    { href: '/admin/notifications', label: 'Notification Center', icon: Send, badge: 0 },
    { href: '/admin/notifications/inbox', label: 'Enquiries inbox', icon: Inbox, badge: unread },
    { href: '/admin/notifications/chat', label: 'Worker chat', icon: MessageSquare, badge: chatUnread },
  ];

  return (
    <div className="flex items-center gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit">
      {tabs.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-white/10 text-theme-heading'
                : 'text-theme-muted hover:text-theme-heading'
            }`}
          >
            <Icon size={14} />
            {t.label}
            {t.badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
