import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Search, Phone, Mail, MapPin, CreditCard, Building2, User,
  ChevronDown, ChevronUp, RefreshCw, Loader2, ExternalLink, Edit3,
  CheckCircle2, ShoppingBag, X, Check, MessageSquare, Download, AlertCircle, Heart,
  Send, FileCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';

const TIPOS_NEGOCIO = [
  { v: 'box',        label: 'Box / CrossFit', emoji: '🥊', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { v: 'academia',   label: 'Academia',        emoji: '🏋️', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { v: 'studio',     label: 'Studio',          emoji: '💠', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { v: 'clube',      label: 'Clube',           emoji: '🌿', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  { v: 'uso_proprio',label: 'Uso Próprio',     emoji: '🏠', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { v: 'outro',      label: 'Outro',           emoji: '❓', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
];

const ORIGENS = [
  { v: 'cadastro_web',       label: 'Cadastro Web',    color: 'text-purple-400 bg-purple-500/10' },
  { v: 'orcamento_aprovado', label: 'Compra Aprovada', color: 'text-green-400 bg-green-500/10' },
  { v: 'bling',              label: 'Bling',           color: 'text-orange-400 bg-orange-500/10' },
  { v: 'fiscal_form',        label: 'Form NF-e',       color: 'text-blue-400 bg-blue-500/10' },
  { v: 'manual',             label: 'Manual',          color: 'text-zinc-400 bg-zinc-500/10' },
];

function getTipoNegocio(v) {
  return TIPOS_NEGOCIO.find(t => t.v === v) || { label: v || '—', emoji: '❓', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' };
}
function getOrigem(v) {
  return ORIGENS.find(o => o.v === v) || { label: v || 'Desconhecido', color: 'text-zinc-400 bg-zinc-500/10' };
}

function fmtTel(t) {
  if (!t) return '';
  const n = String(t).replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return t;
}
function fmtData(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function whatsappLink(tel) {
  const n = String(tel || '').replace(/\D/g, '');
  const num = n.startsWith('55') ? n : `55${n}`;
  return `https://wa.me/${num}`;
}

function OrcItem({ o, sel, onSelect, vinculado = false, calcTotal }) {
  const total = calcTotal(o);
  const itensNomes = (o.payload?.itens || []).map(i => i.nome).filter(Boolean).join(', ');
  return (
    <button type="button"
      onClick={() => onSelect(sel ? null : o)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer text-left ${
        sel ? 'border-orange-500 bg-orange-500/10' : 'border-dark-600/60 bg-dark-800/30 hover:border-dark-500 hover:bg-dark-800/60'
      }`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-white truncate">{o.cliente || o.slug}</p>
          {vinculado && <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1 rounded shrink-0">vinculado</span>}
          {o.bling_pedido_id && <span className="text-[9px] text-zinc-600 shrink-0">Proposta ✓</span>}
        </div>
        <p className="text-[10px] text-zinc-600 truncate">{itensNomes || '—'} · {new Date(o.criado_em).toLocaleDateString('pt-BR')}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-bold text-neon">{total > 0 ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</span>
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'border-orange-500 bg-orange-500' : 'border-zinc-600'}`}>
          {sel && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
      </div>
    </button>
  );
}

export default function ClientesTab({ onNavigate }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [expandedId, setExpandedId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [orcamentosCliente, setOrcamentosCliente] = useState({});

  // Importação histórica do Bling — fluxo multi-etapa
  const [importModal, setImportModal] = useState(false);
  const [importStep, setImportStep] = useState('inicial');
  const [diasImport, setDiasImport] = useState(90);
  const [situacoesDisponiveis, setSituacoesDisponiveis] = useState([]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState(new Set([9, 15]));
  const [carregandoStatus, setCarregandoStatus] = useState(false);
  const [vendedoresBling, setVendedoresBling] = useState([]); // lista real de vendedores
  const [idVendedorSelecionado, setIdVendedorSelecionado] = useState(null); // ID do vendedor selecionado
  const [blingVendedores, setBlingVendedores] = useState([]);
  const [vendedoresSelecionados, setVendedoresSelecionados] = useState(new Set());
  const [buscandoPreview, setBuscandoPreview] = useState(false);
  const [importando, setImportando] = useState(false);
  const [limpando, setLimpando] = useState(false);

  // Diagnóstico Bling — inspecionar contato
  const [diagModal, setDiagModal] = useState(null); // dados retornados
  const [diagLoading, setDiagLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Envio para Bling — fluxo modal
  const [blingEnvioModal, setBlingEnvioModal] = useState(null); // { cliente }
  const [blingEnvioStep, setBlingEnvioStep] = useState('select'); // select | preview | sending | done
  const [orcEnvioSelecionado, setOrcEnvioSelecionado] = useState(null);
  const [filtroOrcModal, setFiltroOrcModal] = useState('');
  const [orcsRecentes, setOrcsRecentes] = useState([]);
  const [carregandoOrcsRecentes, setCarregandoOrcsRecentes] = useState(false);
  const [enviandoBling, setEnviandoBling] = useState(false);
  const [blingEnvioResult, setBlingEnvioResult] = useState(null);

  // cores por nome de status
  function corSituacao(nome) {
    const n = (nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.includes('atendido')) return { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' };
    if (n.includes('verificado')) return { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' };
    if (n.includes('andamento')) return { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    if (n.includes('cancelado') || n.includes('devolvido')) return { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
    if (n.includes('aprovado')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    return { color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/30' };
  }

  function toggleSituacao(id) {
    setSituacoesSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Status conhecidos do Bling (fallback se a API não retornar)
  const SITUACOES_PADRAO = [
    { id: 9,  nome: 'Atendido',       total: null },
    { id: 15, nome: 'Verificado',     total: null },
    { id: 6,  nome: 'Em aberto',      total: null },
    { id: 12, nome: 'Em andamento',   total: null },
    { id: 21, nome: 'Cancelado',      total: null },
    { id: 24, nome: 'Devolvido',      total: null },
    { id: 3,  nome: 'Aprovado',       total: null },
    { id: 1,  nome: 'Pendente',       total: null },
  ];

  async function handleCarregarStatus() {
    setCarregandoStatus(true);
    setSituacoesDisponiveis([]);
    setSituacoesSelecionadas(new Set([9, 15]));
    setVendedoresBling([]);
    setIdVendedorSelecionado(null);
    try {
      // Buscar vendedores primeiro (token fresco), depois status
      const resVend = await fetch('/api/importar-clientes-bling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'usuarios', dias_atras: diasImport }),
      });
      const dataVend = await resVend.json();
      if (dataVend.ok) setVendedoresBling(dataVend.vendedores || []);

      // Depois busca status
      const resStatus = await fetch('/api/importar-clientes-bling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'status', dias_atras: diasImport }),
      });
      const dataStatus = await resStatus.json();
      if (dataStatus.ok && dataStatus.situacoes?.length > 0) {
        setSituacoesDisponiveis(dataStatus.situacoes);
        // Manter seleção atual que já tem [9,15]
        const autoSel = new Set(
          dataStatus.situacoes.filter(s => [9, 15].includes(s.id)).map(s => s.id)
        );
        if (autoSel.size > 0) setSituacoesSelecionadas(autoSel);
      } else {
        // Usa status padrão como fallback
        setSituacoesDisponiveis(SITUACOES_PADRAO);
      }
    } catch (e) {
      setSituacoesDisponiveis(SITUACOES_PADRAO);
      setImportResult({ ok: false, mensagem: `⚠️ Erro ao carregar do Bling. Usando status padrão.` });
    } finally {
      setCarregandoStatus(false);
    }
  }

  function abrirImportModal() {
    setImportModal(true);
    setImportStep('inicial');
    setBlingVendedores([]);
    setVendedoresSelecionados(new Set());
    // Pré-popular com status padrão para o botão estar sempre habilitado
    setSituacoesDisponiveis(SITUACOES_PADRAO);
    setSituacoesSelecionadas(new Set([9, 15]));
    setVendedoresBling([]);
    setIdVendedorSelecionado(null);
    setImportResult(null);
  }

  async function handlePreviewBling() {
    setBuscandoPreview(true);
    try {
      const res = await fetch('/api/importar-clientes-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preview',
          dias_atras: diasImport,
          situacoes: [...situacoesSelecionadas],
          idVendedor: idVendedorSelecionado,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBlingVendedores([{
          nome: 'Resumo da importação',
          pedidos: data.totalPedidosAnalisados,
          clientes: data.totalClientesUnicos || data.vendedores?.reduce((acc, v) => acc + v.clientes, 0) || 0,
          detalhe: data.vendedores || [],
        }]);
        setImportStep('preview');
      } else {
        setImportResult({ ok: false, mensagem: `❌ ${data.error}` });
      }
    } catch (e) {
      setImportResult({ ok: false, mensagem: `❌ Erro de conexão: ${e.message}` });
    } finally {
      setBuscandoPreview(false);
    }
  }

  async function handleImportarBling() {
    setImportando(true);
    setImportStep('import');
    setImportResult(null);
    try {
      const res = await fetch('/api/importar-clientes-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'import',
          dias_atras: diasImport,
          situacoes: [...situacoesSelecionadas],
          idVendedor: idVendedorSelecionado,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setImportResult({
          ok: true,
          mensagem: `✅ Concluído! ${data.criados} clientes criados · ${data.atualizados} atualizados · ${data.totalClientes} contatos únicos (${data.totalPedidos} pedidos)`,
        });
        setImportStep('done');
        fetchClientes();
      } else {
        setImportResult({ ok: false, mensagem: `❌ Erro: ${data.error}` });
        setImportStep('preview');
      }
    } catch (e) {
      setImportResult({ ok: false, mensagem: `❌ Erro de conexão: ${e.message}` });
      setImportStep('preview');
    } finally {
      setImportando(false);
    }
  }

  async function handleLimparBling() {
    if (!confirm('Tem certeza que deseja apagar todos os clientes importados do Bling? Essa ação não pode ser desfeita.')) return;
    setLimpando(true);
    try {
      const res = await fetch('/api/importar-clientes-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'limpar' }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ ${data.deletados} cliente(s) removido(s) do Bling.`);
        fetchClientes();
      } else {
        alert(`❌ Erro: ${data.error}`);
      }
    } catch (e) {
      alert(`❌ Erro: ${e.message}`);
    } finally {
      setLimpando(false);
    }
  }

  // ── Helpers envio Bling ───────────────────────────────────────────────────────

  function calcTotalOrc(orc) {
    const itens = orc.payload?.itens || [];
    const totalItens = itens.reduce((acc, i) => {
      const preco = i.p ?? i.preco ?? 0;
      const qty = i.q ?? i.quantidade ?? 0;
      return acc + preco * qty;
    }, 0);
    return totalItens + (orc.payload?.frete || 0);
  }

  async function abrirBlingEnvio(cliente, orcPre = null) {
    setBlingEnvioModal({ cliente });
    setBlingEnvioStep('select');
    setOrcEnvioSelecionado(orcPre);
    setFiltroOrcModal('');
    setOrcsRecentes([]);
    setBlingEnvioResult(null);
    if (!orcamentosCliente[cliente.id]) {
      fetchOrcamentosCliente(cliente.id, cliente.telefone, cliente.cpf_cnpj);
    }
    // Carregar orçamentos recentes do sistema para navegação
    setCarregandoOrcsRecentes(true);
    try {
      const { data } = await supabase
        .from('orcamentos_salvos')
        .select('id, slug, cliente, criado_em, aprovado_em, payload, bling_pedido_id')
        .order('criado_em', { ascending: false })
        .limit(50);
      setOrcsRecentes(data || []);
    } finally {
      setCarregandoOrcsRecentes(false);
    }
  }

  async function inspecionarContato(cpfCnpj) {
    setDiagLoading(true);
    setDiagModal(null);
    try {
      const res = await fetch('/api/importar-clientes-bling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'inspecionar-contato', cpfCnpj }),
      });
      setDiagModal(await res.json());
    } catch (e) {
      setDiagModal({ ok: false, error: e.message });
    } finally {
      setDiagLoading(false);
    }
  }

  async function handleEnviarBling() {
    if (!blingEnvioModal || !orcEnvioSelecionado) return;
    setBlingEnvioStep('sending');
    setEnviandoBling(true);
    setBlingEnvioResult(null);
    try {
      const res = await fetch('/api/enviar-bling-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: blingEnvioModal.cliente.id,
          orcamentoSlug: orcEnvioSelecionado.slug,
        }),
      });
      const data = await res.json();
      setBlingEnvioResult(data);
      setBlingEnvioStep('done');
    } catch (e) {
      setBlingEnvioResult({ ok: false, error: e.message });
      setBlingEnvioStep('done');
    } finally {
      setEnviandoBling(false);
    }
  }

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('atualizado_em', { ascending: false });
    if (!error && data) setClientes(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const fetchOrcamentosCliente = async (clienteId, telefone, cpfCnpj) => {
    if (orcamentosCliente[clienteId]) return;
    const queries = [];
    if (telefone) queries.push(supabase.from('orcamentos_salvos').select('id, slug, cliente, criado_em, aprovado_em, payload').eq('payload->>telefoneCliente', telefone.replace(/\D/g, '')));
    if (cpfCnpj) queries.push(supabase.from('orcamentos_salvos').select('id, slug, cliente, criado_em, aprovado_em, payload').eq('cliente_id', clienteId));
    const results = await Promise.all(queries);
    const todos = results.flatMap(r => r.data || []);
    const unique = [...new Map(todos.map(o => [o.id, o])).values()];
    setOrcamentosCliente(prev => ({ ...prev, [clienteId]: unique }));
  };



  const filtrados = useMemo(() => {
    return clientes.filter(c => {
      const q = busca.toLowerCase();
      const matchBusca = !q
        || (c.nome || '').toLowerCase().includes(q)
        || (c.telefone || '').includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.cpf_cnpj || '').includes(q.replace(/\D/g, ''));
      const matchTipo = filtroTipo === 'todos' || c.tipo_negocio === filtroTipo;
      const matchOrigem = filtroOrigem === 'todos' || c.origem === filtroOrigem;
      return matchBusca && matchTipo && matchOrigem;
    });
  }, [clientes, busca, filtroTipo, filtroOrigem]);

  const iniciarEdicao = (c) => {
    setEditandoId(c.id);
    setEditForm({ nome: c.nome || '', telefone: c.telefone || '', email: c.email || '', tipo_negocio: c.tipo_negocio || '' });
  };

  const salvarEdicao = async (id) => {
    setSalvando(true);
    await supabase.from('clientes').update({
      nome: editForm.nome,
      telefone: (editForm.telefone || '').replace(/\D/g, ''),
      email: editForm.email,
      tipo_negocio: editForm.tipo_negocio,
      atualizado_em: new Date().toISOString(),
    }).eq('id', id);
    setSalvando(false);
    setEditandoId(null);
    fetchClientes();
  };

  const toggleExpand = (c) => {
    const isOpening = expandedId !== c.id;
    setExpandedId(isOpening ? c.id : null);
    if (isOpening) fetchOrcamentosCliente(c.id, c.telefone, c.cpf_cnpj);
  };

  const totalClientes = clientes.length;
  const totalGasto = clientes.reduce((acc, c) => acc + (parseFloat(c.total_gasto) || 0), 0);
  const compradores = clientes.filter(c => (c.total_compras || 0) > 0).length;

  const inputCls = 'bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-neon/50 transition-colors w-full';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Clientes</h1>
          <p className="text-xs text-zinc-500 mt-0.5">CRM de clientes — compras e cadastros</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={abrirImportModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            Importar do Bling
          </button>
          <button onClick={fetchClientes} disabled={loading}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-dark-800/40 border border-dark-700/30 rounded-2xl p-4 text-xs text-zinc-500 leading-relaxed">
        <strong className="text-zinc-300">Aba CLIENTES</strong> — Centraliza todos os clientes que realizaram uma compra aprovada ou fizeram cadastro pelo formulário público.
        Os dados são preenchidos automaticamente ao aprovar um orçamento, ao receber um cadastro web ou ao importar pedidos do Bling.
        <br />Use <strong className="text-orange-400">"Importar do Bling"</strong> para trazer o histórico dos últimos 90 dias de uma vez. Use os filtros abaixo para segmentar por tipo de negócio ou origem.
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Clientes', value: totalClientes, icon: Users, color: 'text-blue-400' },
          { label: 'Compradores', value: compradores, icon: ShoppingBag, color: 'text-green-400' },
          { label: 'Faturamento Total', value: formatCurrency(totalGasto), icon: CheckCircle2, color: 'text-neon' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-dark-800/60 border border-dark-700/40 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
            </div>
            <p className={`text-lg font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, CPF..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-zinc-600 outline-none focus:border-neon/50"
          />
          {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-600 rounded-xl text-sm text-zinc-300 outline-none focus:border-neon/50 cursor-pointer">
          <option value="todos">Todos os tipos</option>
          {TIPOS_NEGOCIO.map(t => <option key={t.v} value={t.v}>{t.emoji} {t.label}</option>)}
        </select>
        <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}
          className="px-3 py-2 bg-dark-800 border border-dark-600 rounded-xl text-sm text-zinc-300 outline-none focus:border-neon/50 cursor-pointer">
          <option value="todos">Todas as origens</option>
          {ORIGENS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin text-neon" />
          <span className="text-sm">Carregando clientes...</span>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-20 bg-dark-800/30 rounded-2xl border border-dark-700/30">
          <Users className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Nenhum cliente encontrado</p>
          {!busca && (
            <div className="mt-4">
              <p className="text-xs text-dark-600 mb-3">Importe o histórico do Bling para começar</p>
              <button onClick={() => { setImportModal(true); setImportResult(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 cursor-pointer transition-colors">
                <Download className="w-4 h-4" /> Importar Histórico do Bling
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-zinc-600">{filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}</p>
          {filtrados.map(c => {
            const expanded = expandedId === c.id;
            const editando = editandoId === c.id;
            const tipo = getTipoNegocio(c.tipo_negocio);
            const origem = getOrigem(c.origem);
            const df = c.dados_fiscais || {};
            const temEndereco = df.logradouro && df.cidade;
            const orcs = orcamentosCliente[c.id];

            return (
              <div key={c.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-dark-700/20 transition-colors"
                  onClick={() => !editando && toggleExpand(c)}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-500/30 border border-orange-500/20 flex items-center justify-center text-sm font-black text-orange-400 shrink-0">
                    {(c.nome || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editando ? (
                        <input value={editForm.nome} onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          className="text-sm font-bold bg-dark-700 border border-neon/30 rounded-lg px-2 py-0.5 text-white outline-none w-48" />
                      ) : (
                        <p className="text-sm font-bold text-white truncate">{c.nome}</p>
                      )}
                      {c.tipo_negocio && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tipo.color} flex-shrink-0`}>
                          {tipo.emoji} {tipo.label}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${origem.color} flex-shrink-0`}>
                        {origem.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.telefone && <span className="text-[11px] text-zinc-500">{fmtTel(c.telefone)}</span>}
                      {c.email && <span className="text-[11px] text-zinc-600 truncate max-w-[160px]">{c.email}</span>}
                      <span className="text-[10px] text-zinc-600">Desde {fmtData(c.criado_em)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    {(c.total_compras || 0) > 0 ? (
                      <>
                        <p className="text-sm font-black text-neon">{formatCurrency(parseFloat(c.total_gasto) || 0)}</p>
                        <p className="text-[10px] text-zinc-500">{c.total_compras} compra{c.total_compras !== 1 ? 's' : ''}</p>
                      </>
                    ) : (
                      <p className="text-[10px] text-zinc-600">Sem compras</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {(c.total_compras || 0) > 0 && onNavigate && (
                      <button
                        onClick={() => onNavigate('posvendas')}
                        className="p-2 rounded-lg bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors cursor-pointer"
                        title="Ver Follow Up Clientes"
                      >
                        <Heart className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.telefone && (
                      <a href={whatsappLink(c.telefone)} target="_blank" rel="noreferrer"
                        className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer" title="Abrir WhatsApp">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {editando ? (
                      <>
                        <button onClick={() => salvarEdicao(c.id)} disabled={salvando}
                          className="p-2 rounded-lg bg-neon/10 text-neon hover:bg-neon/20 cursor-pointer">
                          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setEditandoId(null)}
                          className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-white cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => iniciarEdicao(c)}
                        className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-white hover:bg-dark-600 transition-colors cursor-pointer">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-dark-700/50 p-4 space-y-4">
                    {editando && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-dark-700/30 rounded-xl border border-dark-600/30">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Telefone</label>
                          <input value={editForm.telefone} onChange={e => setEditForm(p => ({ ...p, telefone: e.target.value }))}
                            className={inputCls} placeholder="(11) 99999-9999" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">E-mail</label>
                          <input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                            className={inputCls} placeholder="email@email.com" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Tipo de Negócio</label>
                          <select value={editForm.tipo_negocio} onChange={e => setEditForm(p => ({ ...p, tipo_negocio: e.target.value }))}
                            className={`${inputCls} cursor-pointer`}>
                            <option value="">Selecionar...</option>
                            {TIPOS_NEGOCIO.map(t => <option key={t.v} value={t.v}>{t.emoji} {t.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                            <CreditCard className="w-3 h-3" /> Dados Fiscais
                          </p>
                          {c.cpf_cnpj && (
                            <button
                              onClick={() => inspecionarContato(c.cpf_cnpj)}
                              disabled={diagLoading}
                              className="text-[10px] text-zinc-600 hover:text-orange-400 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
                            >
                              {diagLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                              Verificar Bling
                            </button>
                          )}
                        </div>
                        {c.cpf_cnpj ? (
                          <div className="bg-dark-700/30 rounded-xl p-3 space-y-1">
                            <div className="flex items-center gap-2">
                              {c.tipo_pessoa === 'J' ? <Building2 className="w-3.5 h-3.5 text-zinc-500" /> : <User className="w-3.5 h-3.5 text-zinc-500" />}
                              <span className="text-xs text-zinc-400">{c.tipo_pessoa === 'J' ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                            </div>
                            <p className="text-xs font-mono text-zinc-300">{c.cpf_cnpj}</p>
                            {df.nomeFantasia && <p className="text-xs text-zinc-500">Fantasia: {df.nomeFantasia}</p>}
                            {df.inscricaoEstadual && <p className="text-xs text-zinc-500">IE: {df.inscricaoEstadual}</p>}
                            {df.dataNascimento && <p className="text-xs text-zinc-500">Nasc.: {fmtData(df.dataNascimento)}</p>}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-600 italic">CPF/CNPJ não informado</p>
                        )}
                        {temEndereco && (
                          <div className="bg-dark-700/30 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Endereço</p>
                            <p className="text-xs text-zinc-400">{df.logradouro}{df.numero ? `, ${df.numero}` : ''}{df.complemento ? ` — ${df.complemento}` : ''}</p>
                            <p className="text-xs text-zinc-500">{df.bairro ? `${df.bairro} · ` : ''}{df.cidade}/{df.estado} {df.cep ? `· ${df.cep}` : ''}</p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" /> Histórico de Compras
                          </p>
                          <button
                            onClick={() => abrirBlingEnvio(c)}
                            className="flex items-center gap-1 text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                            title="Vincular orçamento e enviar para Bling"
                          >
                            <Send className="w-3 h-3" /> Enviar para Bling
                          </button>
                        </div>
                        {orcs === undefined ? (
                          <div className="flex items-center gap-2 text-zinc-600 text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                          </div>
                        ) : orcs.length === 0 ? (
                          <p className="text-xs text-zinc-600 italic">Nenhuma compra registrada no sistema</p>
                        ) : (
                          <div className="space-y-1.5">
                            {orcs.slice(0, 5).map(o => {
                              const itens = o.payload?.itens || [];
                              const valor = itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0) + (o.payload?.frete || 0);
                              const isAprovado = o.payload?.status === 'Aprovado';
                              return (
                                <div key={o.id} className="flex items-center justify-between gap-2 bg-dark-700/30 rounded-lg p-2.5">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isAprovado ? 'bg-green-400' : 'bg-amber-400'}`} />
                                      <span className="text-xs text-zinc-400 truncate">{itens.map(i => i.nome).join(', ') || 'Orçamento'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-zinc-600">{fmtData(o.aprovado_em || o.criado_em)}</span>
                                      {o.bling_pedido_id && (
                                        <span className="text-[9px] font-bold text-orange-400/60 flex items-center gap-0.5">
                                          <FileCheck className="w-2.5 h-2.5" /> Proposta #{o.bling_pedido_id}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-xs font-bold text-neon">{formatCurrency(valor)}</span>
                                    <button
                                      onClick={() => abrirBlingEnvio(c, o)}
                                      className="p-1 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/25 transition-colors cursor-pointer"
                                      title={o.bling_pedido_id ? 'Reenviar proposta ao Bling' : 'Criar proposta no Bling'}
                                    >
                                      <Send className="w-3 h-3" />
                                    </button>
                                    <a href={`/orcamento/${o.slug}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white cursor-pointer">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex gap-3 mt-2">
                          {c.data_primeira_compra && (
                            <div><p className="text-[9px] text-zinc-600 uppercase">1ª Compra</p><p className="text-[11px] text-zinc-400">{fmtData(c.data_primeira_compra)}</p></div>
                          )}
                          {c.data_ultima_compra && (
                            <div><p className="text-[9px] text-zinc-600 uppercase">Última Compra</p><p className="text-[11px] text-zinc-400">{fmtData(c.data_ultima_compra)}</p></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Diagnóstico contato Bling */}
      {diagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-orange-400" /> Contato no Bling
              </h3>
              <button onClick={() => setDiagModal(null)} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4">
              {!diagModal.ok ? (
                <p className="text-sm text-red-400">{diagModal.error}</p>
              ) : !diagModal.encontrado ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-400">Contato NÃO encontrado no Bling</p>
                  <p className="text-xs text-zinc-500 mt-1">Nenhum contato com este CPF/CNPJ existe no Bling. A criação via "Enviar para Bling" deve funcionar.</p>
                </div>
              ) : (
                diagModal.contatos.map((c, i) => {
                  const d = c.detalheCompleto || c.resumo;
                  return (
                    <div key={i} className="space-y-3">
                      <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-white">{d.nome}</p>
                          <span className="text-[10px] font-mono text-zinc-500">ID {c.id}</span>
                        </div>

                        {/* Campos-chave */}
                        {[
                          ['tipoPessoa', d.tipoPessoa],
                          ['situacao', d.situacao],
                          ['tiposContato', JSON.stringify(d.tiposContato)],
                          ['tipo', JSON.stringify(d.tipo)],
                          ['cliente', String(d.cliente ?? '—')],
                          ['fornecedor', String(d.fornecedor ?? '—')],
                          ['cpfCnpj / cnpj / cpf', d.cpfCnpj || d.cnpj || d.cpf || '—'],
                          ['email', d.email || '—'],
                          ['telefone', d.telefone || d.celular || '—'],
                        ].map(([label, val]) => val && val !== 'undefined' && (
                          <div key={label} className="flex items-start gap-2 text-xs">
                            <span className="text-zinc-500 shrink-0 w-40">{label}:</span>
                            <span className={`font-mono break-all ${
                              label === 'cliente' && val === 'true' ? 'text-green-400 font-bold' :
                              label === 'cliente' && val !== 'true' ? 'text-red-400' :
                              'text-zinc-300'
                            }`}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Todos os campos disponíveis */}
                      <div>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1.5">Todos os campos retornados pela API</p>
                        <div className="flex flex-wrap gap-1">
                          {(c.todosCampos || []).map(f => (
                            <span key={f} className="text-[10px] font-mono bg-dark-800 text-zinc-500 px-1.5 py-0.5 rounded">{f}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button onClick={() => setDiagModal(null)}
              className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm text-white bg-dark-700 hover:bg-dark-600 cursor-pointer transition-colors shrink-0">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: Enviar para Bling — selecionar orçamento + pedido de venda */}
      {blingEnvioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-orange-400" /> Enviar para Bling
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[280px]">
                  {blingEnvioModal.cliente.nome}
                </p>
              </div>
              <button
                onClick={() => setBlingEnvioModal(null)}
                disabled={enviandoBling}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 cursor-pointer transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── ETAPA: SELECT ─────────────────────────────────────────────── */}
            {blingEnvioStep === 'select' && (() => {
              const vinculadosIds = new Set((orcamentosCliente[blingEnvioModal.cliente.id] || []).map(o => o.id));

              // Lista unificada: vinculados no topo + todos os recentes abaixo, filtrados pelo texto
              const filtro = filtroOrcModal.toLowerCase().trim();
              const listaFiltrada = orcsRecentes.filter(o => {
                if (!filtro) return true;
                return (
                  (o.cliente || '').toLowerCase().includes(filtro) ||
                  (o.slug || '').toLowerCase().includes(filtro) ||
                  (o.payload?.itens || []).some(i => (i.nome || '').toLowerCase().includes(filtro))
                );
              });

              // Separar vinculados dos demais
              const vinculadosFiltrados = listaFiltrada.filter(o => vinculadosIds.has(o.id));
              const outrosFiltrados = listaFiltrada.filter(o => !vinculadosIds.has(o.id));

              return (
                <>
                  {/* Info cliente */}
                  <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-3 mb-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-sm font-black text-orange-400 shrink-0">
                      {blingEnvioModal.cliente.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{blingEnvioModal.cliente.nome}</p>
                      <p className="text-[10px] text-zinc-500">
                        {blingEnvioModal.cliente.cpf_cnpj
                          ? `${blingEnvioModal.cliente.tipo_pessoa === 'J' ? 'CNPJ' : 'CPF'}: ${blingEnvioModal.cliente.cpf_cnpj}`
                          : <span className="text-amber-400">CPF/CNPJ não informado</span>
                        }
                      </p>
                    </div>
                  </div>

                  {/* Campo de filtro */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      autoFocus
                      value={filtroOrcModal}
                      onChange={e => setFiltroOrcModal(e.target.value)}
                      placeholder="Filtrar por nome, cliente ou produto..."
                      className="w-full pl-9 pr-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-zinc-600 outline-none focus:border-orange-500/50 transition-colors"
                    />
                    {filtroOrcModal && (
                      <button onClick={() => setFiltroOrcModal('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Lista de orçamentos */}
                  {carregandoOrcsRecentes ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-400" /> Carregando orçamentos...
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto mb-4 pr-0.5">
                      {/* Vinculados ao cliente */}
                      {vinculadosFiltrados.length > 0 && (
                        <>
                          <p className="text-[9px] font-bold text-orange-400/70 uppercase tracking-wider px-1 pt-1">Vinculados a este cliente</p>
                          {vinculadosFiltrados.map(o => <OrcItem key={o.id} o={o} sel={orcEnvioSelecionado?.id === o.id} onSelect={setOrcEnvioSelecionado} vinculado calcTotal={calcTotalOrc} />)}
                        </>
                      )}

                      {/* Todos os orçamentos do sistema */}
                      {outrosFiltrados.length > 0 && (
                        <>
                          <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider px-1 pt-2">
                            {vinculadosFiltrados.length > 0 ? 'Outros orçamentos' : 'Orçamentos do sistema'}
                          </p>
                          {outrosFiltrados.map(o => <OrcItem key={o.id} o={o} sel={orcEnvioSelecionado?.id === o.id} onSelect={setOrcEnvioSelecionado} calcTotal={calcTotalOrc} />)}
                        </>
                      )}

                      {listaFiltrada.length === 0 && (
                        <p className="text-xs text-zinc-600 italic text-center py-4">
                          {filtro ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento no sistema'}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => setBlingEnvioStep('preview')}
                    disabled={!orcEnvioSelecionado}
                    className="w-full py-3 rounded-xl font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer">
                    {orcEnvioSelecionado ? `Ver Preview — ${orcEnvioSelecionado.cliente || orcEnvioSelecionado.slug}` : 'Selecione um orçamento'}
                  </button>
                </>
              );
            })()}

            {/* ── ETAPA: PREVIEW ────────────────────────────────────────────── */}
            {blingEnvioStep === 'preview' && orcEnvioSelecionado && (() => {
              const c = blingEnvioModal.cliente;
              const o = orcEnvioSelecionado;
              const itens = (o.payload?.itens || []).filter(i => (i.q ?? i.quantidade ?? 0) > 0);
              const frete = parseFloat(o.payload?.frete || 0);
              const totalItens = itens.reduce((acc, i) => acc + (i.p ?? i.preco ?? 0) * (i.q ?? i.quantidade ?? 0), 0);
              const total = totalItens + frete;
              return (
                <>
                  <div className="space-y-3 mb-5">
                    {/* Cliente */}
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5">Contato Bling</p>
                      <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-3 space-y-0.5">
                        <p className="text-sm font-bold text-white">{c.nome}</p>
                        {c.cpf_cnpj && <p className="text-xs text-zinc-500">{c.tipo_pessoa === 'J' ? 'CNPJ' : 'CPF'}: {c.cpf_cnpj}</p>}
                        {c.email && <p className="text-xs text-zinc-500">{c.email}</p>}
                        {c.telefone && <p className="text-xs text-zinc-500">{fmtTel(c.telefone)}</p>}
                      </div>
                    </div>

                    {/* Itens */}
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5">Itens do Pedido</p>
                      <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl divide-y divide-dark-700/40">
                        {itens.map((i, idx) => (
                          <div key={idx} className="flex items-center justify-between px-3 py-2 gap-2">
                            <span className="text-xs text-zinc-300 truncate flex-1">{i.nome || `Produto ${idx + 1}`}</span>
                            <span className="text-[10px] text-zinc-600 shrink-0">×{i.q ?? i.quantidade}</span>
                            <span className="text-xs font-bold text-zinc-200 shrink-0 ml-1">
                              {formatCurrency((i.p ?? i.preco ?? 0) * (i.q ?? i.quantidade ?? 0))}
                            </span>
                          </div>
                        ))}
                        {frete > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 gap-2">
                            <span className="text-xs text-zinc-500">Frete</span>
                            <span className="text-xs font-bold text-zinc-300">{formatCurrency(frete)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between px-3 py-2 gap-2 bg-dark-700/30">
                          <span className="text-xs font-bold text-zinc-300">Total</span>
                          <span className="text-sm font-black text-neon">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setBlingEnvioStep('select')}
                      className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 border border-dark-600 hover:text-white cursor-pointer transition-colors">
                      ← Voltar
                    </button>
                    <button onClick={handleEnviarBling}
                      className="flex-1 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 cursor-pointer transition-all">
                      Confirmar Envio
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ── ETAPA: SENDING ────────────────────────────────────────────── */}
            {blingEnvioStep === 'sending' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-bold">Enviando para o Bling...</p>
                <p className="text-xs text-zinc-500 mt-2">Criando contato e pedido de venda.</p>
              </div>
            )}

            {/* ── ETAPA: DONE ───────────────────────────────────────────────── */}
            {blingEnvioStep === 'done' && blingEnvioResult && (
              <>
                <div className={`rounded-xl p-4 mb-4 flex items-start gap-3 ${
                  blingEnvioResult.ok
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {blingEnvioResult.ok
                    ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                  <div>
                    {blingEnvioResult.ok ? (
                      <>
                        <p className="text-sm font-bold">Proposta criada no Bling!</p>
                        {blingEnvioResult.propostaNumero && (
                          <p className="text-xs mt-0.5">Número: #{blingEnvioResult.propostaNumero}</p>
                        )}
                        {blingEnvioResult.propostaId && !blingEnvioResult.propostaNumero && (
                          <p className="text-xs mt-0.5">ID: {blingEnvioResult.propostaId}</p>
                        )}
                        <p className="text-xs mt-0.5 text-green-400/70">Total: {formatCurrency(blingEnvioResult.total || 0)}</p>
                        {blingEnvioResult.itensSemBling?.length > 0 && (
                          <p className="text-xs mt-1.5 text-amber-400">
                            ⚠ {blingEnvioResult.itensSemBling.length} iten(s) sem ID Bling — importe os produtos para vincular:
                            {' '}{blingEnvioResult.itensSemBling.join(', ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed">{blingEnvioResult.error || 'Erro desconhecido'}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setBlingEnvioModal(null)}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-dark-700 hover:bg-dark-600 cursor-pointer transition-colors">
                  Fechar
                </button>
              </>
            )}

          </div>
        </div>
      )}

      {/* Modal: Importar Histórico Bling — fluxo multi-etapa */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-orange-400" /> Importar Clientes do Bling
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {importStep === 'inicial' && 'Configure o período e visualize os vendedores'}
                  {importStep === 'preview' && 'Selecione os vendedores para importar'}
                  {importStep === 'import' && 'Importando clientes...'}
                  {importStep === 'done' && 'Importação concluída!'}
                </p>
              </div>
              <button onClick={() => setImportModal(false)} disabled={importando || buscandoPreview}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 cursor-pointer transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── ETAPA 1: INICIAL ── */}
            {importStep === 'inicial' && (
              <>
                {/* Período */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Período a analisar</label>
                  <div className="flex gap-2">
                    {[30, 60, 90, 180].map(d => (
                      <button key={d} onClick={() => setDiasImport(d)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          diasImport === d ? 'bg-orange-500 text-white' : 'bg-dark-800 text-zinc-400 border border-dark-600 hover:border-orange-500/40'
                        }`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seleção de Status — dinâmica */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase">Status dos pedidos</label>
                    <button onClick={handleCarregarStatus} disabled={carregandoStatus}
                      className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50">
                      {carregandoStatus ? <><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</> : <><RefreshCw className="w-3 h-3" /> Carregar do Bling</>}
                    </button>
                  </div>

                  {situacoesDisponiveis.length === 0 && !carregandoStatus && (
                    <button onClick={handleCarregarStatus}
                      className="w-full py-2.5 rounded-xl text-xs text-zinc-500 border border-dashed border-dark-600 hover:border-orange-500/40 hover:text-zinc-400 transition-all cursor-pointer">
                      Clique em &quot;Carregar do Bling&quot; para ver os status disponíveis na sua conta
                    </button>
                  )}

                  {carregandoStatus && (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                      Buscando status disponíveis...
                    </div>
                  )}

                  {situacoesDisponiveis.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {situacoesDisponiveis.map(s => {
                        const sel = situacoesSelecionadas.has(s.id);
                        const { color, bg } = corSituacao(s.nome);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleSituacao(s.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                              sel ? bg : 'bg-dark-800/40 border-dark-600 hover:border-dark-500'
                            }`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                              sel ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'
                            }`}>
                              {sel && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-bold ${sel ? color : 'text-zinc-500'}`}>{s.nome}</span>
                              <span className="text-[10px] text-zinc-600 ml-2">{s.total} pedido{s.total !== 1 ? 's' : ''}</span>
                            </div>
                            <span className="text-[10px] text-zinc-700 shrink-0">ID {s.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {situacoesDisponiveis.length > 0 && situacoesSelecionadas.size === 0 && (
                    <p className="text-[11px] text-red-400 mt-1.5">Selecione ao menos um status</p>
                  )}
                </div>

                {/* Seletor de vendedor */}
                {vendedoresBling.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-400 uppercase">Vendedor</span>
                      <span className="text-[10px] text-zinc-600">opcional — filtra pedidos por vendedor</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setIdVendedorSelecionado(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          idVendedorSelecionado === null
                            ? 'border-zinc-500 bg-zinc-500/20 text-zinc-200'
                            : 'border-dark-600 text-zinc-600 hover:border-dark-500'
                        }`}>
                        Todos
                      </button>
                      {vendedoresBling.map(v => (
                        <button key={v.id}
                          onClick={() => setIdVendedorSelecionado(idVendedorSelecionado === v.id ? null : v.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            idVendedorSelecionado === v.id
                              ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                              : 'border-dark-600 text-zinc-500 hover:border-dark-500 hover:text-zinc-300'
                          }`}>
                          {v.nome}
                        </button>
                      ))}
                    </div>
                    {idVendedorSelecionado && (
                      <p className="text-[11px] text-orange-400">
                        ✓ Importando apenas pedidos de: <strong>{vendedoresBling.find(v => v.id === idVendedorSelecionado)?.nome}</strong>
                      </p>
                    )}
                  </div>
                )}

                {/* Limpar + botão preview */}
                <div className="space-y-2">
                  <button onClick={handlePreviewBling}
                    disabled={buscandoPreview || situacoesSelecionadas.size === 0}
                    className="w-full py-3 rounded-xl font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer">
                    {buscandoPreview ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</> : <><Download className="w-4 h-4" /> Ver Resumo da Importação</>}
                  </button>
                  <button onClick={handleLimparBling} disabled={limpando}
                    className="w-full py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-dark-700 transition-colors cursor-pointer">
                    {limpando ? 'Limpando...' : '🗑️ Limpar clientes importados do Bling'}
                  </button>
                </div>

                {importResult && (
                  <div className={`mt-3 rounded-xl p-3 text-xs font-semibold flex items-start gap-2 ${
                    importResult.ok ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                  }`}>
                    {importResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{importResult.mensagem}</span>
                  </div>
                )}
              </>
            )}

            {/* ── ETAPA 2: PREVIEW — confirmação de importação ── */}
            {importStep === 'preview' && (
              <>
                {/* Resumo */}
                {blingVendedores[0] && (
                  <div className="space-y-2 mb-5">
                    <p className="text-xs font-bold text-zinc-400 uppercase mb-3">Resumo da busca</p>

                    <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4 space-y-3">
                      {/* Período */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Período</span>
                        <span className="text-xs font-bold text-zinc-300">Últimos {diasImport} dias</span>
                      </div>
                      {/* Status */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-zinc-500 shrink-0">Status filtrados</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {[...situacoesSelecionadas].map(id => {
                            const { color } = corSituacao(situacoesDisponiveis.find(s => s.id === id)?.nome || '');
                            return (
                              <span key={id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} bg-current/10`}>
                                {situacoesDisponiveis.find(s => s.id === id)?.nome || `ID ${id}`}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {/* Pedidos */}
                      <div className="flex items-center justify-between pt-1 border-t border-dark-700/40">
                        <span className="text-xs text-zinc-500">Pedidos encontrados</span>
                        <span className="text-sm font-black text-orange-400">{blingVendedores[0].pedidos}</span>
                      </div>
                      {/* Clientes únicos */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Clientes únicos</span>
                        <span className="text-sm font-black text-green-400">{blingVendedores[0].clientes}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-600 text-center">
                      Para cada cliente único será buscado: telefone, e-mail e endereço completo via Bling
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setImportStep('inicial')}
                    className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 border border-dark-600 hover:text-white cursor-pointer transition-colors">
                    ← Voltar
                  </button>
                  <button onClick={handleImportarBling}
                    className="flex-1 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 cursor-pointer transition-all">
                    Importar {blingVendedores[0]?.clientes > 0 ? `(${blingVendedores[0].clientes} clientes)` : ''}
                  </button>
                </div>
              </>
            )}

            {/* ── ETAPA 3: IMPORTANDO ── */}
            {importStep === 'import' && (
              <div className="text-center py-6">
                <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-bold">Importando clientes...</p>
                <p className="text-xs text-zinc-500 mt-2">Buscando dados completos de cada contato no Bling.<br />Isso pode levar 1-3 minutos.</p>
              </div>
            )}

            {/* ── ETAPA 4: CONCLUÍDO ── */}
            {importStep === 'done' && importResult && (
              <>
                <div className={`rounded-xl p-4 mb-4 text-sm flex items-start gap-3 ${
                  importResult.ok ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {importResult.ok ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                  <span className="leading-relaxed">{importResult.mensagem}</span>
                </div>
                <button onClick={() => setImportModal(false)}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-dark-700 hover:bg-dark-600 cursor-pointer transition-colors">
                  Fechar
                </button>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
