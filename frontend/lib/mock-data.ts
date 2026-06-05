export const kpis = {
  workersOnline: 142,
  activeSessions: 87,
  machinesOnline: 156,
  qualityIndex: 94.2,
  revenue: 284750,
  payrollPending: 12,
};

export const machines = [
  { id: 'RDP-KE-001', name: 'Nairobi Alpha', country: 'Kenya', client: 'Client A', status: 'online_free', health: 98, user: null },
  { id: 'RDP-KE-002', name: 'Nairobi Beta', country: 'Kenya', client: 'Client A', status: 'active', health: 95, user: 'Sarah M.' },
  { id: 'RDP-NG-001', name: 'Lagos Prime', country: 'Nigeria', client: 'Client B', status: 'idle', health: 72, user: 'James O.' },
  { id: 'RDP-UG-001', name: 'Kampala Core', country: 'Uganda', client: 'Client C', status: 'maintenance', health: 0, user: null },
  { id: 'RDP-GH-001', name: 'Accra Delta', country: 'Ghana', client: 'Client A', status: 'unhealthy', health: 41, user: null },
  { id: 'RDP-KE-003', name: 'Nairobi Gamma', country: 'Kenya', client: 'Client D', status: 'admin_locked', health: 88, user: null },
];

export const sessions = [
  { id: 'SES-001', date: '2026-06-05', machine: 'Nairobi Alpha', duration: '4h 23m', status: 'completed', type: 'GS RDP' },
  { id: 'SES-002', date: '2026-06-04', machine: '—', duration: '3h 10m', status: 'completed', type: 'Prolific' },
  { id: 'SES-003', date: '2026-06-04', machine: 'Lagos Prime', duration: '5h 02m', status: 'force_released', type: 'GS RDP' },
  { id: 'SES-004', date: '2026-06-03', machine: '—', duration: '2h 45m', status: 'completed', type: 'Partner Multilog' },
];

export const workers = [
  { id: 'W-001', name: 'Sarah Mwangi', country: 'Kenya', type: 'GS Registered', partner: '—', rank: 3, quality: 96.4, status: 'active' },
  { id: 'W-002', name: 'James Okonkwo', country: 'Nigeria', type: 'Partner Worker', partner: 'Partner Alpha', rank: 7, quality: 91.2, status: 'active' },
  { id: 'W-003', name: 'Grace Nakato', country: 'Uganda', type: 'GS Registered', partner: '—', rank: 1, quality: 98.1, status: 'active' },
  { id: 'W-004', name: 'David Mensah', country: 'Ghana', type: 'Partner Worker', partner: 'Partner Beta', rank: 12, quality: 87.5, status: 'inactive' },
];

export const partners = [
  { id: 'P-001', name: 'Partner Alpha', workerPct: 70, gsPct: 20, partnerPct: 10, workers: 34, revenue: 48200 },
  { id: 'P-002', name: 'Partner Beta', workerPct: 60, gsPct: 25, partnerPct: 15, workers: 28, revenue: 31500 },
  { id: 'P-003', name: 'Partner Gamma', workerPct: 65, gsPct: 20, partnerPct: 15, workers: 19, revenue: 22800 },
];

export const leaderboard = [
  { rank: 1, name: 'Grace Nakato', country: 'Uganda', score: 98.1, streak: 14, bonus: '+2.4' },
  { rank: 2, name: 'Sarah Mwangi', country: 'Kenya', score: 96.4, streak: 11, bonus: '+1.8' },
  { rank: 3, name: 'Peter Kamau', country: 'Kenya', score: 95.2, streak: 9, bonus: '+1.2' },
  { rank: 4, name: 'James Okonkwo', country: 'Nigeria', score: 91.2, streak: 7, bonus: '+0.8' },
  { rank: 5, name: 'Amina Hassan', country: 'Kenya', score: 90.8, streak: 6, bonus: '+0.5' },
];

export const auditLogs = [
  { actor: 'Admin Lead', action: 'FORCE_RELEASE', entity: 'RDP-KE-002', timestamp: '2026-06-05 14:32', old: 'Active', new: 'Online Free' },
  { actor: 'Sarah M.', action: 'CLAIM', entity: 'RDP-KE-001', timestamp: '2026-06-05 09:15', old: 'Online Free', new: 'Assigned' },
  { actor: 'Admin Lead', action: 'QUALITY_RATING', entity: 'W-002', timestamp: '2026-06-04 16:45', old: '—', new: 'Communication: 4/5' },
];

export const notifications = [
  { id: 1, type: 'machine', title: 'RDP-GH-001 Unhealthy', message: 'Port check failing on Accra Delta', time: '5m ago', read: false },
  { id: 2, type: 'payroll', title: 'Payroll Exception', message: '3 sessions missing required fields in Period 2026-05', time: '1h ago', read: false },
  { id: 3, type: 'quality', title: 'Quality Alert', message: 'Worker W-004 score dropped below threshold', time: '3h ago', read: true },
];

export const assessments = [
  { id: 'A-001', title: 'Data Labelling Fundamentals', category: 'Technical', difficulty: 'Intermediate', status: 'assigned', score: null },
  { id: 'A-002', title: 'Communication Protocols', category: 'Soft Skills', difficulty: 'Beginner', status: 'completed', score: 92 },
  { id: 'A-003', title: 'Platform Safety & Compliance', category: 'Compliance', difficulty: 'Advanced', status: 'assigned', score: null },
];

export const payrollRows = [
  { worker: 'Sarah Mwangi', hours: 42.5, gross: 4250, workerNet: 3400, gsNet: 850, flags: 0, status: 'approved' },
  { worker: 'James Okonkwo', hours: 38.0, gross: 3040, workerNet: 2128, gsNet: 912, flags: 1, status: 'pending' },
  { worker: 'Grace Nakato', hours: 45.0, gross: 4500, workerNet: 3600, gsNet: 900, flags: 0, status: 'approved' },
];

export const STATUS_COLORS: Record<string, string> = {
  online_free: 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  idle: 'bg-warning/20 text-warning border-warning/30',
  offline: 'bg-white/10 text-white/50 border-white/10',
  unhealthy: 'bg-danger/20 text-danger border-danger/30',
  maintenance: 'bg-gold-accent/20 text-gold-accent border-gold-accent/30',
  admin_locked: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  completed: 'bg-success/20 text-success border-success/30',
  force_released: 'bg-danger/20 text-danger border-danger/30',
  pending: 'bg-warning/20 text-warning border-warning/30',
  approved: 'bg-success/20 text-success border-success/30',
};

export const STATUS_LABELS: Record<string, string> = {
  online_free: 'Online Free',
  active: 'Active',
  idle: 'Idle',
  offline: 'Offline',
  unhealthy: 'Unhealthy',
  maintenance: 'Maintenance',
  admin_locked: 'Locked',
  completed: 'Completed',
  force_released: 'Force Released',
  pending: 'Pending',
  approved: 'Approved',
};
