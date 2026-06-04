import html from '../../../new pages/active_work_session/code.html?raw';

export default function Page() {
  return (
    <div className="min-h-screen bg-[#001712] text-[#cbe9df] p-8">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}