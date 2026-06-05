import Image from 'next/image';
import Link from 'next/link';

function Sidebar() {
  return (
    <nav className="w-64 bg-[#001712] text-[#cbe9df] p-6 flex flex-col space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Image src="/images/logo.png" alt="GlobalSolutions Logo" width={36} height={36} className="rounded-lg" />
        <span className="text-2xl font-bold">GlobalSolutions</span>
      </div>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2">Worker</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/worker/active_work_session" className="hover:text-[#80ffea] transition-colors">
              Active Work Session
            </Link>
          </li>
          <li>
            <Link href="/worker/worker_management" className="hover:text-[#80ffea] transition-colors">
              Worker Management
            </Link>
          </li>
          <li>
            <Link href="/worker/worker_portal_home" className="hover:text-[#80ffea] transition-colors">
              Worker Portal Home
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Admin</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/admin/audit_logs" className="hover:text-[#80ffea] transition-colors">
              Audit Logs
            </Link>
          </li>
          <li>
            <Link href="/admin/financial_intelligence" className="hover:text-[#80ffea] transition-colors">
              Financial Intelligence
            </Link>
          </li>
          <li>
            <Link href="/admin/partner_management" className="hover:text-[#80ffea] transition-colors">
              Partner Management
            </Link>
          </li>
          <li>
            <Link href="/admin/payroll_revenue_dashboard" className="hover:text-[#80ffea] transition-colors">
              Payroll Dashboard
            </Link>
          </li>
          <li>
            <Link href="/admin/system_settings" className="hover:text-[#80ffea] transition-colors">
              System Settings
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Leadership</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/leadership/global_leaderboard" className="hover:text-[#80ffea] transition-colors">
              Global Leaderboard
            </Link>
          </li>
          <li>
            <Link href="/leadership/operations_command_center" className="hover:text-[#80ffea] transition-colors">
              Operations Command Center
            </Link>
          </li>
          <li>
            <Link href="/leadership/rdp_claim_board" className="hover:text-[#80ffea] transition-colors">
              RDP Claim Board
            </Link>
          </li>
          <li>
            <Link href="/leadership/rdp_resource_management" className="hover:text-[#80ffea] transition-colors">
              RDP Resource Management
            </Link>
          </li>
          <li>
            <Link href="/leadership/session_history" className="hover:text-[#80ffea] transition-colors">
              Session History
            </Link>
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm uppercase opacity-70 mb-2 mt-4">Executive</h2>
        <ul className="space-y-1">
          <li>
            <Link href="/executive/ceo_command_center" className="hover:text-[#80ffea] transition-colors">
              CEO Command Center
            </Link>
          </li>
          <li>
            <Link href="/executive/executive_login" className="hover:text-[#80ffea] transition-colors">
              Executive Login
            </Link>
          </li>
        </ul>
      </section>
      <section className="mt-auto">
        <Link href="/globalsolutions_landing_page" className="text-sm opacity-60 hover:opacity-100 transition-opacity">
          Landing Page
        </Link>
      </section>
    </nav>
  );
}

export default Sidebar;
