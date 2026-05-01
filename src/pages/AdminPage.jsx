import { useState } from 'react';
import { Dumbbell, Package, Truck, Tag, Receipt, BarChart3 } from 'lucide-react';
import ProdutosTab from '../admin/ProdutosTab';
import FreteTab from '../admin/FreteTab';
import DescontosTab from '../admin/DescontosTab';
import OrcamentosTab from '../admin/OrcamentosTab';
import DashboardTab from '../admin/DashboardTab';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'descontos', label: 'Descontos', icon: Tag },
  { id: 'frete', label: 'Frete', icon: Truck },
  { id: 'orcamentos', label: 'Orçamentos', icon: Receipt },
];

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <DashboardTab />;
      case 'produtos': return <ProdutosTab />;
      case 'descontos': return <DescontosTab />;
      case 'frete': return <FreteTab />;
      case 'orcamentos': return <OrcamentosTab />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-dark-900/80 border-r border-dark-700/50 flex flex-col">
        <div className="px-5 py-6 border-b border-dark-700/40">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Brave Hub Logo" className="h-8 object-contain" />
            <span className="text-[10px] font-bold text-neon tracking-widest uppercase mt-1 px-2 py-0.5 rounded-full bg-neon/10">Admin</span>
          </div>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${tab === t.id ? 'bg-neon/10 text-neon' : 'text-zinc-400 hover:text-white hover:bg-dark-800'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-dark-700/40">
          <a href="/" className="text-xs text-dark-500 hover:text-neon transition-colors">← Voltar ao Gerador</a>
        </div>
      </aside>
      {/* Content */}
      <main className="flex-1 p-8 overflow-y-auto">{renderTab()}</main>
    </div>
  );
}
