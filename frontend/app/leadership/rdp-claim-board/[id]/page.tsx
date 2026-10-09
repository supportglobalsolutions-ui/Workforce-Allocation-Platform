'use client';

import RdpDesktopSettings from '@/components/rdp/RdpDesktopSettings';

export default function LeadershipRdpDesktopSettingsPage({ params }: { params: { id: string } }) {
  return (
    <RdpDesktopSettings rdpId={params.id} basePath="/leadership" backHref="/leadership/rdp-claim-board" />
  );
}
