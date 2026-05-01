import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, BarChart3, Receipt, Tag } from 'lucide-react';
import { formatCurrency } from '../data';

export default function DashboardTab() {
  const [stats, setStats] = useState({ produtos: 0, pendentes: 0, aprovados: 0, valorAprovado: 0 });

  useEffect(() => {
    async function load() {
      const [{ count: p }, { data: orcs }] = await Promise.all([
        supabase.from('produtos').select('*', { count: 'exact', head: true }),
        supabase.from('orcamentos_salvos').select('*'),
      ]);
      
      const pend = (orcs || []).filter(o => (o.payload?.status || 'Pendente') === 'Pendente').length;
      const aprov = (orcs || []).filter(o => o.payload?.status === 'Aprovado');
      
      const calcTotal = (o) => {
        const itens = o.payload?.itens || [];
        return itens.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
      };

      setStats({ 
        produtos: p || 0, 
        pendentes: pend, 
        aprovados: aprov.length, 
        valorAprovado: aprov.reduce((s, o) => s + calcTotal(o), 0) 
      });
    }
    load();
  }, []);

  const cards = [
    { label: 'Produtos Cadastrados', value: stats.produtos, icon: Package, color: 'text-neon' },
    { label: 'Orçamentos Pendentes', value: stats.pendentes, icon: Receipt, color: 'text-amber-400' },
    { label: 'Projetos Aprovados', value: stats.aprovados, icon: Tag, color: 'text-emerald-400' },
    { label: 'Valor Aprovado', value: formatCurrency(stats.valorAprovado), icon: BarChart3, color: 'text-purple-400' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => (
          <div key={c.label} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <c.icon className={`w-5 h-5 ${c.color}`} />
              <span className="text-xs font-medium text-zinc-400">{c.label}</span>
            </div>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
