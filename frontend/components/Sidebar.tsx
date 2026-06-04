import Link from 'next/link';

function Sidebar() {
  return (
    <nav className="w-64 bg-[#001712] text-[#cbe9df] p-6 flex flex-col space-y-6">
      <div className="text-2xl font-bold mb-4">GlobalSolutions</div>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2">Worker</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/worker/active_work_session">
              <a className="hover:text-[#80ffea] transition-colors">Active Work Session</a>
            </Link>
          </li>
          <li>
            <Link href="/worker/worker_management">
              <a className="hover:text-[#80ffea] transition-colors">Worker Management</a>
            </Link>
          </li>
          <li>
            <Link href="/worker/worker_portal_home">
              <a className="hover:text-[#80ffea] transition-colors">Worker Portal Home</a>
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Admin</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/admin/audit_logs">
              <a className="hover:text-[#80ffea] transition-colors">Audit Logs</a>
            </Link>
          </li>
          <li>
            <Link href="/admin/financial_intelligence">
              <a className="hover:text-[#80ffea] transition-colors">Financial Intelligence</a>
            </Link>
          </li>
          <li>
            <Link href="/admin/partner_management">
              <a className="hover:text-[#80ffea] transition-colors">Partner Management</a>
            </Link>
          </li>
          <li>
            <Link href="/admin/payroll_revenue_dashboard">
              <a className="hover:text-[#80ffea] transition-colors">Payroll Dashboard</a>
            </Link>
          </li>
          <li>
            <Link href="/admin/system_settings">
              <a className="hover:text-[#80ffea] transition-colors">System Settings</a>
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Leadership</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/leadership/global_leaderboard">
              <a className="hover:text-[#80ffea] transition-colors">Global Leaderboard</a>
            </Link>
          </li>
          <li>
            <Link href="/leadership/operations_command_center">
              <a className="hover:text-[#80ffea] transition-colors">Operations Command Center</a>
            </Link>
          </li>
          <li>
            <Link href="/leadership/rdp_claim_board">
              <a className="hover:text-[#80ffea] transition-colors">RDP Claim Board</a>
            </Link>
          </li>
          <li>
            <Link href="/leadership/rdp_resource_management">
              <a className="hover:text-[#80ffea] transition-colors">RDP Resource Management</a>
            </Link>
          </li>
          <li>
            <Link href="/leadership/session_history">
              <a className="hover:text-[#80ffea] transition-colors">Session History</a>
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Executive</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/executive/ceo_command_center">
              <a className="hover:text-[#80ffea] transition-colors">CEO Command Center</a>
            </Link>
          </li>
          <li>
            <Link href="/executive/executive_login">
              <a className="hover:text-[#80ffea] transition-colors">Executive Login</a>
            </Link>
          </li>
        </ul>
      </section>
      <section className="mt-auto">
        <Link href="/globalsolutions_landing_page">
          <a className="text-sm opacity-60 hover:opacity-100 transition-opacity">Landing Page</a>
        </Link>
      </section>
    </nav>
  );
}

export default Sidebar;
