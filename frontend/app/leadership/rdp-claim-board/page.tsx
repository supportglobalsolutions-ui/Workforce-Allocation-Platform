'use client';

import RdpClaimBoard from '@/components/rdp/RdpClaimBoard';

/** Same board the workers use, kept inside the leadership shell. */
export default function LeadershipRdpClaimBoardPage() {
  return <RdpClaimBoard basePath="/leadership" />;
}
