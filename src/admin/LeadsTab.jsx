import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Loader2, Plus, Phone, User, Search, ChevronDown,
  Flame, Thermometer, Snowflake, ExternalLink, RotateCcw,
  CheckCircle2, MessageCircle, TrendingUp, X
} from 'lucide-react';

/* ─── Constantes ─── */

const MOMENTOS = [
  { value: 'Quero comprar agora',                   label: 'Quero comprar agora',              icon: Flame,        color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  { value: 'Quero comprar em breve (até 30 dias)',  label: 'Comprar em breve (≤30 dias)',       icon: Thermometer,  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  { value: 'Estou comparando opções',               label: 'Comparando opções',                icon: Snowflake,    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  { value: 'Só quero entender melhor o produto',    label: 'Só quero entender o produto',      icon: Snowflake,    color: 'text-zinc-400',   bg: 'bg-zinc-500/10',   border: 'border-zinc-500/30' },
];

const EQUIPAMENTOS = [
  { label: 'Bike Erg',      alias: 'bikeerg' },
  { label: 'Remo',          alias: 'remo'    },
  { label: 'Ski',           alias: 'skierg'  },
  { label: 'Storm Bike',    alias: 'storm'   },
  { label: 'Esteira Curva', alias: 'estcv'   },
  { label: 'Escada',        alias: 'escada'  },
];

const STATUS_PIPELINE = [
  { value: 'novo', label: 'Novo', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
  { value: 'fluxo_disparado', label: 'Fluxo Disparado', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { value: 'link_aberto', label: 'Link Aberto', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { value: 'orcamento_gerado', label: 'Orçamento Gerado', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { value: 'negociando', label: 'Negociando', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { value: 'convertido', label: 'Convertido ✓', color: 'text-neon', bg: 'bg-neon/10', border: 'border-neon/20' },
  { value: 'perdido', label: 'Perdido', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
];

function StatusBadge({ status }) {
  const s = STATUS_PIPELINE.find(p => p.value === status) || STATUS_PIPELINE[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${s.color} ${s.bg} border ${s.border}`}>
      {s.label}
    </span>
  );
}

function MomentoBadge({ momento }) {
  const m = MOMENTOS.find(x => x.value === momento) || { label: momento || 'Não informado', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${m.color} ${m.bg} border ${m.border}`}>
      {m.label}
    </span>
  );
}

/* ─── Funnel metrics ─── */
function FunnelBar({ leads }) {
  const total = leads.length || 1;
  const counts = STATUS_PIPELINE.map(s => ({
    ...s,
    count: leads.filter(l => l.status === s.value).length,
  }));

  return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-neon" /> Pipeline de Leads
      </h3>
      <div className="grid grid-cols-7 gap-2">
        {counts.map(s => (
          <div key={s.value} className="text-center">
            <div className={`text-xl font-black ${s.color}`}>{s.count}</div>
            <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight">{s.label}</div>
            <div className="mt-1.5 h-1 rounded-full bg-dark-700 overflow-hidden">
              <div className={`h-full rounded-full ${s.bg.replace('/10', '/60')}`} style={{ width: `${Math.round((s.count / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Formulário de cadastro ─── */
function CadastroModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    nome: '', telefone: '', email: '',
    momento_compra: MOMENTOS[0].value,
    produtos_interesse: [],
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(null);

  const toggleProduto = (alias) => {
    setForm(prev => ({
      ...prev,
      produtos_interesse: prev.produtos_interesse.includes(alias)
        ? prev.produtos_interesse.filter(p => p !== alias)
        : [...prev.produtos_interesse, alias],
    }));
  };

  const handleSubmit = async () => {
    setErro('');
    if (!form.nome.trim()) return setErro('Informe o nome do lead.');
    if (!form.telefone.trim()) return setErro('Informe o telefone.');
    if (form.produtos_interesse.length === 0) return setErro('Selecione ao menos um produto.');

    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke('cadastrar-lead', {
        body: { ...form, consultor: 'Léo Berg' },
      });

      if (error || data?.error) throw new Error(error?.message || data?.error);

      setSucesso(data);
      onSaved();
    } catch (err) {
      setErro(err.message || 'Erro ao cadastrar lead.');
    } finally {
      setSalvando(false);
    }
  };

  if (sucesso) {
    const linkGerado = `${window.location.origin}/q/${sucesso.codigo}`;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-dark-900 border border-neon/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-neon/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-neon" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Lead cadastrado!</h2>
          <p className="text-sm text-zinc-400 mb-4">
            {sucesso.lead.status === 'fluxo_disparado'
              ? 'O fluxo foi disparado no BotConversa com sucesso.'
              : 'Lead salvo. Configure o webhook BOTCONVERSA_WEBHOOK_NOVO_LEAD para disparar o fluxo automaticamente.'}
          </p>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 mb-5">
            <p className="text-[10px] text-zinc-500 mb-1">Link de orçamento gerado:</p>
            <a href={linkGerado} target="_blank" rel="noreferrer" className="text-xs text-neon font-mono break-all hover:underline">
              {linkGerado}
            </a>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-neon text-dark-950 font-black text-sm hover:bg-neon/90 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-800">
          <h2 className="text-lg font-black text-white">Cadastrar Novo Lead</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Nome + Telefone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nome *</label>
              <input
                type="text"
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: João Silva"
                className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Telefone (WhatsApp) *</label>
              <input
                type="text"
                value={form.telefone}
                onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
                placeholder="Ex: 11999999999"
                className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">E-mail (opcional)</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="lead@email.com"
              className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
            />
          </div>

          {/* Momento de compra */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2">Momento de Compra *</label>
            <div className="grid grid-cols-2 gap-2">
              {MOMENTOS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setForm(p => ({ ...p, momento_compra: m.value }))}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left ${
                    form.momento_compra === m.value
                      ? `${m.color} ${m.bg} ${m.border}`
                      : 'text-zinc-500 bg-dark-800 border-dark-600 hover:border-dark-500'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipamentos de interesse */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2">Equipamentos de Interesse *</label>
            <div className="flex flex-wrap gap-2">
              {EQUIPAMENTOS.map(eq => {
                const selecionado = form.produtos_interesse.includes(eq.alias);
                return (
                  <button
                    key={eq.alias}
                    onClick={() => toggleProduto(eq.alias)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      selecionado
                        ? 'bg-neon/10 text-neon border-neon/30'
                        : 'bg-dark-800 text-zinc-400 border-dark-600 hover:border-dark-500 hover:text-zinc-300'
                    }`}
                  >
                    {selecionado && '✓ '}{eq.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Observações (opcional)</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={3}
              placeholder="Ex: Lead indicado por aluno, tem urgência para agosto..."
              className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{erro}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-dark-600 text-zinc-300 font-bold text-sm hover:bg-dark-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={salvando}
            className="flex-1 py-3 rounded-xl bg-neon text-dark-950 font-black text-sm hover:bg-neon/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Cadastrando...</> : <><MessageCircle className="w-4 h-4" /> Cadastrar e Disparar Fluxo</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab principal ─── */
export default function LeadsTab() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [atualizandoStatus, setAtualizandoStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: leadsData } = await supabase.from('leads').select('*').order('criado_em', { ascending: false });
    setLeads(leadsData || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (lead, novoStatus) => {
    setAtualizandoStatus(lead.id);
    await supabase.from('leads').update({ status: novoStatus }).eq('id', lead.id);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: novoStatus } : l));
    setAtualizandoStatus(null);
  };

  const reenviarFluxo = async (lead) => {
    if (!confirm(`Reenviar fluxo para ${lead.nome}?`)) return;
    setAtualizandoStatus(lead.id);
    await supabase.functions.invoke('cadastrar-lead', {
      body: {
        nome: lead.nome,
        telefone: lead.telefone,
        momento_compra: lead.momento_compra,
        produtos_interesse: lead.produtos_interesse,
        consultor: lead.consultor,
      },
    });
    await load();
    setAtualizandoStatus(null);
  };

  const leadsFiltrados = leads.filter(l => {
    const matchStatus = filtroStatus === 'todos' || l.status === filtroStatus;
    const matchBusca = !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone.includes(busca);
    return matchStatus && matchBusca;
  });

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Gestão de Leads</h1>
          <p className="text-sm text-zinc-400">{leads.length} leads cadastrados</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-neon text-dark-950 font-black text-sm rounded-xl hover:bg-neon/90 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      {/* Funil */}
      {!loading && leads.length > 0 && <FunnelBar leads={leads} />}

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-500"
          />
        </div>
        <div className="relative">
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="appearance-none bg-dark-800 border border-dark-600 text-white text-sm rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:border-neon/50 transition-all cursor-pointer"
          >
            <option value="todos">Todos os status</option>
            {STATUS_PIPELINE.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando leads...
        </div>
      ) : leadsFiltrados.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum lead encontrado</p>
          <p className="text-sm mt-1">Cadastre o primeiro lead clicando em "Novo Lead".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leadsFiltrados.map(lead => (
            <div key={lead.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-dark-600 transition-all">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white text-sm">{lead.nome}</span>
                  <MomentoBadge momento={lead.momento_compra} />
                  <StatusBadge status={lead.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.telefone}</span>
                  <span>{new Date(lead.criado_em).toLocaleDateString('pt-BR')}</span>
                  {lead.consultor && <span>· {lead.consultor}</span>}
                </div>
                {lead.produtos_interesse?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {lead.produtos_interesse.map(p => (
                      <span key={p} className="text-[10px] bg-dark-700 border border-dark-600 text-zinc-400 px-2 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                )}
                {lead.observacoes && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 italic">{lead.observacoes}</p>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Link do orçamento */}
                {lead.link_rapido_codigo && (
                  <a
                    href={`/q/${lead.link_rapido_codigo}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir link de orçamento"
                    className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-neon hover:bg-neon/10 border border-dark-600 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {lead.orcamento_slug && (
                  <a
                    href={`/orcamento/${lead.orcamento_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Ver orçamento gerado"
                    className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 border border-dark-600 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Reenviar fluxo */}
                <button
                  onClick={() => reenviarFluxo(lead)}
                  disabled={atualizandoStatus === lead.id}
                  title="Reenviar fluxo BotConversa"
                  className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 border border-dark-600 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {atualizandoStatus === lead.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                </button>

                {/* Mudar status */}
                <div className="relative">
                  <select
                    value={lead.status}
                    onChange={e => changeStatus(lead, e.target.value)}
                    disabled={atualizandoStatus === lead.id}
                    className="appearance-none bg-dark-700 border border-dark-600 text-zinc-300 text-[11px] font-medium rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-neon/50 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {STATUS_PIPELINE.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de cadastro */}
      {showModal && (
        <CadastroModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
