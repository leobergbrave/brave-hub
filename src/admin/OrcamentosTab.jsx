import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import { Loader2, Eye, Copy, Trash2, CheckCircle2, Clock, XCircle, Edit2, Search, Send, CopyPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_MAP = {
  Pendente: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  Aprovado: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  Expirado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export default function OrcamentosTab() {
  const [orcs, setOrcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('orcamentos_salvos').select('*').order('criado_em', { ascending: false });
    setOrcs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (o, status) => {
    const newPayload = { ...o.payload, status };
    const { error } = await supabase.from('orcamentos_salvos').update({ payload: newPayload }).eq('id', o.id);
    if (error) {
      console.error(error);
      alert("Erro ao atualizar o status: " + error.message);
    }
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este orçamento?')) return;
    const { error } = await supabase.from('orcamentos_salvos').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert("Erro ao excluir: " + error.message);
    }
    setDetail(null);
    load();
  };

  const copyLink = (slug) => {
    navigator.clipboard.writeText(`${window.location.origin}/orcamento/${slug}`);
  };

  const handleGerarBling = async (o) => {
    if (!confirm('Deseja gerar a proposta no Bling para este orçamento?')) return;
    try {
      const { error } = await supabase.functions.invoke('sync-bling-proposal', {
        body: { cliente: o.cliente, consultor: o.consultor, payload: o.payload }
      });
      if (error) throw error;
      alert('Proposta gerada no Bling com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar no Bling: ' + err.message);
    }
  };

  const handleDuplicate = async (o) => {
    if (!confirm('Deseja duplicar este orçamento?')) return;
    try {
      const slugBase = (o.cliente || 'orcamento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugId = Math.random().toString(36).substring(2, 8);
      const slug = `${slugBase}-${slugId}`;

      const novoOrcamento = {
        slug,
        cliente: `${o.cliente} (Cópia)`,
        consultor: o.consultor,
        payload: { ...o.payload, status: 'Pendente' }
      };

      const { error } = await supabase.from('orcamentos_salvos').insert(novoOrcamento);
      if (error) throw error;
      alert('Orçamento duplicado com sucesso!');
      load();
    } catch (err) {
      console.error(err);
      alert('Erro ao duplicar: ' + err.message);
    }
  };

  const filtered = orcs.filter(o => {
    const statusMatch = filter === 'Todos' || (o.payload?.status || 'Pendente') === filter;
    let searchMatch = true;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = o.cliente?.toLowerCase().includes(term);
      const dateStr = new Date(o.criado_em).toLocaleDateString('pt-BR');
      const matchDate = dateStr.includes(term);
      searchMatch = matchName || matchDate;
    }
    return statusMatch && searchMatch;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Orçamentos</h1>
      </div>

      {/* Filter tabs — scrollable on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 no-scrollbar">
        {['Todos', 'Pendente', 'Aprovado', 'Expirado'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${filter === f ? 'bg-neon/10 text-neon' : 'text-zinc-500 hover:text-white'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-zinc-500" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por cliente ou data..."
          className="block w-full pl-10 pr-3 py-2.5 border border-dark-600 rounded-xl bg-dark-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:bg-dark-800 focus:border-neon/50 focus:ring-1 focus:ring-neon/50 text-sm transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</div>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">Nenhum orçamento encontrado</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const statusStr = o.payload?.status || 'Pendente';
            const st = STATUS_MAP[statusStr] || STATUS_MAP.Pendente;
            const items = o.payload?.itens || [];
            const subtotal = items.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
            const peso = items.reduce((acc, i) => acc + ((i.peso_kg || 0) * i.quantidade), 0);
            const dateStr = `${new Date(o.criado_em).toLocaleDateString('pt-BR')} ${new Date(o.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

            return (
              <div key={o.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4">

                {/* Top row: price + status */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${st.bg} ${st.color}`}>
                        <st.icon className="w-3 h-3" /> {statusStr}
                      </span>
                      <span className="text-xs text-zinc-500 shrink-0">{dateStr}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">{o.cliente}</span>
                      <span className="text-xs text-zinc-500 italic shrink-0">({o.consultor})</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black text-neon leading-tight">{formatCurrency(subtotal)}</div>
                    <div className="text-[10px] text-zinc-500">+ frete</div>
                  </div>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 mb-3">
                  <span>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                  <span>Peso: {peso.toFixed(1)} kg</span>
                  {o.payload?.telefoneCliente && <span>Tel: {o.payload.telefoneCliente}</span>}
                  <span className="font-mono text-[10px] text-dark-500">{o.slug}</span>
                </div>

                {/* Detail */}
                {detail === o.id && (
                  <div className="bg-dark-900/50 rounded-xl p-3 mb-3 space-y-1">
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-zinc-300">{it.quantidade}x {it.nome}</span>
                        <span className="text-zinc-500 shrink-0 ml-2">{formatCurrency(it.preco * it.quantidade)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions — wrapping flex */}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setDetail(detail === o.id ? null : o.id)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50">
                    <Eye className="w-3 h-3" /> {detail === o.id ? 'Fechar' : 'Ver'}
                  </button>
                  <button onClick={() => copyLink(o.slug)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-neon px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50">
                    <Copy className="w-3 h-3" /> Link
                  </button>
                  <button onClick={() => navigate(`/?edit=${o.slug}`)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/10 cursor-pointer border border-blue-500/20">
                    <Edit2 className="w-3 h-3" /> Editar
                  </button>
                  <button onClick={() => handleDuplicate(o)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 cursor-pointer border border-indigo-500/20">
                    <CopyPlus className="w-3 h-3" /> Duplicar
                  </button>
                  <button onClick={() => handleGerarBling(o)} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 px-2.5 py-1.5 rounded-lg hover:bg-orange-500/10 cursor-pointer border border-orange-500/20">
                    <Send className="w-3 h-3" /> Bling
                  </button>
                  {statusStr === 'Pendente' && (
                    <button onClick={() => changeStatus(o, 'Aprovado')} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 cursor-pointer border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Aprovar
                    </button>
                  )}
                  {statusStr === 'Pendente' && (
                    <button onClick={() => changeStatus(o, 'Expirado')} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 cursor-pointer border border-red-500/20">
                      <XCircle className="w-3 h-3" /> Expirar
                    </button>
                  )}
                  <button onClick={() => handleDelete(o.id)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50 ml-auto">
                    <Trash2 className="w-3 h-3" /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
