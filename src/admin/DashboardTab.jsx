import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, TrendingUp, Users, Send, CheckCircle2, Clock, Zap, Target, Loader2, Flame, Thermometer, Snowflake } from 'lucide-react';
import { formatCurrency } from '../data';

export default function DashboardTab() {
  const [stats, setStats] = useState({
    produtos: 0,
    pendentes: 0,
    aprovados: 0,
    valorAprovado: 0,
    ticketMedio: 0,
    conversao: 0,
    totalGerados: 0,
    potencialVendas: 0
  });
  const [leadsStats, setLeadsStats] = useState({
    total: 0, agora: 0, breve: 0, comparando: 0, entender: 0,
    novo: 0, fluxo_disparado: 0, link_aberto: 0,
    orcamento_gerado: 0, convertido: 0,
    taxaConversao: 0,
  });
  const [pendingDisparos, setPendingDisparos] = useState([]);
  const [recentWins, setRecentWins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all needed data in parallel
      const [
        { count: pCount },
        { data: orcs },
        { data: tData },
        { data: leadsData }
      ] = await Promise.all([
        supabase.from('produtos').select('*', { count: 'exact', head: true }),
        supabase.from('orcamentos_salvos').select('*').order('criado_em', { ascending: false }),
        supabase.from('marketing_templates').select('*'),
        supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      ]);

      const orcamentos = orcs || [];
      const totalGerados = orcamentos.length;
      
      const calcTotal = (o) => {
        const itens = o.payload?.itens || [];
        return itens.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
      };

      const pendentes = orcamentos.filter(o => (o.payload?.status || 'Pendente') === 'Pendente');
      const aprovados = orcamentos.filter(o => o.payload?.status === 'Aprovado');
      
      const valorAprovado = aprovados.reduce((s, o) => s + calcTotal(o), 0);
      const potencialVendas = pendentes.reduce((s, o) => s + calcTotal(o), 0);

      setStats({
        produtos: pCount || 0,
        totalGerados,
        pendentes: pendentes.length,
        aprovados: aprovados.length,
        valorAprovado,
        potencialVendas,
        ticketMedio: aprovados.length > 0 ? valorAprovado / aprovados.length : 0,
        conversao: totalGerados > 0 ? ((aprovados.length / totalGerados) * 100).toFixed(1) : 0
      });

      setRecentWins(aprovados.slice(0, 5));

      // Leads stats
      const leads = leadsData || [];
      const countStatus = (s) => leads.filter(l => l.status === s).length;
      const convertidos = countStatus('convertido');
      const countMomento = (v) => leads.filter(l => l.momento_compra === v).length;
      setLeadsStats({
        total: leads.length,
        agora:  countMomento('Quero comprar agora'),
        breve:  countMomento('Quero comprar em breve (até 30 dias)'),
        comparando: countMomento('Estou comparando opções'),
        entender:   countMomento('Só quero entender melhor o produto'),
        novo:             countStatus('novo'),
        fluxo_disparado:  countStatus('fluxo_disparado'),
        link_aberto:      countStatus('link_aberto'),
        orcamento_gerado: countStatus('orcamento_gerado'),
        convertido:       convertidos,
        taxaConversao: leads.length > 0 ? ((convertidos / leads.length) * 100).toFixed(1) : 0,
      });

      // Calculate Disparos
      const activeTemplates = (tData || []).filter(t => t.ativo).sort((a, b) => b.dias_delay - a.dias_delay);
      const now = new Date();
      const disparos = [];

      for (const o of pendentes) {
        if (!o.payload?.telefoneCliente) continue;

        const diffDays = Math.floor(Math.abs(now - new Date(o.criado_em)) / (1000 * 60 * 60 * 24));
        const marketingSent = o.payload?.marketing_sent || [];
        
        for (const t of activeTemplates) {
          if (diffDays >= t.dias_delay && !marketingSent.includes(t.id)) {
            disparos.push({ orcamento: o, template: t });
            break;
          }
        }
      }
      setPendingDisparos(disparos);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDisparar = async () => {
    const webhookUrl = import.meta.env.VITE_BOTCONVERSA_WEBHOOK;
    if (!webhookUrl) {
      alert("⚠️ A URL do Webhook do BotConversa (VITE_BOTCONVERSA_WEBHOOK) não está configurada na Vercel!");
      return;
    }

    setSending(true);
    let successCount = 0;

    for (const d of pendingDisparos) {
      try {
        const mensagemFormatada = d.template.mensagem.replace(/{cliente}/g, d.orcamento.cliente);
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: d.orcamento.cliente,
            telefone: d.orcamento.payload.telefoneCliente,
            consultor: d.orcamento.consultor,
            campanha: d.template.nome,
            mensagem_formatada: mensagemFormatada,
            media_url: d.template.media_url || ''
          })
        });

        const sent = d.orcamento.payload.marketing_sent || [];
        const newPayload = { ...d.orcamento.payload, marketing_sent: [...sent, d.template.id] };
        await supabase.from('orcamentos_salvos').update({ payload: newPayload }).eq('id', d.orcamento.id);
        successCount++;
      } catch (err) {
        console.error("Erro disparando:", err);
      }
    }

    setSending(false);
    alert(`Mágica feita! ${successCount} campanhas disparadas com sucesso!`);
    loadData();
  };

  if (loading) return <div className="text-zinc-500 py-10 flex justify-center animate-pulse">Carregando inteligência de dados...</div>;

  return (
    <div className="space-y-8 max-w-6xl pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Target className="w-8 h-8 text-neon" /> Command Center
          </h1>
          <p className="text-zinc-400 mt-1">Sua central estratégica de vendas e recuperação de receita.</p>
        </div>
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-zinc-300">Sistema Online</span>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400/80 uppercase tracking-wider">Valor Aprovado</span>
          </div>
          <p className="text-3xl font-black text-emerald-400 tracking-tight">{formatCurrency(stats.valorAprovado)}</p>
          <p className="text-xs text-emerald-400/60 mt-2 font-medium">{stats.aprovados} projetos fechados</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-purple-900/10 border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <span className="text-xs font-bold text-purple-400/80 uppercase tracking-wider">Ticket Médio</span>
          </div>
          <p className="text-3xl font-black text-purple-400 tracking-tight">{formatCurrency(stats.ticketMedio)}</p>
          <p className="text-xs text-purple-400/60 mt-2 font-medium">Por projeto fechado</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-amber-900/10 border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400/80 uppercase tracking-wider">Negociações</span>
          </div>
          <p className="text-3xl font-black text-amber-400 tracking-tight">{stats.pendentes}</p>
          <p className="text-xs text-amber-400/60 mt-2 font-medium">Potencial: {formatCurrency(stats.potencialVendas)}</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-900/10 border border-blue-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold text-blue-400/80 uppercase tracking-wider">Taxa de Conversão</span>
          </div>
          <p className="text-3xl font-black text-blue-400 tracking-tight">{stats.conversao}%</p>
          <p className="text-xs text-blue-400/60 mt-2 font-medium">De {stats.totalGerados} orçamentos totais</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Funnel & Actions */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Action Panel - Marketing Automations */}
          <div className="bg-dark-800/80 border border-dark-700/50 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-neon"></div>
            <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Send className="w-5 h-5 text-neon" /> Central de Automação de Hoje
                </h2>
                <p className="text-sm text-zinc-400">
                  {pendingDisparos.length === 0 
                    ? "Excelente trabalho! Não há nenhum follow-up atrasado ou pendente para hoje." 
                    : `Existem ${pendingDisparos.length} clientes aguardando contato do funil neste momento. Eles estão esfriando.`}
                </p>
              </div>
              <button
                onClick={handleDisparar}
                disabled={pendingDisparos.length === 0 || sending}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-neon text-dark-950 font-black text-sm hover:bg-neon/90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg shadow-neon/20 whitespace-nowrap"
              >
                {sending ? <><Loader2 className="w-5 h-5 animate-spin" /> Disparando Webhooks...</> : <><Send className="w-5 h-5" /> Iniciar Disparos ({pendingDisparos.length})</>}
              </button>
            </div>
          </div>

          {/* Visual Sales Funnel */}
          <div className="bg-dark-800/40 border border-dark-700/50 rounded-3xl p-6">
            <h2 className="text-lg font-bold text-white mb-6">Funil de Vendas Atual</h2>
            <div className="space-y-4">
              {/* Funnel Stage 1 */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300">1. Orçamentos Gerados (Top of Funnel)</span>
                  <span className="text-zinc-400">{stats.totalGerados}</span>
                </div>
                <div className="h-4 w-full bg-dark-900 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-600 rounded-full transition-all duration-1000" style={{ width: '100%' }}></div>
                </div>
              </div>
              {/* Funnel Stage 2 */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300">2. Em Negociação (Pendente/Follow-up)</span>
                  <span className="text-amber-400">{stats.pendentes}</span>
                </div>
                <div className="h-4 w-full bg-dark-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${stats.totalGerados > 0 ? (stats.pendentes / stats.totalGerados) * 100 : 0}%` }}></div>
                </div>
              </div>
              {/* Funnel Stage 3 */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-300">3. Projetos Fechados (Won)</span>
                  <span className="text-emerald-400">{stats.aprovados}</span>
                </div>
                <div className="h-4 w-full bg-dark-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${stats.totalGerados > 0 ? (stats.aprovados / stats.totalGerados) * 100 : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">

          {/* Últimos Fechamentos */}
          <div className="bg-dark-800/40 border border-dark-700/50 rounded-3xl p-6">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Últimos Fechamentos
            </h2>
            {recentWins.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-sm">
                Nenhum projeto fechado ainda.<br/>Hora de aquecer as vendas!
              </div>
            ) : (
              <div className="space-y-4">
                {recentWins.map(w => {
                  const total = w.payload?.itens?.reduce((acc, i) => acc + (i.preco * i.quantidade), 0) || 0;
                  return (
                    <div key={w.id} className="flex flex-col p-4 bg-dark-900/50 rounded-2xl border border-dark-700/30 hover:border-emerald-500/30 transition-colors">
                      <span className="text-emerald-400 font-black mb-1">{formatCurrency(total)}</span>
                      <span className="text-sm font-bold text-white">{w.cliente}</span>
                      <span className="text-xs text-zinc-500 flex justify-between mt-2">
                        <span>{w.consultor}</span>
                        <span>{new Date(w.criado_em).toLocaleDateString('pt-BR')}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leads por Momento */}
          <div className="bg-dark-800/40 border border-dark-700/50 rounded-3xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Leads ({leadsStats.total})
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                <Flame className="w-4 h-4 text-red-400 mx-auto mb-1" />
                <p className="text-xl font-black text-red-400">{leadsStats.agora}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Comprar agora</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                <Thermometer className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <p className="text-xl font-black text-amber-400">{leadsStats.breve}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Em breve (≤30d)</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <Snowflake className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-xl font-black text-blue-400">{leadsStats.comparando}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Comparando opções</p>
              </div>
              <div className="bg-zinc-500/10 border border-zinc-500/20 rounded-xl p-3 text-center">
                <Snowflake className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
                <p className="text-xl font-black text-zinc-400">{leadsStats.entender}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Só quer entender</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Novo', value: leadsStats.novo, color: 'bg-zinc-500' },
                { label: 'Fluxo Disparado', value: leadsStats.fluxo_disparado, color: 'bg-blue-500' },
                { label: 'Link Aberto', value: leadsStats.link_aberto, color: 'bg-purple-500' },
                { label: 'Orçamento Gerado', value: leadsStats.orcamento_gerado, color: 'bg-amber-500' },
                { label: 'Convertido', value: leadsStats.convertido, color: 'bg-neon' },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">{s.label}</span>
                    <span className="text-white font-bold">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`}
                      style={{ width: `${leadsStats.total > 0 ? (s.value / leadsStats.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-dark-700/40 flex justify-between text-xs">
              <span className="text-zinc-500">Taxa de conversão</span>
              <span className="text-neon font-black">{leadsStats.taxaConversao}%</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
