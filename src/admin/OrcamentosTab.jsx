import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import {
  Loader2, Eye, Copy, Trash2, CheckCircle2, Clock, XCircle,
  Edit2, Search, Send, CopyPlus, ChevronRight, MapPin, RefreshCw, Link2, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_MAP = {
  Pendente: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  Aprovado: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  Expirado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

const LEAD_STATUS_ORDER = ['novo', 'fluxo_disparado', 'link_aberto', 'qualificando', 'orcamento_gerado', 'convertido'];

const LEAD_STAGE = {
  novo:             { label: 'Novo',           color: 'bg-zinc-500/10 text-zinc-400' },
  fluxo_disparado:  { label: 'Fluxo enviado',  color: 'bg-blue-500/10 text-blue-400' },
  link_aberto:      { label: 'Link aberto',     color: 'bg-purple-500/10 text-purple-400' },
  qualificando:     { label: 'Qualificando',    color: 'bg-cyan-500/10 text-cyan-400' },
  orcamento_gerado: { label: 'Orç. gerado',     color: 'bg-amber-500/10 text-amber-400' },
  convertido:       { label: 'Convertido',      color: 'bg-emerald-500/10 text-emerald-400' },
};

function isAtLeast(status, target) {
  return LEAD_STATUS_ORDER.indexOf(status) >= LEAD_STATUS_ORDER.indexOf(target);
}

function FunnelBar({ stages }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
      {stages.map((s, i) => {
        const convPct = i > 0 && stages[i - 1].count > 0
          ? Math.round((s.count / stages[i - 1].count) * 100)
          : null;
        return (
          <div key={i} className="flex items-center gap-1.5 shrink-0">
            <div className={`rounded-xl px-4 py-3 text-center min-w-[80px] ${s.bg}`}>
              <p className="text-xl font-black text-white">{s.count}</p>
              <p className={`text-[10px] font-bold leading-tight mt-0.5 ${s.color}`}>{s.label}</p>
              {convPct !== null && (
                <p className="text-[9px] text-zinc-600 mt-1">{convPct}% conv.</p>
              )}
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="w-4 h-4 text-dark-600 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatRow({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {items.map((s, i) => (
        <div key={i} className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-xl font-black ${s.color || 'text-white'}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function OrcamentosTab() {
  const [tab, setTab] = useState('manuais');

  const [orcs, setOrcs] = useState([]);
  const [links, setLinks] = useState([]);
  const [leadsRapidos, setLeadsRapidos] = useState([]);
  const [primeiroContato, setPrimeiroContato] = useState(0);

  const [filter, setFilter] = useState('Todos');
  const [searchManuais, setSearchManuais] = useState('');
  const [searchRapidos, setSearchRapidos] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailRapido, setDetailRapido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkingRapido, setLinkingRapido] = useState(null);
  const [leadsDisponiveis, setLeadsDisponiveis] = useState([]);
  const [searchVincular, setSearchVincular] = useState('');
  const [aprovandoModal, setAprovandoModal] = useState(null);
  const [valorFechado, setValorFechado] = useState('');
  const [filtroSemLead, setFiltroSemLead] = useState(false);

  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: orcsData }, { data: linksData }, { data: leadsData }, { count: contatoCount }, { data: dispData }] = await Promise.all([
      supabase.from('orcamentos_salvos').select('*').order('criado_em', { ascending: false }),
      supabase.from('links_rapidos').select('*').order('criado_em', { ascending: false }),
      supabase.from('leads').select('id, nome, status, link_rapido_codigo, telefone').not('link_rapido_codigo', 'is', null),
      supabase.from('leads').select('*', { count: 'exact', head: true }).neq('status', 'novo'),
      supabase.from('leads').select('id, nome, telefone, status').is('link_rapido_codigo', null).order('criado_em', { ascending: false }),
    ]);
    setOrcs(orcsData || []);
    setLinks(linksData || []);
    setLeadsRapidos(leadsData || []);
    setPrimeiroContato(contatoCount || 0);
    setLeadsDisponiveis(dispData || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Manuais actions ──
  const changeStatus = async (o, status) => {
    const newPayload = { ...o.payload, status };
    await supabase.from('orcamentos_salvos').update({ payload: newPayload }).eq('id', o.id);
    load();
  };

  const confirmarAprovacao = async () => {
    if (!aprovandoModal) return;
    const o = aprovandoModal;
    const valor = parseFloat(valorFechado.replace(',', '.')) || null;
    await supabase.from('orcamentos_salvos')
      .update({ payload: { ...o.payload, status: 'Aprovado' }, valor_fechado: valor, aprovado_em: new Date().toISOString() })
      .eq('id', o.id);
    setAprovandoModal(null);
    setValorFechado('');
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este orçamento?')) return;
    await supabase.from('orcamentos_salvos').delete().eq('id', id);
    setDetail(null);
    load();
  };

  const handleDeleteRapido = async (id) => {
    if (!confirm('Excluir este orçamento rápido?')) return;
    await supabase.from('links_rapidos').delete().eq('id', id);
    load();
  };

  const handleDuplicateRapido = async (l) => {
    if (!confirm('Duplicar este link rápido?')) return;
    const novoCodigo = Math.random().toString(36).substring(2, 10);
    await supabase.from('links_rapidos').insert({
      codigo: novoCodigo,
      nome_lead: l.nome_lead,
      produtos_texto: l.produtos_texto,
    });
    navigator.clipboard.writeText(`${window.location.origin}/orcamento-rapido/${novoCodigo}`);
    alert('Link duplicado e copiado para a área de transferência!');
    load();
  };

  const handleGerarBlingRapido = async (l) => {
    const orc = orcs.find(o => o.slug === l.slug_gerado);
    if (!orc) { alert('Orçamento gerado não encontrado.'); return; }
    if (!confirm('Deseja gerar a proposta no Bling?')) return;
    try {
      const { error } = await supabase.functions.invoke('sync-bling-proposal', {
        body: { cliente: orc.cliente, consultor: orc.consultor, payload: orc.payload },
      });
      if (error) throw error;
      alert('Proposta gerada no Bling com sucesso!');
    } catch (err) { alert('Erro ao gerar no Bling: ' + err.message); }
  };

  const handleVincularLead = async (leadId) => {
    if (!linkingRapido) return;
    await supabase.from('leads').update({ link_rapido_codigo: linkingRapido.codigo }).eq('id', leadId);
    setLinkingRapido(null);
    setSearchVincular('');
    load();
  };

  const handleVincularHistorico = async () => {
    const semLead = links.filter(l => !leadMap[l.codigo] && l.telefone_lead);
    if (!semLead.length) {
      alert('Nenhum link sem vínculo com telefone disponível.');
      return;
    }
    let count = 0;
    for (const l of semLead) {
      const tel = l.telefone_lead.replace(/\D/g, '');
      const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
      const telSemDDI = tel.startsWith('55') ? tel.slice(2) : tel;
      const { data } = await supabase
        .from('leads')
        .select('id')
        .or(`telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI}`)
        .is('link_rapido_codigo', null)
        .limit(1);
      if (data?.length) {
        await supabase.from('leads').update({ link_rapido_codigo: l.codigo }).eq('id', data[0].id);
        count++;
      }
    }
    alert(`${count} de ${semLead.length} leads vinculados.`);
    load();
  };

  const changeStatusRapido = async (l, status) => {
    const orc = orcs.find(o => o.slug === l.slug_gerado);
    if (!orc) return;
    await supabase.from('orcamentos_salvos').update({ payload: { ...orc.payload, status } }).eq('id', orc.id);
    load();
  };

  const copyLink = (slug) => navigator.clipboard.writeText(`${window.location.origin}/orcamento/${slug}`);

  const handleGerarBling = async (o) => {
    if (!confirm('Deseja gerar a proposta no Bling para este orçamento?')) return;
    try {
      const { error } = await supabase.functions.invoke('sync-bling-proposal', {
        body: { cliente: o.cliente, consultor: o.consultor, payload: o.payload },
      });
      if (error) throw error;
      alert('Proposta gerada no Bling com sucesso!');
    } catch (err) { alert('Erro ao gerar no Bling: ' + err.message); }
  };

  const handleDuplicate = async (o) => {
    if (!confirm('Deseja duplicar este orçamento?')) return;
    try {
      const slugBase = (o.cliente || 'orcamento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
      await supabase.from('orcamentos_salvos').insert({
        slug, cliente: `${o.cliente} (Cópia)`, consultor: o.consultor,
        payload: { ...o.payload, status: 'Pendente' },
      });
      alert('Orçamento duplicado com sucesso!');
      load();
    } catch (err) { alert('Erro ao duplicar: ' + err.message); }
  };

  // ── Manuais metrics ──
  const totalManuais = orcs.length;
  const mAprovados  = orcs.filter(o => (o.payload?.status || 'Pendente') === 'Aprovado').length;
  const mPendentes  = orcs.filter(o => (o.payload?.status || 'Pendente') === 'Pendente').length;
  const mAbertos    = orcs.filter(o => o.aberto).length;
  const mValorAprovado = orcs
    .filter(o => (o.payload?.status || 'Pendente') === 'Aprovado')
    .reduce((acc, o) => {
      const v = o.valor_fechado != null
        ? o.valor_fechado
        : (o.payload?.itens || []).reduce((s, i) => s + i.preco * i.quantidade, 0);
      return acc + v;
    }, 0);

  const manuaisFunnel = [
    { label: 'Criados',   count: totalManuais, bg: 'bg-dark-800',        color: 'text-zinc-400' },
    { label: 'Abertos',   count: mAbertos,     bg: 'bg-purple-500/10',   color: 'text-purple-400' },
    { label: 'Aprovados', count: mAprovados,   bg: 'bg-emerald-500/10',  color: 'text-emerald-400' },
  ];

  const manuaisStats = [
    { label: 'Total',          value: totalManuais,                 color: 'text-white' },
    { label: 'Pendentes',      value: mPendentes,                   color: 'text-amber-400' },
    { label: 'Aprovados',      value: mAprovados,                   color: 'text-emerald-400' },
    { label: 'Total Fechado',  value: formatCurrency(mValorAprovado), color: 'text-neon' },
  ];

  // ── Rápidos metrics ──
  const leadMap = Object.fromEntries(leadsRapidos.map(l => [l.link_rapido_codigo, l]));

  const rAbertos = links.filter(l => l.aberto).length;
  const rCep     = links.filter(l => l.cep_digitado).length;
  const rConv    = links.filter(l => {
    if (!l.slug_gerado) return false;
    const orc = orcs.find(o => o.slug === l.slug_gerado);
    return orc?.payload?.status === 'Aprovado';
  }).length;
  const txAbertura = links.length > 0 ? Math.round((rAbertos / links.length) * 100) : 0;
  const txConv     = primeiroContato > 0 ? Math.round((rConv / primeiroContato) * 100) : 0;

  const rapidosFunnel = [
    { label: '1º Contato',   count: primeiroContato, bg: 'bg-dark-800',        color: 'text-zinc-400' },
    { label: 'Orç. Gerado',  count: links.length,    bg: 'bg-blue-500/10',     color: 'text-blue-400' },
    { label: 'Link Aberto',  count: rAbertos,        bg: 'bg-purple-500/10',   color: 'text-purple-400' },
    { label: 'CEP Digitado', count: rCep,            bg: 'bg-cyan-500/10',     color: 'text-cyan-400' },
    { label: 'Convertido',   count: rConv,           bg: 'bg-emerald-500/10',  color: 'text-emerald-400' },
  ];

  const rapidosStats = [
    { label: '1º Contato',   value: primeiroContato,  color: 'text-white' },
    { label: 'Orç. Gerado',  value: links.length,     color: 'text-blue-400' },
    { label: 'CEP Digitado', value: rCep,             color: 'text-cyan-400' },
    { label: 'Convertido',   value: `${txConv}%`,     color: 'text-emerald-400' },
  ];

  // ── Filtered lists ──
  const filteredManuais = orcs.filter(o => {
    const statusOk = filter === 'Todos' || (o.payload?.status || 'Pendente') === filter;
    if (!searchManuais) return statusOk;
    const t = searchManuais.toLowerCase();
    return statusOk && (o.cliente?.toLowerCase().includes(t) || new Date(o.criado_em).toLocaleDateString('pt-BR').includes(t));
  });

  const semLeadCount = links.filter(l => !leadMap[l.codigo]).length;

  const filteredRapidos = links.filter(l => {
    if (filtroSemLead && leadMap[l.codigo]) return false;
    if (!searchRapidos) return true;
    const t = searchRapidos.toLowerCase();
    const ld = leadMap[l.codigo];
    return l.nome_lead?.toLowerCase().includes(t)
      || l.produtos_texto?.toLowerCase().includes(t)
      || ld?.nome?.toLowerCase().includes(t);
  });

  const leadsVincularFiltrados = leadsDisponiveis.filter(ld => {
    const t = searchVincular.toLowerCase();
    return !t || ld.nome?.toLowerCase().includes(t) || ld.telefone?.includes(t);
  });

  return (
    <div>
      {/* Modal Aprovar */}
      {aprovandoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-white font-bold text-base mb-1">Confirmar Aprovação</h3>
            <p className="text-xs text-zinc-500 mb-5">{aprovandoModal.cliente}</p>
            <div className="bg-dark-800/60 rounded-xl p-3 mb-5 flex justify-between items-center">
              <span className="text-xs text-zinc-500">Valor do orçamento</span>
              <span className="text-sm font-bold text-white">
                {formatCurrency((aprovandoModal.payload?.itens || []).reduce((acc, i) => acc + i.preco * i.quantidade, 0))}
              </span>
            </div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2">Valor real de fechamento (R$)</label>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={valorFechado}
              onChange={e => setValorFechado(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmarAprovacao()}
              placeholder="Ex: 1.250,00"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-zinc-300 placeholder-zinc-500 text-sm focus:outline-none focus:border-neon/50 mb-5"
            />
            <div className="flex gap-2">
              <button onClick={() => setAprovandoModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white bg-dark-800 hover:bg-dark-700 transition-colors cursor-pointer">
                Cancelar
              </button>
              <button onClick={confirmarAprovacao} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors cursor-pointer">
                Confirmar Aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular Lead */}
      {linkingRapido && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold text-sm">Vincular Lead</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{linkingRapido.nome_lead} · {linkingRapido.produtos_texto}</p>
              </div>
              <button onClick={() => { setLinkingRapido(null); setSearchVincular(''); }} className="text-zinc-500 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={searchVincular}
                onChange={e => setSearchVincular(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full pl-9 pr-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-zinc-300 placeholder-zinc-500 text-sm focus:outline-none focus:border-neon/50"
              />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {leadsVincularFiltrados.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6">Nenhum lead disponível</p>
              ) : leadsVincularFiltrados.map(ld => {
                const st = LEAD_STAGE[ld.status];
                return (
                  <button key={ld.id} onClick={() => handleVincularLead(ld.id)}
                    className="w-full text-left p-3 rounded-xl bg-dark-800 hover:bg-dark-700 transition-colors border border-dark-700/50 cursor-pointer">
                    <p className="text-sm font-semibold text-white">{ld.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500">{ld.telefone}</span>
                      {st && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Orçamentos</h1>
        <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 mb-6 bg-dark-800/40 p-1 rounded-xl w-fit">
        {[['manuais', 'Manuais'], ['rapidos', 'Rápidos']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${tab === id ? 'bg-dark-700 text-white' : 'text-zinc-500 hover:text-white'}`}>
            {label}
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? 'bg-neon/20 text-neon' : 'bg-dark-700 text-zinc-500'}`}>
              {id === 'manuais' ? orcs.length : links.length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : tab === 'manuais' ? (

        /* ══════════════ MANUAIS ══════════════ */
        <div>
          {/* Funil */}
          <div className="bg-dark-800/40 border border-dark-700/40 rounded-2xl p-4 mb-5">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Funil de conversão</p>
            <FunnelBar stages={manuaisFunnel} />
          </div>

          {/* Stats */}
          <StatRow items={manuaisStats} />

          {/* Filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 no-scrollbar">
            {['Todos', 'Pendente', 'Aprovado', 'Expirado'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${filter === f ? 'bg-neon/10 text-neon' : 'text-zinc-500 hover:text-white'}`}>
                {f}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mb-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input type="text" value={searchManuais} onChange={e => setSearchManuais(e.target.value)}
              placeholder="Buscar por cliente ou data..."
              className="block w-full pl-10 pr-3 py-2.5 border border-dark-600 rounded-xl bg-dark-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/50 text-sm transition-all" />
          </div>

          {filteredManuais.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">Nenhum orçamento encontrado</p>
          ) : (
            <div className="space-y-3">
              {filteredManuais.map(o => {
                const statusStr = o.payload?.status || 'Pendente';
                const st = STATUS_MAP[statusStr] || STATUS_MAP.Pendente;
                const items = o.payload?.itens || [];
                const subtotal = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
                const peso = items.reduce((acc, i) => acc + (i.peso_kg || 0) * i.quantidade, 0);
                const dateStr = `${new Date(o.criado_em).toLocaleDateString('pt-BR')} ${new Date(o.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

                return (
                  <div key={o.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${st.bg} ${st.color}`}>
                            <st.icon className="w-3 h-3" /> {statusStr}
                          </span>
                          {o.aberto && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-semibold shrink-0">Visualizado</span>
                          )}
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

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 mb-3">
                      <span>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                      <span>Peso: {peso.toFixed(1)} kg</span>
                      {o.payload?.telefoneCliente && <span>Tel: {o.payload.telefoneCliente}</span>}
                      <span className="font-mono text-[10px] text-dark-500">{o.slug}</span>
                    </div>

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
                        <button onClick={() => { setAprovandoModal(o); setValorFechado(''); }} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 cursor-pointer border border-emerald-500/20">
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

      ) : (

        /* ══════════════ RÁPIDOS ══════════════ */
        <div>
          {/* Funil */}
          <div className="bg-dark-800/40 border border-dark-700/40 rounded-2xl p-4 mb-5">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Funil de conversão</p>
            <FunnelBar stages={rapidosFunnel} />
          </div>

          {/* Stats */}
          <StatRow items={rapidosStats} />

          {/* Search + filtros */}
          <div className="flex gap-2 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input type="text" value={searchRapidos} onChange={e => setSearchRapidos(e.target.value)}
                placeholder="Buscar por lead ou produto..."
                className="block w-full pl-10 pr-3 py-2.5 border border-dark-600 rounded-xl bg-dark-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/50 text-sm transition-all" />
            </div>
            <button onClick={() => setFiltroSemLead(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border cursor-pointer whitespace-nowrap transition-colors ${filtroSemLead ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-dark-800 text-zinc-400 hover:text-white border-dark-600'}`}>
              Sem lead {semLeadCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${filtroSemLead ? 'bg-red-500/30' : 'bg-dark-700'}`}>{semLeadCount}</span>}
            </button>
            <button onClick={handleVincularHistorico}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 cursor-pointer whitespace-nowrap transition-colors">
              <Link2 className="w-3.5 h-3.5" /> Vincular histórico
            </button>
          </div>

          {filteredRapidos.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">Nenhum orçamento rápido encontrado</p>
          ) : (
            <div className="space-y-3">
              {filteredRapidos.map(l => {
                const lead = leadMap[l.codigo];
                const stage = lead ? (LEAD_STAGE[lead.status] || LEAD_STAGE.novo) : null;
                const dateStr = `${new Date(l.criado_em).toLocaleDateString('pt-BR')} ${new Date(l.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                const nomeExibido = lead?.nome || l.nome_lead || '—';
                const tel = lead?.telefone || '';
                const orcGerado = l.slug_gerado ? orcs.find(o => o.slug === l.slug_gerado) : null;
                const statusGerado = orcGerado?.payload?.status || 'Pendente';

                return (
                  <div key={l.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {stage ? (
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${stage.color}`}>
                              {stage.label}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 shrink-0">
                              Sem lead
                            </span>
                          )}
                          {l.cep_digitado && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 shrink-0 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> CEP
                            </span>
                          )}
                          {l.slug_gerado && (
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${STATUS_MAP[statusGerado]?.bg || 'bg-amber-400/10'} ${STATUS_MAP[statusGerado]?.color || 'text-amber-400'}`}>
                              {statusGerado}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 shrink-0">{dateStr}</span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate">{nomeExibido}</p>
                        {tel && <p className="text-xs text-zinc-500">{tel}</p>}
                      </div>
                    </div>

                    <div className="bg-dark-900/50 rounded-lg px-3 py-2 text-xs text-zinc-400 mb-3">
                      {l.produtos_texto}
                    </div>

                    {detailRapido === l.id && (
                      <div className="bg-dark-900/50 rounded-xl p-3 mb-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Código do link</span>
                          <span className="text-zinc-300 font-mono">{l.codigo}</span>
                        </div>
                        {l.slug_gerado && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Orçamento gerado</span>
                            <span className="text-zinc-300 font-mono">{l.slug_gerado}</span>
                          </div>
                        )}
                        {lead && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Status do lead</span>
                            <span className={`font-semibold ${stage?.color || 'text-zinc-400'}`}>{stage?.label || lead.status}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-zinc-500">CEP digitado</span>
                          <span className="text-zinc-300">{l.cep_digitado ? 'Sim' : 'Não'}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 border-t border-dark-700/50 pt-3">
                      <button onClick={() => setDetailRapido(detailRapido === l.id ? null : l.id)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50">
                        <Eye className="w-3 h-3" /> {detailRapido === l.id ? 'Fechar' : 'Ver'}
                      </button>
                      <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/orcamento-rapido/${l.codigo}`)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-neon px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50">
                        <Copy className="w-3 h-3" /> Link
                      </button>
                      {!lead && (
                        <button onClick={() => setLinkingRapido(l)} className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 px-2.5 py-1.5 rounded-lg hover:bg-yellow-500/10 cursor-pointer border border-yellow-500/20">
                          <Link2 className="w-3 h-3" /> Vincular Lead
                        </button>
                      )}
                      <button onClick={() => handleDuplicateRapido(l)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 cursor-pointer border border-indigo-500/20">
                        <CopyPlus className="w-3 h-3" /> Duplicar
                      </button>
                      {l.slug_gerado && (
                        <>
                          <button onClick={() => navigate(`/?edit=${l.slug_gerado}`)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/10 cursor-pointer border border-blue-500/20">
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                          <a href={`/orcamento/${l.slug_gerado}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-neon hover:text-green-300 px-2.5 py-1.5 rounded-lg hover:bg-neon/10 cursor-pointer border border-neon/20">
                            <Eye className="w-3 h-3" /> Ver Gerado
                          </a>
                          <button onClick={() => handleGerarBlingRapido(l)} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 px-2.5 py-1.5 rounded-lg hover:bg-orange-500/10 cursor-pointer border border-orange-500/20">
                            <Send className="w-3 h-3" /> Bling
                          </button>
                          {statusGerado === 'Pendente' && (
                            <button onClick={() => { if (orcGerado) { setAprovandoModal(orcGerado); setValorFechado(''); } }} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 cursor-pointer border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Aprovar
                            </button>
                          )}
                          {statusGerado === 'Pendente' && (
                            <button onClick={() => changeStatusRapido(l, 'Expirado')} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 cursor-pointer border border-red-500/20">
                              <XCircle className="w-3 h-3" /> Expirar
                            </button>
                          )}
                        </>
                      )}
                      <button onClick={() => handleDeleteRapido(l.id)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-dark-700 cursor-pointer border border-dark-700/50 ml-auto">
                        <Trash2 className="w-3 h-3" /> Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
