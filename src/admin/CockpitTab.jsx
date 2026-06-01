import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';
import {
  Award, TrendingUp, TrendingDown, FileText,
  Users, Zap, ChevronLeft, ChevronRight, Minus,
  Target, RefreshCw, Loader2,
} from 'lucide-react';

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

export default function CockpitTab() {
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [meta, setMeta] = useState('');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = mes.split('-').map(Number);
      const start    = new Date(year, month - 1, 1).toISOString();
      const end      = new Date(year, month,     1).toISOString();
      const prevStart = new Date(year, month - 2, 1).toISOString();
      const prevEnd   = start;

      const [
        { data: orcs },
        { data: orcsAnt },
        { data: linksAll },
        { data: leadsData },
        { count: disparosCount },
      ] = await Promise.all([
        supabase.from('orcamentos_salvos').select('*').gte('criado_em', start).lt('criado_em', end),
        supabase.from('orcamentos_salvos').select('id,payload,valor_fechado,aprovado_em').gte('criado_em', prevStart).lt('criado_em', prevEnd),
        supabase.from('links_rapidos').select('slug_gerado').not('slug_gerado', 'is', null),
        supabase.from('leads').select('id').gte('criado_em', start).lt('criado_em', end),
        supabase.from('disparo_fila').select('*', { count: 'exact', head: true })
          .gte('sent_at', start).lt('sent_at', end).eq('status', 'sent'),
      ]);

      const rapidoSlugs = new Set((linksAll || []).map(l => l.slug_gerado));

      const calcValor = (o) =>
        o.valor_fechado != null
          ? o.valor_fechado
          : (o.payload?.itens || []).reduce((s, i) => s + i.preco * i.quantidade, 0);

      const calcList = (list) => {
        const aprovados = list.filter(o => o.payload?.status === 'Aprovado');
        const receita   = aprovados.reduce((s, o) => s + calcValor(o), 0);
        const ticket    = aprovados.length > 0 ? receita / aprovados.length : 0;
        const taxa      = list.length > 0 ? (aprovados.length / list.length) * 100 : 0;
        return { total: list.length, vendas: aprovados.length, receita, ticket, taxa };
      };

      const orcsAtual  = orcs || [];
      const manuais    = orcsAtual.filter(o => !rapidoSlugs.has(o.slug));
      const rapidos    = orcsAtual.filter(o =>  rapidoSlugs.has(o.slug));

      const dManuais   = calcList(manuais);
      const dRapidos   = calcList(rapidos);
      const vendasTotal = dManuais.vendas + dRapidos.vendas;
      const receitaTotal = dManuais.receita + dRapidos.receita;
      const ticketTotal = vendasTotal > 0 ? receitaTotal / vendasTotal : 0;
      const taxaTotal   = orcsAtual.length > 0 ? (vendasTotal / orcsAtual.length) * 100 : 0;

      const leads     = leadsData?.length || 0;
      const disparos  = disparosCount || 0;

      const dAnt = calcList(orcsAnt || []);

      const pctDiff = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

      setDados({
        manuais:  dManuais,
        rapidos:  dRapidos,
        total:    { orcs: orcsAtual.length, vendas: vendasTotal, receita: receitaTotal, ticket: ticketTotal, taxa: taxaTotal },
        efic:     {
          leads,
          disparos,
          leadsPorVenda:   vendasTotal > 0 ? (leads    / vendasTotal).toFixed(1) : '—',
          orcsPorVenda:    vendasTotal > 0 ? (orcsAtual.length / vendasTotal).toFixed(1) : '—',
          disparosPorVenda: vendasTotal > 0 ? (disparos / vendasTotal).toFixed(1) : '—',
        },
        anterior: dAnt,
        diffs: {
          receita: pctDiff(receitaTotal, dAnt.receita),
          vendas:  pctDiff(vendasTotal, dAnt.vendas),
          taxa:    pctDiff(taxaTotal, dAnt.taxa),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => { load(); }, [load]);

  const changeMonth = (dir) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const mesLabel = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const metaNum  = parseFloat(meta.replace(/\./g, '').replace(',', '.')) || 0;
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
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-800 transition-colors cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
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
            { label: 'Orçamentos gerados', value: dados.total.orcs,                      color: 'text-blue-400',   icon: FileText },
            { label: 'Vendas fechadas',    value: dados.total.vendas,                    color: 'text-emerald-400', icon: Target },
            { label: 'Ticket médio',       value: formatCurrency(dados.total.ticket),    color: 'text-purple-400', icon: TrendingUp },
            { label: 'Taxa de fechamento', value: `${dados.total.taxa.toFixed(1)}%`,     color: 'text-neon',       icon: Award },
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
            Para fechar 1 venda em {mesLabel} você precisou de...
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

        {/* ── Comparativo mês anterior ── */}
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4">Comparativo com mês anterior</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Receita',          atual: dados.total.receita,       ant: dados.anterior.receita, fmt: formatCurrency, diff: dados.diffs.receita },
              { label: 'Vendas fechadas',  atual: dados.total.vendas,        ant: dados.anterior.vendas,  fmt: v => v,         diff: dados.diffs.vendas },
              { label: 'Taxa conversão',   atual: dados.total.taxa.toFixed(1) + '%', ant: dados.anterior.taxa?.toFixed(1) + '%', fmt: v => v, diff: dados.diffs.taxa },
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

      </>)}
    </div>
  );
}
