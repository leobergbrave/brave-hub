import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import {
  Award, TrendingUp, TrendingDown, FileText,
  Users, Zap, ChevronLeft, ChevronRight, Minus,
  Target, RefreshCw, Loader2, Filter,
  DollarSign, BarChart2, AlertTriangle, CheckCircle2, Calculator, Lightbulb,
} from 'lucide-react';

function parseCurrency(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

const ORIGENS_FIXAS = ['RD STATION', 'ENVIADO BRAVE', 'UAIROX', 'INDICAÇÃO'];

function Delta({ diff }) {
  if (diff === null || diff === undefined) return <span className="text-xs text-zinc-600">sem dados anteriores</span>;
  if (diff === 0) return <span className="flex items-center gap-1 text-xs text-zinc-500"><Minus className="w-3 h-3" /> igual ao mês anterior</span>;
  const up = diff > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{diff.toFixed(1)}% vs mês anterior
    </span>
  );
}

function GaugeBar({ pct, label }) {
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500';
  const textColor = pct >= 100 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : pct >= 40 ? 'text-orange-400' : 'text-red-400';
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={`text-sm font-black ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 bg-dark-900 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function Tooltip({ text, position = 'top' }) {
  const [show, setShow] = useState(false);
  const posClass = position === 'right'
    ? 'left-full top-1/2 -translate-y-1/2 ml-2'
    : 'bottom-full left-1/2 -translate-x-1/2 mb-2';
  return (
    <div className="relative inline-flex shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={() => setShow(v => !v)}>
      <span className="w-4 h-4 rounded-full bg-dark-700 border border-dark-600 text-zinc-500 text-[9px] font-black flex items-center justify-center cursor-help hover:bg-neon/20 hover:text-neon hover:border-neon/30 transition-colors select-none">?</span>
      {show && (
        <div className={`absolute ${posClass} z-[200] w-64 bg-dark-800 border border-dark-600 rounded-xl p-3 shadow-2xl shadow-black/60 pointer-events-none`}>
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">{text}</p>
          <div className={`absolute w-2 h-2 bg-dark-800 border-dark-600 rotate-45 ${position === 'right' ? 'border-b border-l -left-1 top-1/2 -translate-y-1/2' : 'border-b border-r top-full left-1/2 -translate-x-1/2 -mt-1'}`} />
        </div>
      )}
    </div>
  );
}

const TIPS = {
  cpl: `Quanto você paga em média para gerar 1 lead via tráfego pago.\n\nEx: R$1.000/mês em anúncios → 20 leads = CPL de R$50.\n\n📌 Quanto menor, mais eficiente seu tráfego.`,
  cac: `Custo real para adquirir 1 cliente.\nFórmula: CPL × leads necessários por venda.\n\nEx: CPL R$50 × 9 leads = CAC R$450.\n\n✅ Saudável: < 10% do ticket médio\n⚠️ Atenção: 10% a 20%\n🚨 Alto: > 20%`,
  roi: `Retorno sobre o investimento em marketing.\nFórmula: (Ticket − CAC) ÷ CAC × 100\n\nROI de 1.066% = para cada R$1 investido, você lucra R$10,66 ALÉM do que gastou.\n\n📌 Qualquer ROI positivo já é lucrativo.`,
  ltvcac: `Quantas vezes o ticket supera o CAC.\nFórmula: Ticket ÷ CAC\n\nLTV:CAC de 11,7x = o cliente vale 11,7x mais do que custou adquiri-lo.\n\n✅ Saudável: acima de 3x\n🏆 Excelente: acima de 5x`,
  payback: `Em quantos dias a receita da venda paga o custo de aquisição.\nFórmula: (CAC ÷ Ticket) × 30 dias\n\nPayback de 3 dias = o investimento em tráfego já se paga em 3 dias de receita gerada.\n\n📌 Quanto menor, mais rápido o retorno do capital.`,
  r1: `Mostra a alavancagem do seu canal de tráfego.\n\nSe o número é R$11,66 → cada R$1 investido em anúncios gera R$11,66 em receita bruta.\n\n📌 Use este número para justificar aumento de budget: "Cada real que eu peço de tráfego retorna R$11 de receita."`,
  sim: `Projeção baseada no CPL informado e na taxa de conversão real do mês atual.\n\n⚠️ É uma estimativa — na prática, volume maior de leads pode diluir a taxa de conversão.`,
  metaInvest: `Quanto você precisa investir em tráfego pago para atingir a meta de receita definida no topo.\n\nBaseado na taxa de conversão atual e no ticket médio do mês. Assume que a taxa se mantém constante.`,
  canal: `Compara a eficiência de cada canal de origem.\n\nInforme o CPL de cada canal para ver qual gera mais receita por real investido.\n\n📌 Canais orgânicos (indicação): CPL = R$0 → ROI é tecnicamente infinito. Priorize ações que gerem indicações.`,
  canCpl: `Custo por lead neste canal específico.\nEx: RD Station → CPL = R$30 (mensalidade ÷ leads gerados).\nIndicação → CPL = R$0.`,
  canCac: `Custo de aquisição de 1 cliente especificamente através deste canal.\nFórmula: CPL do canal × leads necessários por venda (do canal).`,
  canRoi: `Retorno sobre investimento deste canal.\n\n🟢 > 500%: canal excelente, escale\n🟡 100%–500%: bom, mantenha\n🔴 < 100%: revise ou pause`,
};

function calcList(list) {
  const aprovados = list.filter(o => o.payload?.status === 'Aprovado');
  const receita   = aprovados.reduce((s, o) => {
    const v = o.valor_fechado != null ? o.valor_fechado : (o.payload?.itens || []).reduce((a, i) => a + i.preco * i.quantidade, 0);
    return s + v;
  }, 0);
  const ticket = aprovados.length > 0 ? receita / aprovados.length : 0;
  const taxa   = list.length > 0 ? (aprovados.length / list.length) * 100 : 0;
  return { total: list.length, vendas: aprovados.length, receita, ticket, taxa };
}

export default function CockpitTab() {
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [meta, setMeta] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(null);

  // Marketing Intelligence — persiste no localStorage
  const [cplGlobal, setCplGlobal] = useState(() => localStorage.getItem('cockpit_cpl') || '');
  const [orcamentoSim, setOrcamentoSim] = useState(() => localStorage.getItem('cockpit_sim') || '');
  const [cplPorOrigem, setCplPorOrigem] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cockpit_cpl_origem') || '{}'); }
    catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('cockpit_cpl', cplGlobal); }, [cplGlobal]);
  useEffect(() => { localStorage.setItem('cockpit_sim', orcamentoSim); }, [orcamentoSim]);
  useEffect(() => { localStorage.setItem('cockpit_cpl_origem', JSON.stringify(cplPorOrigem)); }, [cplPorOrigem]); // stores all raw data for client-side filtering

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = mes.split('-').map(Number);
      const start     = new Date(year, month - 1, 1).toISOString();
      const end       = new Date(year, month,     1).toISOString();
      const prevStart = new Date(year, month - 2, 1).toISOString();

      const [
        { data: orcs },
        { data: orcsAnt },
        { data: linksAll },
        { data: leadsData },
        { count: disparosCount },
      ] = await Promise.all([
        supabase.from('orcamentos_salvos').select('*').gte('criado_em', start).lt('criado_em', end),
        supabase.from('orcamentos_salvos').select('id,payload,valor_fechado').gte('criado_em', prevStart).lt('criado_em', start),
        supabase.from('links_rapidos').select('slug_gerado').not('slug_gerado', 'is', null),
        supabase.from('leads').select('id').gte('criado_em', start).lt('criado_em', end),
        supabase.from('disparo_fila').select('*', { count: 'exact', head: true })
          .gte('sent_at', start).lt('sent_at', end).eq('status', 'sent'),
      ]);

      const rapidoSlugs = new Set((linksAll || []).map(l => l.slug_gerado));
      const orcsAtual   = orcs || [];

      // Breakdown por origem (sempre com todos os dados)
      const origemMap = {};
      orcsAtual.forEach(o => {
        const orig = o.origem_lead || 'Não informado';
        if (!origemMap[orig]) origemMap[orig] = [];
        origemMap[orig].push(o);
      });
      const porOrigem = Object.entries(origemMap)
        .map(([origem, list]) => ({ origem, ...calcList(list) }))
        .sort((a, b) => b.receita - a.receita);

      // Lista de origens únicas para o filtro
      const origensUnicas = ['Todos', ...Object.keys(origemMap).sort()];

      setRaw({
        orcsAtual,
        rapidoSlugs,
        leads: leadsData?.length || 0,
        disparos: disparosCount || 0,
        anterior: calcList(orcsAnt || []),
        porOrigem,
        origensUnicas,
      });
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => { load(); }, [load]);

  // Métricas derivadas — reagem ao filtro de origem sem re-fetch
  const dados = useMemo(() => {
    if (!raw) return null;
    const { orcsAtual, rapidoSlugs, leads, disparos, anterior, porOrigem, origensUnicas } = raw;

    const orcsFiltered = filtroOrigem === 'Todos'
      ? orcsAtual
      : orcsAtual.filter(o => (o.origem_lead || 'Não informado') === filtroOrigem);

    const manuais = orcsFiltered.filter(o => !rapidoSlugs.has(o.slug));
    const rapidos  = orcsFiltered.filter(o =>  rapidoSlugs.has(o.slug));

    const dManuais = calcList(manuais);
    const dRapidos = calcList(rapidos);
    const vendasTotal  = dManuais.vendas + dRapidos.vendas;
    const receitaTotal = dManuais.receita + dRapidos.receita;
    const ticketTotal  = vendasTotal > 0 ? receitaTotal / vendasTotal : 0;
    const taxaTotal    = orcsFiltered.length > 0 ? (vendasTotal / orcsFiltered.length) * 100 : 0;

    const pctDiff = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

    return {
      manuais: dManuais,
      rapidos: dRapidos,
      total:   { orcs: orcsFiltered.length, vendas: vendasTotal, receita: receitaTotal, ticket: ticketTotal, taxa: taxaTotal },
      efic:    {
        leads,
        disparos,
        leadsPorVenda:    vendasTotal > 0 ? (leads               / vendasTotal).toFixed(1) : '—',
        orcsPorVenda:     vendasTotal > 0 ? (orcsFiltered.length  / vendasTotal).toFixed(1) : '—',
        disparosPorVenda: vendasTotal > 0 ? (disparos             / vendasTotal).toFixed(1) : '—',
      },
      anterior,
      diffs: {
        receita: pctDiff(receitaTotal, anterior.receita),
        vendas:  pctDiff(vendasTotal,  anterior.vendas),
        taxa:    pctDiff(taxaTotal,    anterior.taxa),
      },
      porOrigem,
      origensUnicas,
    };
  }, [raw, filtroOrigem]);

  const metaNum = parseCurrency(meta);

  // Métricas de Marketing Intelligence
  const mkt = useMemo(() => {
    if (!dados) return null;
    const cpl       = parseCurrency(cplGlobal);
    const simBudget = parseCurrency(orcamentoSim);
    const leadsPerVenda = parseFloat(dados.efic.leadsPorVenda) || 0;
    const ticket    = dados.total.ticket || 0;
    const taxa      = dados.total.taxa || 0; // %

    if (!cpl) return { needsCpl: true, porCanal: [] };

    // ── CAC & ROI Global ──
    const cac = leadsPerVenda > 0 ? cpl * leadsPerVenda : null;
    const roi = cac && ticket ? ((ticket - cac) / cac) * 100 : null;
    const ltvCac = cac && ticket ? ticket / cac : null;
    const retornoPorReal = ltvCac;
    const paybackDias = cac && ticket ? Math.round((cac / ticket) * 30) : null;
    const cacPct = cac && ticket ? (cac / ticket) * 100 : 0;
    const cacHealth = cacPct === 0 ? 'zero' : cacPct < 10 ? 'green' : cacPct < 20 ? 'amber' : 'red';

    // ── Simulador ──
    let sim = null;
    if (simBudget > 0 && cpl > 0) {
      const simLeads  = Math.round(simBudget / cpl);
      const simVendas = taxa > 0 ? simLeads * (taxa / 100) : 0;
      const simReceita = simVendas * ticket;
      const simRoi    = simBudget > 0 ? ((simReceita - simBudget) / simBudget) * 100 : 0;
      sim = { simLeads, simVendas: simVendas.toFixed(1), simReceita, simRoi };
    }

    // ── Investimento para a meta ──
    let metaInvest = null;
    if (metaNum > 0 && ticket > 0 && taxa > 0 && cpl > 0) {
      const vendasNecessarias = metaNum / ticket;
      const leadsNecessarios  = vendasNecessarias / (taxa / 100);
      const investNecessario  = leadsNecessarios * cpl;
      metaInvest = {
        vendasNecessarias: vendasNecessarias.toFixed(1),
        leadsNecessarios: Math.round(leadsNecessarios),
        investNecessario,
        jaTemVendas: dados.total.vendas,
        falta: Math.max(0, vendasNecessarias - dados.total.vendas),
      };
    }

    // ── ROI por canal ──
    const porCanal = (dados.porOrigem || []).map(canal => {
      const cplC = parseCurrency(cplPorOrigem[canal.origem] || '');
      const leadsPerVendaCanal = canal.vendas > 0 ? canal.total / canal.vendas : 0;
      const cacC = cplC > 0 && leadsPerVendaCanal > 0 ? cplC * leadsPerVendaCanal : null;
      const roiC = cacC && canal.ticket > 0 ? ((canal.ticket - cacC) / cacC) * 100 : null;
      const investTotal = cplC > 0 ? cplC * canal.total : null;
      return { ...canal, cplC, cacC, roiC, investTotal };
    });

    return { cac, roi, ltvCac, retornoPorReal, paybackDias, cacHealth, cacPct, sim, metaInvest, porCanal, cpl };
  }, [dados, cplGlobal, orcamentoSim, cplPorOrigem, metaNum]);

  const changeMonth = (dir) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const mesLabel = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const pctMeta  = metaNum > 0 && dados ? Math.min((dados.total.receita / metaNum) * 100, 150) : 0;

  return (
    <div className="max-w-5xl pb-12 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Award className="w-6 h-6 text-neon" /> Cockpit de Performance
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Sua eficiência comercial em números</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
          {/* Filtro de origem */}
          {dados?.origensUnicas?.length > 1 && (
            <div className="flex items-center gap-1.5 bg-dark-800 border border-dark-700 rounded-xl px-3 py-2">
              <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <select
                value={filtroOrigem}
                onChange={e => setFiltroOrigem(e.target.value)}
                className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer"
              >
                {dados.origensUnicas.map(o => (
                  <option key={o} value={o} className="bg-dark-900">{o}</option>
                ))}
              </select>
            </div>
          )}
          {/* Navegador de mês */}
          <div className="flex items-center gap-1 bg-dark-800 border border-dark-700 rounded-xl p-1">
            <button onClick={() => changeMonth(-1)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-dark-700 cursor-pointer transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white px-3 capitalize min-w-[150px] text-center">{mesLabel}</span>
            <button onClick={() => changeMonth(1)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-dark-700 cursor-pointer transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando métricas...
        </div>
      ) : !dados ? null : (<>

        {/* ── Badge de filtro ativo ── */}
        {filtroOrigem !== 'Todos' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Filtrando por:</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-neon/10 text-neon border border-neon/20">
              {filtroOrigem}
            </span>
            <button onClick={() => setFiltroOrigem('Todos')} className="text-xs text-zinc-500 hover:text-white underline cursor-pointer">
              Limpar
            </button>
          </div>
        )}

        {/* ── Meta + Atingimento ── */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Meta do mês (R$)</p>
              <input
                type="text"
                value={meta}
                onChange={e => setMeta(e.target.value)}
                placeholder="Ex: 50.000"
                className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-neon/50"
              />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Receita realizada</p>
              <p className="text-3xl font-black text-neon">{formatCurrency(dados.total.receita)}</p>
            </div>
            {metaNum > 0 && (
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Atingimento da meta</p>
                <p className={`text-3xl font-black ${pctMeta >= 100 ? 'text-emerald-400' : pctMeta >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                  {Math.min(pctMeta, 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
          {metaNum > 0 && (
            <GaugeBar pct={pctMeta} label={`${formatCurrency(dados.total.receita)} de ${formatCurrency(metaNum)}`} />
          )}
        </div>

        {/* ── KPIs principais ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Orçamentos gerados', value: dados.total.orcs,                   color: 'text-blue-400',    icon: FileText },
            { label: 'Vendas fechadas',    value: dados.total.vendas,                 color: 'text-emerald-400', icon: Target },
            { label: 'Ticket médio',       value: formatCurrency(dados.total.ticket), color: 'text-purple-400',  icon: TrendingUp },
            { label: 'Taxa de fechamento', value: `${dados.total.taxa.toFixed(1)}%`,  color: 'text-neon',        icon: Award },
          ].map((s, i) => (
            <div key={i} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-tight">{s.label}</p>
              </div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Para fechar 1 venda ── */}
        <div className="bg-gradient-to-br from-neon/5 via-dark-800/60 to-emerald-900/10 border border-neon/20 rounded-2xl p-6">
          <p className="text-[10px] font-bold text-neon/70 uppercase tracking-widest mb-6 text-center">
            Para fechar 1 venda em {mesLabel}{filtroOrigem !== 'Todos' ? ` · ${filtroOrigem}` : ''} você precisou de...
          </p>
          <div className="grid grid-cols-3 gap-6">
            {[
              { icon: Users,    label: 'Leads gerados',  value: dados.efic.leadsPorVenda,    sub: `${dados.efic.leads} leads no mês` },
              { icon: FileText, label: 'Orçamentos',     value: dados.efic.orcsPorVenda,     sub: `${dados.total.orcs} orçamentos no mês` },
              { icon: Zap,      label: 'Disparos',       value: dados.efic.disparosPorVenda, sub: `${dados.efic.disparos} disparos no mês` },
            ].map((e, i) => (
              <div key={i} className="text-center">
                <div className="w-10 h-10 rounded-2xl bg-neon/10 border border-neon/20 flex items-center justify-center mx-auto mb-3">
                  <e.icon className="w-5 h-5 text-neon/70" />
                </div>
                <p className="text-5xl font-black text-white mb-1">{e.value}</p>
                <p className="text-xs font-bold text-neon/60 uppercase tracking-wider">{e.label}</p>
                <p className="text-[10px] text-zinc-600 mt-1">{e.sub}</p>
              </div>
            ))}
          </div>
          {dados.total.vendas === 0 && (
            <p className="text-center text-xs text-zinc-600 mt-4">Sem vendas fechadas neste mês ainda</p>
          )}
        </div>

        {/* ── Manual vs Link Rápido ── */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-700/40 flex items-center gap-3">
            <p className="text-sm font-bold text-white">Manual vs Link Rápido</p>
            <div className="flex items-center gap-3 ml-auto text-[10px] font-bold uppercase tracking-wider">
              <span className="text-blue-400">■ Manual</span>
              <span className="text-purple-400">■ Link Rápido</span>
              <span className="text-neon">■ Total</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/30">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Métrica</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-blue-400 uppercase tracking-wider">Manual</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-purple-400 uppercase tracking-wider">Link Rápido</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-neon uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/20">
                {[
                  { label: 'Orçamentos gerados', m: dados.manuais.total,   r: dados.rapidos.total,   t: dados.total.orcs,    fmt: v => v },
                  { label: 'Vendas fechadas',    m: dados.manuais.vendas,  r: dados.rapidos.vendas,  t: dados.total.vendas,  fmt: v => v },
                  { label: 'Receita',            m: dados.manuais.receita, r: dados.rapidos.receita, t: dados.total.receita, fmt: formatCurrency },
                  { label: 'Ticket médio',       m: dados.manuais.ticket,  r: dados.rapidos.ticket,  t: dados.total.ticket,  fmt: formatCurrency },
                  { label: 'Taxa de conversão',  m: dados.manuais.taxa,    r: dados.rapidos.taxa,    t: dados.total.taxa,    fmt: v => `${v.toFixed(1)}%` },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-dark-700/20 transition-colors">
                    <td className="px-5 py-3.5 text-zinc-300 font-medium">{row.label}</td>
                    <td className="px-5 py-3.5 text-right text-blue-400 font-bold">{row.fmt(row.m)}</td>
                    <td className="px-5 py-3.5 text-right text-purple-400 font-bold">{row.fmt(row.r)}</td>
                    <td className="px-5 py-3.5 text-right text-white font-black">{row.fmt(row.t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Breakdown por Origem ── */}
        {dados.porOrigem.length > 0 && (
          <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-700/40 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Performance por Origem</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">todos os canais · {mesLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/30">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Origem</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Orç.</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vendas</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Receita</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ticket</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Taxa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/20">
                  {dados.porOrigem.map((row, i) => {
                    const isActive = filtroOrigem === row.origem;
                    return (
                      <tr key={i}
                        onClick={() => setFiltroOrigem(isActive ? 'Todos' : row.origem)}
                        className={`transition-colors cursor-pointer ${isActive ? 'bg-neon/5 border-l-2 border-l-neon' : 'hover:bg-dark-700/20'}`}>
                        <td className="px-5 py-3.5">
                          <span className={`text-sm font-bold ${isActive ? 'text-neon' : 'text-white'}`}>{row.origem}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-zinc-300 font-medium">{row.total}</td>
                        <td className="px-4 py-3.5 text-right text-emerald-400 font-bold">{row.vendas}</td>
                        <td className="px-4 py-3.5 text-right text-white font-bold">{formatCurrency(row.receita)}</td>
                        <td className="px-4 py-3.5 text-right text-purple-400 font-medium">{formatCurrency(row.ticket)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${row.taxa >= 10 ? 'bg-emerald-500/20 text-emerald-400' : row.taxa >= 5 ? 'bg-amber-500/20 text-amber-400' : 'bg-dark-700 text-zinc-400'}`}>
                            {row.taxa.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-zinc-600 px-5 py-3 border-t border-dark-700/30">
              Clique em uma linha para filtrar todas as métricas por essa origem
            </p>
          </div>
        )}

        {/* ── Comparativo mês anterior ── */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4">Comparativo com mês anterior</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Receita',         atual: dados.total.receita,                     ant: dados.anterior.receita,              fmt: formatCurrency, diff: dados.diffs.receita },
              { label: 'Vendas fechadas', atual: dados.total.vendas,                      ant: dados.anterior.vendas,               fmt: v => v,         diff: dados.diffs.vendas },
              { label: 'Taxa conversão',  atual: dados.total.taxa.toFixed(1) + '%',       ant: (dados.anterior.taxa || 0).toFixed(1) + '%', fmt: v => v, diff: dados.diffs.taxa },
            ].map((c, i) => (
              <div key={i} className="bg-dark-900/50 rounded-xl p-4">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-2xl font-black text-white mb-1">{c.fmt(c.atual)}</p>
                <Delta diff={c.diff} />
                <p className="text-[10px] text-zinc-600 mt-1">Anterior: {c.fmt(c.ant)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            MARKETING INTELLIGENCE — Painel CFO
            ══════════════════════════════════════════ */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-700/40 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-neon" />
            <p className="text-sm font-bold text-white">Marketing Intelligence</p>
            <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">Painel CFO</span>
          </div>

          <div className="p-5 space-y-6">

            {/* ── Inputs ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                  CPL — Custo por Lead (R$) <Tooltip text={TIPS.cpl} />
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input type="text" value={cplGlobal} onChange={e => setCplGlobal(e.target.value)}
                    placeholder="Ex: 45,00"
                    className="w-full pl-8 pr-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-neon/50" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Simular orçamento de tráfego (R$) <Tooltip text={TIPS.sim} />
                </label>
                <div className="relative">
                  <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input type="text" value={orcamentoSim} onChange={e => setOrcamentoSim(e.target.value)}
                    placeholder="Ex: 5.000,00"
                    className="w-full pl-8 pr-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-neon/50" />
                </div>
              </div>
            </div>

            {!mkt || mkt.needsCpl ? (
              <div className="flex items-center gap-3 py-4 px-4 rounded-xl bg-dark-900/50 border border-dark-700/30">
                <Lightbulb className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-sm text-zinc-400">Informe o <strong className="text-white">CPL (Custo por Lead)</strong> acima para ativar as métricas de Marketing Intelligence.</p>
              </div>
            ) : (<>

              {/* ── CAC + ROI + LTV:CAC + Payback ── */}
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Métricas de Aquisição</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'CAC',
                      sub: 'Custo de aquisição',
                      value: mkt.cac ? formatCurrency(mkt.cac) : '—',
                      color: mkt.cacHealth === 'green' ? 'text-emerald-400' : mkt.cacHealth === 'amber' ? 'text-amber-400' : 'text-red-400',
                      icon: DollarSign,
                      tip: TIPS.cac,
                    },
                    {
                      label: 'ROI de Marketing',
                      sub: 'Retorno sobre investimento',
                      value: mkt.roi != null ? `${mkt.roi.toFixed(0)}%` : '—',
                      color: 'text-neon',
                      icon: TrendingUp,
                      tip: TIPS.roi,
                    },
                    {
                      label: 'LTV:CAC',
                      sub: 'Ratio de eficiência',
                      value: mkt.ltvCac != null ? `${mkt.ltvCac.toFixed(1)}x` : '—',
                      color: 'text-purple-400',
                      icon: Award,
                      tip: TIPS.ltvcac,
                    },
                    {
                      label: 'Payback',
                      sub: 'Recuperação do CAC',
                      value: mkt.paybackDias != null ? `${mkt.paybackDias} dias` : '—',
                      color: 'text-blue-400',
                      icon: Target,
                      tip: TIPS.payback,
                    },
                  ].map((s, i) => (
                    <div key={i} className="bg-dark-900/60 border border-dark-700/40 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider leading-tight flex-1">{s.label}</p>
                        <Tooltip text={s.tip} />
                      </div>
                      <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Alerta de CAC */}
                {mkt.cacHealth === 'red' && (
                  <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">
                      <strong>CAC elevado:</strong> seu custo de aquisição representa {mkt.cacPct.toFixed(1)}% do ticket médio. O ideal é abaixo de 10%. Revise o CPL ou melhore a taxa de conversão.
                    </p>
                  </div>
                )}
                {mkt.cacHealth === 'amber' && (
                  <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      <strong>CAC moderado:</strong> {mkt.cacPct.toFixed(1)}% do ticket. Acompanhe de perto — aumentar a taxa de conversão reduz o CAC sem custo adicional.
                    </p>
                  </div>
                )}
                {mkt.cacHealth === 'green' && mkt.cac && (
                  <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-300">
                      <strong>CAC saudável:</strong> apenas {mkt.cacPct.toFixed(1)}% do ticket. Escalar o investimento em tráfego é altamente recomendável.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Para cada R$1 ── */}
              {mkt.retornoPorReal && (
                <div className="relative rounded-2xl overflow-hidden border border-neon/20 p-5" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04) 0%, rgba(16,185,129,0.08) 100%)' }}>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <p className="text-[10px] font-bold text-neon/60 uppercase tracking-widest">Eficiência de Tráfego</p>
                    <Tooltip text={TIPS.r1} />
                  </div>
                  <div className="text-center">
                    <p className="text-zinc-400 text-sm mb-1">Para cada <strong className="text-white">R$ 1,00</strong> investido em tráfego</p>
                    <p className="text-5xl font-black text-neon my-2">{formatCurrency(mkt.retornoPorReal)}</p>
                    <p className="text-zinc-500 text-xs">em receita gerada · ROI de <strong className="text-neon">{mkt.roi?.toFixed(0)}%</strong></p>
                  </div>
                </div>
              )}

              {/* ── Simulador de crescimento ── */}
              {mkt.sim && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Simulador — Se você investir {formatCurrency(parseCurrency(orcamentoSim))} em tráfego</p>
                    <Tooltip text={TIPS.sim} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: 'Leads estimados',  value: mkt.sim.simLeads,              color: 'text-blue-400' },
                      { label: 'Vendas estimadas', value: mkt.sim.simVendas,             color: 'text-emerald-400' },
                      { label: 'Receita projetada', value: formatCurrency(mkt.sim.simReceita), color: 'text-neon' },
                    ].map((s, i) => (
                      <div key={i} className="bg-dark-900/60 border border-dark-700/40 rounded-xl p-3 text-center">
                        <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-dark-900/50 rounded-xl p-3 border border-dark-700/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-zinc-500">ROI projetado</span>
                      <span className={`text-sm font-black ${mkt.sim.simRoi > 0 ? 'text-neon' : 'text-red-400'}`}>{mkt.sim.simRoi.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-neon to-emerald-500 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(Math.max((mkt.sim.simReceita / (parseCurrency(orcamentoSim) * 20)) * 100, 2), 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1">Break-even: investimento = receita quando ROI = 0%</p>
                  </div>
                </div>
              )}

              {/* ── Investimento para bater a meta ── */}
              {mkt.metaInvest && (
                <div className="bg-dark-900/50 border border-dark-700/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-neon" />
                    <p className="text-xs font-bold text-white">Para atingir a meta de {formatCurrency(metaNum)}</p>
                    <Tooltip text={TIPS.metaInvest} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-black text-white">{mkt.metaInvest.vendasNecessarias}</p>
                      <p className="text-[10px] text-zinc-500">vendas necessárias</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-blue-400">{mkt.metaInvest.leadsNecessarios}</p>
                      <p className="text-[10px] text-zinc-500">leads necessários</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-amber-400">{formatCurrency(mkt.metaInvest.investNecessario)}</p>
                      <p className="text-[10px] text-zinc-500">investimento em tráfego</p>
                    </div>
                  </div>
                  {mkt.metaInvest.falta > 0 && (
                    <p className="text-[11px] text-zinc-500 mt-3 text-center">
                      Você já fez <strong className="text-white">{mkt.metaInvest.jaTemVendas}</strong> {mkt.metaInvest.jaTemVendas === 1 ? 'venda' : 'vendas'} este mês. Faltam <strong className="text-neon">{mkt.metaInvest.falta.toFixed(1)}</strong> para bater a meta.
                    </p>
                  )}
                </div>
              )}

              {/* ── ROI por Canal ── */}
              {mkt.porCanal.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">ROI por Canal de Origem — informe o CPL de cada canal</p>
                    <Tooltip text={TIPS.canal} />
                  </div>
                  <div className="rounded-xl overflow-hidden border border-dark-700/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700/40 bg-dark-900/50">
                          <th className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Canal</th>
                          <th className="text-center px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider"><span className="flex items-center justify-center gap-1">CPL (R$) <Tooltip text={TIPS.canCpl} /></span></th>
                          <th className="text-right px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider"><span className="flex items-center justify-end gap-1">CAC <Tooltip text={TIPS.canCac} /></span></th>
                          <th className="text-right px-3 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider"><span className="flex items-center justify-end gap-1">ROI <Tooltip text={TIPS.canRoi} /></span></th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vendas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-700/20">
                        {mkt.porCanal.map((canal, i) => {
                          const roiColor = canal.roiC == null ? 'text-zinc-500' : canal.roiC > 500 ? 'text-emerald-400' : canal.roiC > 100 ? 'text-amber-400' : 'text-red-400';
                          return (
                            <tr key={i} className="hover:bg-dark-700/20 transition-colors">
                              <td className="px-4 py-3 text-white font-semibold text-xs">{canal.origem}</td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="text"
                                  value={cplPorOrigem[canal.origem] || ''}
                                  onChange={e => setCplPorOrigem(prev => ({ ...prev, [canal.origem]: e.target.value }))}
                                  placeholder="0,00"
                                  className="w-20 text-center text-xs bg-dark-900 border border-dark-600 rounded-lg px-2 py-1.5 text-white placeholder-zinc-600 focus:outline-none focus:border-neon/50"
                                />
                              </td>
                              <td className="px-3 py-3 text-right text-xs text-zinc-300">{canal.cacC ? formatCurrency(canal.cacC) : '—'}</td>
                              <td className="px-3 py-3 text-right">
                                {canal.roiC != null ? (
                                  <span className={`text-xs font-black ${roiColor}`}>{canal.roiC.toFixed(0)}%</span>
                                ) : (
                                  <span className="text-xs text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-emerald-400 font-bold">{canal.vendas}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-2 text-center">Digite 0 para canais orgânicos (indicação, etc.) — o ROI será ∞</p>
                </div>
              )}

            </>)}
          </div>
        </div>

      </>)}
    </div>
  );
}
