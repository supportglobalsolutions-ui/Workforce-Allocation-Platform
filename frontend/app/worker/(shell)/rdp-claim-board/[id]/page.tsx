'use client';

import RdpDesktopSettings from '@/components/rdp/RdpDesktopSettings';

export default function WorkerRdpDesktopSettingsPage({ params }: { params: { id: string } }) {
  return <RdpDesktopSettings rdpId={params.id} backHref="/worker/rdp-claim-board" />;
}
