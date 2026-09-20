'use client';

import RdpSessionView from '@/components/rdp/RdpSessionView';

export default function WorkerRdpSessionPage({ params }: { params: { rdpId: string } }) {
  return <RdpSessionView rdpId={params.rdpId} />;
}
