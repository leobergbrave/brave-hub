import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Loader2, Eye, Copy, Trash2, CheckCircle2, Clock, XCircle } from 'lucide-react';

const STATUS_MAP = {
  Pendente: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  Aprovado: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  Expirado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export default function OrcamentosTab() {
  const [orcs, setOrcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Todos');
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('orcamentos').select('*').order('criado_em', { ascending: false });
    setOrcs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    await supabase.from('orcamentos').update({ status }).eq('id', id);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este orçamento?')) return;
    await supabase.from('orcamentos').delete().eq('id', id);
    setDetail(null);
    load();
  };

  const copyLink = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/orcamento?id=${id}`);
  };

  const filtered = filter === 'Todos' ? orcs : orcs.filter(o => o.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Orçamentos</h1>
        <div className="flex gap-2">
          {['Todos', 'Pendente', 'Aprovado', 'Expirado'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${filter === f ? 'bg-neon/10 text-neon' : 'text-zinc-500 hover:text-white'}`}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">Nenhum orçamento encontrado</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const st = STATUS_MAP[o.status] || STATUS_MAP.Pendente;
            const items = o.payload_carrinho || [];
            return (
              <div key={o.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                      <st.icon className="w-3 h-3" /> {o.status}
                    </span>
                    <span className="text-xs text-zinc-500">{new Date(o.criado_em).toLocaleDateString('pt-BR')} {new Date(o.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {o.nome_cliente && <span className="text-xs text-zinc-400">• {o.nome_cliente}</span>}
                  </div>
                  <span className="text-lg font-black text-neon">{formatCurrency(Number(o.valor_total))}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
                  <span>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                  <span>Peso: {o.peso_total} kg</span>
                  <span className="font-mono text-[10px] text-dark-500">{o.id.substring(0, 8)}...</span>
                </div>
                {/* Detail toggle */}
                {detail === o.id && (
                  <div className="bg-dark-900/50 rounded-xl p-3 mb-3 space-y-1">
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-zinc-300">{it.quantidade || it.q}x {it.nome}</span>
                        <span className="text-zinc-500">{formatCurrency((it.preco || 0) * (it.quantidade || it.q || 1))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setDetail(detail === o.id ? null : o.id)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-dark-700 cursor-pointer"><Eye className="w-3 h-3" /> {detail === o.id ? 'Fechar' : 'Detalhes'}</button>
                  <button onClick={() => copyLink(o.id)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-neon px-2 py-1 rounded hover:bg-dark-700 cursor-pointer"><Copy className="w-3 h-3" /> Link</button>
                  {o.status === 'Pendente' && <button onClick={() => changeStatus(o.id, 'Aprovado')} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 cursor-pointer"><CheckCircle2 className="w-3 h-3" /> Aprovar</button>}
                  {o.status === 'Pendente' && <button onClick={() => changeStatus(o.id, 'Expirado')} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer"><XCircle className="w-3 h-3" /> Expirar</button>}
                  <button onClick={() => handleDelete(o.id)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 px-2 py-1 rounded hover:bg-dark-700 cursor-pointer ml-auto"><Trash2 className="w-3 h-3" /> Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
