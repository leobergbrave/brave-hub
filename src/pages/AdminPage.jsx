import { useState } from 'react';
import { Package, Truck, Tag, Receipt, BarChart3, Megaphone, Menu, X } from 'lucide-react';
import ProdutosTab from '../admin/ProdutosTab';
import FreteTab from '../admin/FreteTab';
import DescontosTab from '../admin/DescontosTab';
import OrcamentosTab from '../admin/OrcamentosTab';
import DashboardTab from '../admin/DashboardTab';
import MarketingTab from '../admin/MarketingTab';
import CategoriasTab from '../admin/CategoriasTab';
import { Layers, Users } from 'lucide-react';
import LeadsTab from '../admin/LeadsTab';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'categorias', label: 'Categorias', icon: Layers },
  { id: 'descontos', label: 'Descontos', icon: Tag },
  { id: 'frete', label: 'Frete', icon: Truck },
  { id: 'orcamentos', label: 'Orçamentos', icon: Receipt },
  { id: 'marketing', label: 'Funil & Automação', icon: Megaphone },
];

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentTab = TABS.find(t => t.id === tab);

  const handleTabChange = (id) => {
    setTab(id);
    setDrawerOpen(false);
  };

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <DashboardTab />;
      case 'leads': return <LeadsTab />;
      case 'produtos': return <ProdutosTab />;
      case 'categorias': return <CategoriasTab />;
      case 'descontos': return <DescontosTab />;
      case 'frete': return <FreteTab />;
      case 'orcamentos': return <OrcamentosTab />;
      case 'marketing': return <MarketingTab />;
      default: return null;
    }
  };

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b border-dark-700/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Brave Hub Logo" className="h-8 object-contain" />
          <span className="text-[10px] font-bold text-neon tracking-widest uppercase mt-1 px-2 py-0.5 rounded-full bg-neon/10">Admin</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${tab === t.id ? 'bg-neon/10 text-neon' : 'text-zinc-400 hover:text-white hover:bg-dark-800'}`}>
            <t.icon className="w-4 h-4 shrink-0" />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-dark-700/40">
        <a href="/" className="text-xs text-dark-500 hover:text-neon transition-colors">← Voltar ao Gerador</a>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-dark-950 flex">

      {/* ── Sidebar desktop (always visible on lg+) ── */}
      <aside className="hidden lg:flex w-56 shrink-0 bg-dark-900/80 border-r border-dark-700/50 flex-col">
        <SidebarContent />
      </aside>

      {/* ── Drawer overlay mobile ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <aside className="relative w-72 max-w-[85vw] bg-dark-900 border-r border-dark-700/50 flex flex-col h-full shadow-2xl animate-slide-in-right">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-dark-900/80 border-b border-dark-700/50 sticky top-0 z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl bg-dark-800 border border-dark-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="Brave Hub Logo" className="h-6 object-contain shrink-0" />
            <span className="text-[10px] font-bold text-neon tracking-widest uppercase px-2 py-0.5 rounded-full bg-neon/10 shrink-0">Admin</span>
            {currentTab && (
              <>
                <span className="text-dark-600 text-xs shrink-0">·</span>
                <span className="text-sm font-semibold text-white truncate">{currentTab.label}</span>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">{renderTab()}</main>
      </div>
    </div>
  );
}
