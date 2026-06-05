import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import {
  Loader2, Eye, Copy, Trash2, CheckCircle2, Clock, XCircle,
  Edit2, Search, Send, CopyPlus, ChevronRight, MapPin, RefreshCw, Link2, X,
  SlidersHorizontal, ChevronDown, ArrowDownToLine, User,
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

  const [filtroAberto, setFiltroAberto] = useState(false);
  const [filtros, setFiltros] = useState({
    busca: '', produto: '', dataInicio: '', dataFim: '', status: 'Todos', origem: 'Todos',
  });
  const setFiltro = (campo, val) => setFiltros(f => ({ ...f, [campo]: val }));
  const limparFiltros = () => setFiltros({ busca: '', produto: '', dataInicio: '', dataFim: '', status: 'Todos', origem: 'Todos' });
  const filtrosAtivos = Object.entries(filtros).filter(([k, v]) => v && v !== 'Todos').length;
  const [detail, setDetail] = useState(null);
  const [detailRapido, setDetailRapido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkingRapido, setLinkingRapido] = useState(null);
  const [leadsDisponiveis, setLeadsDisponiveis] = useState([]);
  const [searchVincular, setSearchVincular] = useState('');
  const [aprovandoModal, setAprovandoModal] = useState(null);
  const [valorFechado, setValorFechado] = useState('');
  const [filtroSemLead, setFiltroSemLead] = useState(false);
  const [editandoRapido, setEditandoRapido] = useState(null);
  const [editRapidoForm, setEditRapidoForm] = useState({ nome_lead: '', produtos_texto: '' });
  const [syncBling, setSyncBling] = useState(false);
  const [syncBlingResult, setSyncBlingResult] = useState(null);
  const [blingModal, setBlingModal] = useState(false);
  const [blingPedidos, setBlingPedidos] = useState([]);
  const [blingCarregando, setBlingCarregando] = useState(false);
  const [blingSelecionados, setBlingSelecionados] = useState(new Set());
  const [blingFiltroStatus, setBlingFiltroStatus] = useState('todos');
  const [blingImportando, setBlingImportando] = useState(false);
  const [blingImportResult, setBlingImportResult] = useState(null);
  const [blingTelefones, setBlingTelefones] = useState({}); // { [pedidoId]: telefone } para edicao manual

  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: orcsData }, { data: linksData }, { data: leadsData }, { count: contatoCount }, { data: dispData }] = await Promise.all([
      supabase.from('orcamentos_salvos').select('id, slug, cliente, consultor, criado_em, aprovado_em, aberto, payload, bling_origem, bling_pedido_id, formulario_fiscal_token, dados_fiscais_recebidos_em').order('criado_em', { ascending: false }),
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
    const itens = o.payload?.itens || [];
    const subtotal = itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
    const valorTotal = valor || subtotal + parseFloat(o.payload?.frete || 0);

    await supabase.from('orcamentos_salvos')
      .update({ payload: { ...o.payload, status: 'Aprovado' }, valor_fechado: valor, aprovado_em: new Date().toISOString() })
      .eq('id', o.id);

    // Upsert na tabela clientes ao aprovar
    const telCliente = (o.payload?.telefoneCliente || '').replace(/\D/g, '');
    if (o.cliente) {
      // Tenta por telefone se disponível, senão cria novo
      const { data: existente } = await supabase.from('clientes').select('id, total_compras, total_gasto').eq('telefone', telCliente).maybeSingle();
      if (existente) {
        await supabase.from('clientes').update({
          nome: o.cliente,
          data_ultima_compra: new Date().toISOString(),
          total_compras: (existente.total_compras || 0) + 1,
          total_gasto: (parseFloat(existente.total_gasto) || 0) + valorTotal,
          atualizado_em: new Date().toISOString(),
        }).eq('id', existente.id).catch(() => null);
      } else if (telCliente) {
        await supabase.from('clientes').insert({
          nome: o.cliente,
          telefone: telCliente,
          origem: 'orcamento_aprovado',
          total_compras: 1,
          total_gasto: valorTotal,
          data_primeira_compra: new Date().toISOString(),
          data_ultima_compra: new Date().toISOString(),
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        }).catch(() => null);
      }
    }

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

  const handleSaveEditRapido = async () => {
    if (!editandoRapido) return;
    await supabase.from('links_rapidos').update({
      nome_lead: editRapidoForm.nome_lead,
      produtos_texto: editRapidoForm.produtos_texto,
    }).eq('id', editandoRapido.id);
    setEditandoRapido(null);
    load();
  };

  // ── Bling: abre modal e carrega lista de pedidos (preview com detalhes completos) ──
  const handleSyncBling = async () => {
    setBlingModal(true);
    setBlingCarregando(true);
    setBlingPedidos([]);
    setBlingSelecionados(new Set());
    setBlingTelefones({});
    setBlingImportResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-bling-orders`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mode: 'preview', dias_atras: 60 }),
      });
      const result = await res.json();
      if (result.ok) {
        setBlingPedidos(result.pedidos || []);
        // Pre-preencher telefones com os que vieram do Bling
        const tels = {};
        (result.pedidos || []).forEach(p => { if (p.telefone) tels[p.id] = p.telefone; });
        setBlingTelefones(tels);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBlingCarregando(false);
    }
  };

  // ── Bling: importa pedidos selecionados com telefones editados ──
  const handleBlingImportar = async () => {
    if (!blingSelecionados.size) return;
    setBlingImportando(true);
    setBlingImportResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-bling-orders`;
      // Montar overrides de telefone para os pedidos selecionados
      const phoneOverrides = {};
      blingSelecionados.forEach(id => {
        if (blingTelefones[id]) phoneOverrides[id] = blingTelefones[id];
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ mode: 'import', pedido_ids: [...blingSelecionados], phone_overrides: phoneOverrides }),
      });
      const result = await res.json();
      if (result.ok) {
        setBlingImportResult(`✅ ${result.importados} importado(s) · ${result.atualizados} atualizado(s)`);
        setBlingPedidos(prev => prev.map(p =>
          blingSelecionados.has(p.id) ? { ...p, jaImportado: true } : p
        ));

        // Upsert automático na tabela clientes
        const pedidosImportados = blingPedidos.filter(p => blingSelecionados.has(p.id));
        for (const pedido of pedidosImportados) {
          const tel = (blingTelefones[pedido.id] || pedido.telefone || '').replace(/\D/g, '');
          const nome = pedido.cliente || pedido.contato || '';
          if (!nome && !tel) continue;
          try {
            // Buscar cliente existente por telefone
            const { data: existente } = await supabase.from('clientes')
              .select('id, total_compras, total_gasto')
              .eq('telefone', tel)
              .maybeSingle();
            const agora = new Date().toISOString();
            const valor = parseFloat(pedido.valor || 0);
            if (existente) {
              await supabase.from('clientes').update({
                nome: nome || existente.nome,
                data_ultima_compra: agora,
                total_compras: (existente.total_compras || 0) + 1,
                total_gasto: (parseFloat(existente.total_gasto) || 0) + valor,
                atualizado_em: agora,
                origem: 'bling',
              }).eq('id', existente.id);
            } else if (tel || nome) {
              await supabase.from('clientes').insert({
                nome: nome || 'Cliente Bling',
                telefone: tel || null,
                origem: 'bling',
                total_compras: 1,
                total_gasto: valor,
                data_primeira_compra: agora,
                data_ultima_compra: agora,
                criado_em: agora,
                atualizado_em: agora,
              });
            }
          } catch (e) { /* silencia erro individual */ }
        }

        setBlingSelecionados(new Set());
        load();
      } else {
        setBlingImportResult(`❌ ${result.error}`);
      }
    } catch (e) {
      setBlingImportResult(`❌ ${e.message}`);
    } finally {
      setBlingImportando(false);
    }
  };

  // ── Gerar link para formulário fiscal NF-e ──
  const handleGerarLinkFiscal = async (orc) => {
    let token = orc.formulario_fiscal_token;
    if (!token) {
      // Gerar UUID único
      token = crypto.randomUUID();
      const { error } = await supabase
        .from('orcamentos_salvos')
        .update({ formulario_fiscal_token: token })
        .eq('id', orc.id);
      if (error) { alert('Erro ao gerar link: ' + error.message); return; }
    }
    const link = `${window.location.origin}/fiscal/${token}`;
    await navigator.clipboard.writeText(link);
    alert(`✅ Link copiado!\n\nEnvie este link ao cliente no WhatsApp:\n${link}`);
    load(); // Atualiza lista para mostrar badge de status
  };
  // Busca orçamento do link rápido — usa cache local, faz fetch se não encontrado
  const resolveOrcRapido = async (l) => {
    const cached = orcs.find(o => o.slug === l.slug_gerado);
    if (cached) return cached;
    const { data } = await supabase.from('orcamentos_salvos').select('*').eq('slug', l.slug_gerado).single();
    return data || null;
  };

  const handleAprovarRapido = async (l) => {
    let orc = await resolveOrcRapido(l);

    // Se não existe orçamento ainda, cria um registro mínimo para poder registrar a venda
    if (!orc) {
      const slugBase = (l.nome_lead || 'rapido').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
      const { data } = await supabase.from('orcamentos_salvos').insert({
        slug,
        cliente: l.nome_lead || '—',
        consultor: 'LEO BERG',
        payload: { itens: [], status: 'Pendente', produtos_texto: l.produtos_texto || '' },
      }).select().single();
      if (data) {
        await supabase.from('links_rapidos').update({ slug_gerado: slug }).eq('id', l.id);
        orc = data;
      }
    }

    if (orc) { setAprovandoModal(orc); setValorFechado(''); }
  };

  const changeStatusRapido = async (l, status) => {
    let orc = await resolveOrcRapido(l);
    if (!orc) {
      // Cria registro mínimo se não existe
      const slugBase = (l.nome_lead || 'rapido').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
      const { data } = await supabase.from('orcamentos_salvos').insert({
        slug,
        cliente: l.nome_lead || '—',
        consultor: 'LEO BERG',
        payload: { itens: [], status: 'Pendente' },
      }).select().single();
      if (data) {
        await supabase.from('links_rapidos').update({ slug_gerado: slug }).eq('id', l.id);
        orc = data;
      }
    }
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

  // ── Origens únicas para o filtro ──
  const origensUnicas = ['Todos', ...Array.from(new Set(orcs.map(o => o.origem_lead).filter(Boolean))).sort()];

  // ── Filtered lists ──
  const filteredManuais = orcs.filter(o => {
    if (filtros.busca) {
      const t = filtros.busca.toLowerCase();
      const matchNome = o.cliente?.toLowerCase().includes(t);
      const matchTel  = o.payload?.telefoneCliente?.includes(t);
      if (!matchNome && !matchTel) return false;
    }
    if (filtros.produto) {
      const t = filtros.produto.toLowerCase();
      const itens = o.payload?.itens || [];
      if (!itens.some(i => i.nome?.toLowerCase().includes(t))) return false;
    }
    if (filtros.dataInicio && new Date(o.criado_em) < new Date(filtros.dataInicio)) return false;
    if (filtros.dataFim   && new Date(o.criado_em) > new Date(filtros.dataFim + 'T23:59:59')) return false;
    if (filtros.status !== 'Todos' && (o.payload?.status || 'Pendente') !== filtros.status) return false;
    if (filtros.origem !== 'Todos' && (o.origem_lead || '') !== filtros.origem) return false;
    return true;
  });

  const semLeadCount = links.filter(l => !leadMap[l.codigo]).length;

  const filteredRapidos = links.filter(l => {
    if (filtroSemLead && leadMap[l.codigo]) return false;
    const lead = leadMap[l.codigo];
    if (filtros.busca) {
      const t = filtros.busca.toLowerCase();
      const matchNome = l.nome_lead?.toLowerCase().includes(t) || lead?.nome?.toLowerCase().includes(t);
      const matchTel  = l.telefone_lead?.includes(filtros.busca) || lead?.telefone?.includes(filtros.busca);
      if (!matchNome && !matchTel) return false;
    }
    if (filtros.produto) {
      const t = filtros.produto.toLowerCase();
      if (!l.produtos_texto?.toLowerCase().includes(t)) return false;
    }
    if (filtros.dataInicio && new Date(l.criado_em) < new Date(filtros.dataInicio)) return false;
    if (filtros.dataFim   && new Date(l.criado_em) > new Date(filtros.dataFim + 'T23:59:59')) return false;
    return true;
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

      {/* Modal Editar Link Rápido */}
      {editandoRapido && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">Editar Link Rápido</h3>
              <button onClick={() => setEditandoRapido(null)} className="text-zinc-500 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nome do lead</label>
            <input
              type="text"
              value={editRapidoForm.nome_lead}
              onChange={e => setEditRapidoForm(f => ({ ...f, nome_lead: e.target.value }))}
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50 mb-4"
            />
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Produtos / interesse</label>
            <textarea
              rows={3}
              value={editRapidoForm.produtos_texto}
              onChange={e => setEditRapidoForm(f => ({ ...f, produtos_texto: e.target.value }))}
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50 mb-5 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditandoRapido(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white bg-dark-800 hover:bg-dark-700 transition-colors cursor-pointer">Cancelar</button>
              <button onClick={handleSaveEditRapido} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer">Salvar</button>
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

      {/* ── Modal Importar do Bling ── */}
      {blingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.75)'}}>
          <div className="bg-[#111] border border-zinc-800 rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-orange-400" /> Importar Pedidos do Bling
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">Últimos 60 dias · Selecione os pedidos para importar</p>
              </div>
              <button onClick={() => setBlingModal(false)} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {/* Filtro */}
            <div className="px-5 pt-4 flex items-center gap-2 flex-wrap">
              {['todos', 'em andamento', 'em aberto', 'atendido'].map(s => (
                <button key={s} onClick={() => setBlingFiltroStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    blingFiltroStatus === s ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}>
                  {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              {blingPedidos.length > 0 && (
                <span className="ml-auto text-xs text-zinc-500">{blingSelecionados.size} selecionado(s)</span>
              )}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {blingCarregando ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                  <p className="text-sm">Buscando detalhes dos pedidos no Bling...</p>
                  <p className="text-xs text-zinc-600">Isso pode levar alguns segundos (1 pedido a cada 0,4s)</p>
                </div>
              ) : blingPedidos.filter(p => blingFiltroStatus === 'todos' || p.status.toLowerCase().includes(blingFiltroStatus)).length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-10">Nenhum pedido encontrado.</p>
              ) : blingPedidos
                  .filter(p => blingFiltroStatus === 'todos' || p.status.toLowerCase().includes(blingFiltroStatus))
                  .map(p => {
                    const sel = blingSelecionados.has(p.id);
                    const toggleSel = () => setBlingSelecionados(prev => {
                      const n = new Set(prev);
                      sel ? n.delete(p.id) : n.add(p.id);
                      return n;
                    });
                    return (
                      <div key={p.id}
                        onClick={() => !p.jaImportado && toggleSel()}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          p.jaImportado
                            ? 'border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                            : sel
                            ? 'border-orange-500/40 bg-orange-500/5 cursor-pointer'
                            : 'border-zinc-800 bg-dark-800 hover:border-zinc-700 cursor-pointer'
                        }`}>
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                          p.jaImportado ? 'border-zinc-700 bg-zinc-700' : sel ? 'border-orange-400 bg-orange-400' : 'border-zinc-600'
                        }`}>
                          {(sel || p.jaImportado) && <span className="text-white text-[9px] font-bold">{p.jaImportado ? '✓' : '✓'}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{p.cliente}</p>
                            {p.jaImportado && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-bold flex-shrink-0">Importado</span>}
                            {p.elegivel && !p.jaImportado && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-bold flex-shrink-0">Elegível</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-zinc-500">#{p.numero}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.status}</span>
                            <span className="text-xs text-zinc-600">{p.data}</span>
                          </div>
                          {/* Campo telefone editável */}
                          {!p.jaImportado && (
                            <div className="mt-1.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                placeholder="Telefone (WhatsApp)"
                                value={blingTelefones[p.id] || ''}
                                onChange={e => setBlingTelefones(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className={`text-xs px-2 py-1 rounded-lg border w-44 outline-none transition-colors ${
                                  blingTelefones[p.id]
                                    ? 'border-green-500/30 bg-green-500/5 text-green-400'
                                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                                }`}
                              />
                              {!blingTelefones[p.id] && (
                                <span className="text-[10px] text-amber-500">Sem telefone</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              }
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {blingPedidos.length > 0 && !blingCarregando && (
                  <button
                    onClick={() => {
                      const elegiveis = blingPedidos.filter(p => !p.jaImportado && p.elegivel).map(p => p.id);
                      setBlingSelecionados(new Set(elegiveis));
                    }}
                    className="text-xs text-orange-400 hover:text-orange-300 underline cursor-pointer"
                  >Selecionar elegíveis</button>
                )}
                {blingImportResult && <span className="text-xs text-zinc-300">{blingImportResult}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setBlingModal(false)} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer">Fechar</button>
                <button
                  onClick={handleBlingImportar}
                  disabled={!blingSelecionados.size || blingImportando}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {blingImportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                  {blingImportando ? 'Importando...' : `Importar ${blingSelecionados.size > 0 ? `(${blingSelecionados.size})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Orçamentos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const link = `${window.location.origin}/cadastro`;
              navigator.clipboard.writeText(link);
              alert(`✅ Link copiado!\n\nEnvie para o cliente:\n${link}`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            Link Cadastro
          </button>
          <button
            onClick={handleSyncBling}
            disabled={syncBling}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            {syncBling
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ArrowDownToLine className="w-3.5 h-3.5" />
            }
            {syncBling ? 'Importando...' : 'Importar do Bling'}
          </button>
          <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Main tabs + Importar do Bling */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-1 bg-dark-800/40 p-1 rounded-xl w-fit">
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
        <button
          onClick={handleSyncBling}
          disabled={syncBling}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ArrowDownToLine className="w-4 h-4" />
          Importar do Bling
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : tab === 'manuais' ? (

        /* ══════════════ MANUAIS ══════════════ */
        <div>
          {/* Painel de filtros */}
          <div className="mb-5">
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input type="text" value={filtros.busca} onChange={e => setFiltro('busca', e.target.value)}
                  placeholder="Buscar por nome ou telefone..."
                  className="block w-full pl-10 pr-3 py-2.5 border border-dark-600 rounded-xl bg-dark-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-neon/50 text-sm" />
              </div>
              <button onClick={() => setFiltroAberto(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all whitespace-nowrap ${filtroAberto || filtrosAtivos > 0 ? 'bg-neon/10 text-neon border-neon/30' : 'bg-dark-800 text-zinc-400 hover:text-white border-dark-600'}`}>
                <SlidersHorizontal className="w-4 h-4" />
                Filtros
                {filtrosAtivos > 0 && <span className="bg-neon text-dark-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">{filtrosAtivos}</span>}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtroAberto ? 'rotate-180' : ''}`} />
              </button>
              {filtrosAtivos > 0 && (
                <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white px-2.5 py-2.5 rounded-xl border border-dark-600 hover:border-dark-500 cursor-pointer transition-colors">
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
            {filtroAberto && (
              <div className="mt-3 p-4 bg-dark-800/60 border border-dark-700/40 rounded-2xl grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Produto</label>
                  <input type="text" value={filtros.produto} onChange={e => setFiltro('produto', e.target.value)}
                    placeholder="Ex: Remo, Bike..."
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 placeholder-zinc-600 text-sm focus:outline-none focus:border-neon/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data início</label>
                  <input type="date" value={filtros.dataInicio} onChange={e => setFiltro('dataInicio', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data fim</label>
                  <input type="date" value={filtros.dataFim} onChange={e => setFiltro('dataFim', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={filtros.status} onChange={e => setFiltro('status', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50 cursor-pointer">
                    {['Todos', 'Pendente', 'Aprovado', 'Expirado'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Origem</label>
                  <select value={filtros.origem} onChange={e => setFiltro('origem', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50 cursor-pointer">
                    {origensUnicas.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            )}
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
                const temDadosFiscais = !!o.dados_fiscais_recebidos_em;
                const linkFiscalGerado = !!o.formulario_fiscal_token;

                return (
                  <div key={o.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${st.bg} ${st.color}`}>
                            <st.icon className="w-3 h-3" /> {statusStr}
                          </span>
                          {o.bling_origem && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold shrink-0 flex items-center gap-1">
                              <ArrowDownToLine className="w-2.5 h-2.5" /> Bling
                            </span>
                          )}
                          {o.bling_pedido_id && !o.bling_origem && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold shrink-0">
                              #{o.bling_pedido_id}
                            </span>
                          )}
                          {o.aberto && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-semibold shrink-0">Visualizado</span>
                          )}
                          {/* Badge dados fiscais */}
                          {statusStr === 'Aprovado' && temDadosFiscais && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-bold shrink-0 flex items-center gap-1">
                              📋 NF-e Recebido
                            </span>
                          )}
                          {statusStr === 'Aprovado' && linkFiscalGerado && !temDadosFiscais && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold shrink-0 flex items-center gap-1">
                              ⏳ Aguardando NF-e
                            </span>
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
                      {statusStr === 'Aprovado' && (
                        <button onClick={() => handleGerarLinkFiscal(o)}
                          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 px-2.5 py-1.5 rounded-lg hover:bg-purple-500/10 cursor-pointer border border-purple-500/20">
                          📋 {temDadosFiscais ? 'Ver NF-e' : linkFiscalGerado ? 'Copiar Link NF-e' : 'Gerar Link NF-e'}
                        </button>
                      )}
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
          {/* Painel de filtros */}
          <div className="mb-5">
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input type="text" value={filtros.busca} onChange={e => setFiltro('busca', e.target.value)}
                  placeholder="Buscar por lead ou telefone..."
                  className="block w-full pl-10 pr-3 py-2.5 border border-dark-600 rounded-xl bg-dark-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-neon/50 text-sm" />
              </div>
              <button onClick={() => setFiltroAberto(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all whitespace-nowrap ${filtroAberto || filtrosAtivos > 0 ? 'bg-neon/10 text-neon border-neon/30' : 'bg-dark-800 text-zinc-400 hover:text-white border-dark-600'}`}>
                <SlidersHorizontal className="w-4 h-4" />
                Filtros
                {filtrosAtivos > 0 && <span className="bg-neon text-dark-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">{filtrosAtivos}</span>}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtroAberto ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={() => setFiltroSemLead(v => !v)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border cursor-pointer whitespace-nowrap transition-colors ${filtroSemLead ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-dark-800 text-zinc-400 hover:text-white border-dark-600'}`}>
                Sem lead {semLeadCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${filtroSemLead ? 'bg-red-500/30' : 'bg-dark-700'}`}>{semLeadCount}</span>}
              </button>
              <button onClick={handleVincularHistorico}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 cursor-pointer whitespace-nowrap transition-colors">
                <Link2 className="w-3.5 h-3.5" /> Vincular histórico
              </button>
              {filtrosAtivos > 0 && (
                <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white px-2.5 py-2.5 rounded-xl border border-dark-600 hover:border-dark-500 cursor-pointer transition-colors">
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
            {filtroAberto && (
              <div className="mt-3 p-4 bg-dark-800/60 border border-dark-700/40 rounded-2xl grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Produto</label>
                  <input type="text" value={filtros.produto} onChange={e => setFiltro('produto', e.target.value)}
                    placeholder="Ex: Remo, Bike..."
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 placeholder-zinc-600 text-sm focus:outline-none focus:border-neon/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data início</label>
                  <input type="date" value={filtros.dataInicio} onChange={e => setFiltro('dataInicio', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data fim</label>
                  <input type="date" value={filtros.dataFim} onChange={e => setFiltro('dataFim', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-neon/50" />
                </div>
              </div>
            )}
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
                      {/* Editar — orçamento gerado se existir, senão o link rápido */}
                      {l.slug_gerado ? (
                        <button onClick={() => navigate(`/?edit=${l.slug_gerado}`)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/10 cursor-pointer border border-blue-500/20">
                          <Edit2 className="w-3 h-3" /> Editar
                        </button>
                      ) : (
                        <button onClick={() => { setEditandoRapido(l); setEditRapidoForm({ nome_lead: l.nome_lead || '', produtos_texto: l.produtos_texto || '' }); }} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/10 cursor-pointer border border-blue-500/20">
                          <Edit2 className="w-3 h-3" /> Editar
                        </button>
                      )}
                      <button onClick={() => handleDuplicateRapido(l)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 cursor-pointer border border-indigo-500/20">
                        <CopyPlus className="w-3 h-3" /> Duplicar
                      </button>
                      {l.slug_gerado && (
                        <>
                          <a href={`/orcamento/${l.slug_gerado}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-neon hover:text-green-300 px-2.5 py-1.5 rounded-lg hover:bg-neon/10 cursor-pointer border border-neon/20">
                            <Eye className="w-3 h-3" /> Ver Orç.
                          </a>
                          <button onClick={() => handleGerarBlingRapido(l)} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 px-2.5 py-1.5 rounded-lg hover:bg-orange-500/10 cursor-pointer border border-orange-500/20">
                            <Send className="w-3 h-3" /> Bling
                          </button>
                        </>
                      )}
                      {/* Aprovar/Expirar — visível para todos os rápidos não finalizados */}
                      {statusGerado !== 'Aprovado' && statusGerado !== 'Expirado' && (
                        <button onClick={() => handleAprovarRapido(l)} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 cursor-pointer border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Aprovar
                        </button>
                      )}
                      {statusGerado !== 'Aprovado' && statusGerado !== 'Expirado' && (
                        <button onClick={() => changeStatusRapido(l, 'Expirado')} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 cursor-pointer border border-red-500/20">
                          <XCircle className="w-3 h-3" /> Expirar
                        </button>
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
