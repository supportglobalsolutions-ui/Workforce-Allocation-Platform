'use client';

import AdminRdpSubnav from '@/components/rdp/AdminRdpSubnav';
import RdpClaimBoard from '@/components/rdp/RdpClaimBoard';

export default function AdminRdpClaimPage() {
  return (
    <div>
      <AdminRdpSubnav />
      <RdpClaimBoard resourcesHref="/admin/rdp" />
    </div>
  );
}
