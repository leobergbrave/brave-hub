import { useState } from 'react';
import { Package, Truck, Tag, Receipt, BarChart3, Megaphone, Menu, X, Sparkles, Zap, Heart, Award, Layers, Users, Mail, BookUser, Search, Globe } from 'lucide-react';

import ProdutosTab from '../admin/ProdutosTab';
import FreteTab from '../admin/FreteTab';
import DescontosTab from '../admin/DescontosTab';
import OrcamentosTab from '../admin/OrcamentosTab';
import DashboardTab from '../admin/DashboardTab';
import MarketingTab from '../admin/MarketingTab';
import CategoriasTab from '../admin/CategoriasTab';
import LeadsTab from '../admin/LeadsTab';
import EmailsTab from '../admin/EmailsTab';
import ContatosTab from '../admin/ContatosTab';
import DisparosTab from '../admin/DisparosTab';
import CockpitTab from '../admin/CockpitTab';
import PosVendaTab from '../admin/PosVendaTab';
import ClientesTab from '../admin/ClientesTab';
import ProspeccaoTab from '../admin/ProspeccaoTab';
import LandingPagesTab from '../admin/LandingPagesTab';


const NAV_SECTIONS = [
  {
    label: 'COMERCIAL',
    items: [
      { id: 'leads',      label: 'Leads',               icon: Users },
      { id: 'contatos',   label: 'Contatos',            icon: BookUser },
      { id: 'prospeccao', label: 'Prospecção Ativa', icon: Search },
      { id: 'orcamentos', label: 'Orçamentos',          icon: Receipt },
    ],
  },

  {
    label: 'COMUNICAÇÃO',
    items: [
      { id: 'disparos',  label: 'Disparos WhatsApp',  icon: Zap },
      { id: 'marketing', label: 'Follow Up LEADS',      icon: Megaphone },
      { id: 'posvendas', label: 'Follow Up CLIENTES',   icon: Heart },
    ],
  },
  {
    label: 'ANÁLISES',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'cockpit',   label: 'Cockpit',   icon: Award },
    ],
  },
  {
    label: 'CONFIGURAÇÕES',
    items: [
      { id: 'produtos',   label: 'Produtos',   icon: Package },
      { id: 'categorias', label: 'Categorias', icon: Layers },
      { id: 'descontos',  label: 'Descontos',  icon: Tag },
      { id: 'frete',      label: 'Frete',      icon: Truck },
    ],
  },
];

const ALL_TABS = NAV_SECTIONS.flatMap(s => s.items);

export default function AdminPage() {
  const [tab, setTab] = useState('leads');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [followUpBadge, setFollowUpBadge] = useState(0);

  const currentTab = ALL_TABS.find(t => t.id === tab);

  const handleTabChange = (id) => {
    setTab(id);
    setDrawerOpen(false);
  };

  const handleNovoOrcamento = () => {
    window.open('/', '_blank');
    setDrawerOpen(false);
  };

  const renderTab = () => {
    switch (tab) {
      case 'dashboard':  return <DashboardTab />;
      case 'cockpit':    return <CockpitTab />;
      case 'leads':      return <LeadsTab />;
      case 'clientes':   return <ClientesTab onNavigate={handleTabChange} />;
      case 'contatos':   return <ContatosTab />;
      case 'prospeccao': return <ProspeccaoTab />;
      case 'disparos':   return <DisparosTab />;
      case 'posvendas':  return <PosVendaTab />;
      case 'produtos':   return <ProdutosTab />;
      case 'categorias': return <CategoriasTab />;
      case 'descontos':  return <DescontosTab />;
      case 'frete':      return <FreteTab />;
      case 'orcamentos': return <OrcamentosTab />;
      case 'marketing':  return <MarketingTab onBadgeUpdate={setFollowUpBadge} />;
      case 'emails':        return <EmailsTab />;
      case 'landingpages':  return <LandingPagesTab />;
      default: return null;
    }
  };


  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-dark-700/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Brave Hub Logo" className="h-8 object-contain" />
          <span className="text-[10px] font-bold text-neon tracking-widest uppercase mt-1 px-2 py-0.5 rounded-full bg-neon/10">Admin</span>
        </div>
        <button
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* CTA — Novo Orçamento */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={handleNovoOrcamento}
          className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-neon text-dark-950 text-sm font-black tracking-wide hover:bg-neon/90 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-neon/20"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          Novo Orçamento
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label} className={`px-3 ${si > 0 ? 'mt-1' : ''} ${section.label === 'CONFIGURAÇÕES' ? 'border-t border-dark-700/40 pt-3 mt-2' : ''}`}>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.18em] px-3 mb-1">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((t) => (
                <button key={t.id} onClick={() => handleTabChange(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    tab === t.id
                      ? 'bg-neon/10 text-neon'
                      : section.label === 'CONFIGURAÇÕES'
                        ? 'text-zinc-500 hover:text-zinc-300 hover:bg-dark-800'
                        : 'text-zinc-400 hover:text-white hover:bg-dark-800'
                  }`}>
                  <t.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{t.label}</span>
                  {t.id === 'marketing' && followUpBadge > 0 && (
                    <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-dark-950 min-w-[18px] text-center">
                      {followUpBadge > 99 ? '99+' : followUpBadge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-dark-950 flex">

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-56 shrink-0 bg-dark-900/80 border-r border-dark-700/50 flex-col">
        <SidebarContent />
      </aside>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-dark-900 border-r border-dark-700/50 flex flex-col h-full shadow-2xl animate-slide-in-right">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Content area */}
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
