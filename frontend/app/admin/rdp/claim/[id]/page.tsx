'use client';

import AdminRdpSubnav from '@/components/rdp/AdminRdpSubnav';
import RdpDesktopSettings from '@/components/rdp/RdpDesktopSettings';

export default function AdminRdpDesktopSettingsPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <AdminRdpSubnav />
      <RdpDesktopSettings rdpId={params.id} backHref="/admin/rdp/claim" />
    </div>
  );
}
