'use client';

import RdpSessionView from '@/components/rdp/RdpSessionView';

export default function LeadershipRdpSessionPage({ params }: { params: { rdpId: string } }) {
  return <RdpSessionView rdpId={params.rdpId} basePath="/leadership" />;
}
