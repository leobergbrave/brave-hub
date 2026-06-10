import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Zap, Plus, X, ChevronRight, ChevronLeft, Check, Loader2,
  Pause, Play, Users, Calendar, Clock, Settings, RefreshCw,
  Search, Target, AlertCircle, ThumbsUp, ThumbsDown, MessageSquareOff, ChevronDown,
  Pencil, Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DIAS = [['Seg',1],['Ter',2],['Qua',3],['Qui',4],['Sex',5],['Sáb',6],['Dom',7]];

function fmtTel(tel) {
  if (!tel) return '—';
  const d = tel.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return tel;
}

function initials(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

const AVATAR_COLORS = [
  'from-purple-500 to-violet-600', 'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600', 'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600', 'from-neon/80 to-emerald-500',
];
function avatarColor(nome) {
  const sum = (nome || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function diasLabel(dias) {
  if (!dias?.length) return '—';
  const map = { 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb', 7:'Dom' };
  return dias.sort((a,b)=>a-b).map(d => map[d]).join(', ');
}

const ORIGEM_LABEL = { whatsapp:'WhatsApp', orcamento:'Orçamento', screenshot:'Importado', manual:'Manual', todos:'Todas' };
const STATUS_LABEL = { todos:'Todos', quente:'Quente', morno:'Morno', frio:'Frio' };

export default function DisparosTab() {
  // ── Campaign list ──
  const [campanhas, setCampanhas] = useState([]);
  const [loadingCampanhas, setLoadingCampanhas] = useState(true);
  const [respostas, setRespostas] = useState({}); // { campanha_id: { aceitou, optout, sem_resposta } }
  const [expandedId, setExpandedId] = useState(null);

  // ── Wizard ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1 — segmento
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [filtros, setFiltros] = useState({ status: 'todos', origem: 'todos', busca: '', dataInicio: '', dataFim: '' });
  const [preview, setPreview] = useState({ total: 0, amostra: [] });
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 2 — regras (carregadas do disparo_config global)
  const [config, setConfig] = useState({
    hora_inicio: '08:00', hora_fim: '18:00', dias_semana: [1,2,3,4,5],
    max_por_dia: 50, delay_min_min: 1, delay_max_min: 30, webhook_url: '',
  });
  const [configId, setConfigId] = useState(null);

  // Step 3 — criando
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  // Teste de webhook
  const [testPhone, setTestPhone] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'erro'
  const [testErro, setTestErro] = useState('');

  // ── Editar campanha ──
  const [editModal, setEditModal] = useState(null); // campanha object
  const [editNome, setEditNome] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Deletar campanha ──
  const [deleteModal, setDeleteModal] = useState(null); // campanha object
  const [deleting, setDeleting] = useState(false);

  // ── Forçar disparo manual & Info ──
  const [forcing, setForcing] = useState(false);
  const [forceResult, setForceResult] = useState(null);
  const [infoOpen, setInfoOpen] = useState(true);

  // ── Fetches ──
  const fetchCampanhas = useCallback(async () => {
    setLoadingCampanhas(true);
    const { data } = await supabase
      .from('disparo_campanhas')
      .select('*')
      .order('criado_em', { ascending: false });
    setCampanhas(data || []);
    setLoadingCampanhas(false);
  }, []);

  const fetchRespostas = useCallback(async (campanhaId) => {
    const { data } = await supabase
      .from('disparo_fila')
      .select('resposta')
      .eq('campanha_id', campanhaId)
      .eq('status', 'sent')
      .not('resposta', 'is', null);

    if (!data) return;
    const r = { aceitou: 0, optout: 0, sem_resposta: 0 };
    data.forEach(d => { if (r[d.resposta] !== undefined) r[d.resposta]++; });
    setRespostas(prev => ({ ...prev, [campanhaId]: r }));
  }, []);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase.from('disparo_config').select('*').limit(1).maybeSingle();
    if (data) { setConfig(data); setConfigId(data.id); }
  }, []);

  useEffect(() => { fetchCampanhas(); fetchConfig(); }, [fetchCampanhas, fetchConfig]);

  // ── Preview (debounced) ──
  const previewTimer = useRef(null);

  const doFetchPreview = useCallback(async (f) => {
    setLoadingPreview(true);
    try {
      let q = supabase
        .from('contatos')
        .select('nome, telefone', { count: 'exact' })
        .not('telefone', 'is', null);

      if (f.busca.trim()) {
        const b = f.busca.trim();
        q = q.or(`nome.ilike.%${b}%,telefone.ilike.%${b}%`);
      }
      if (f.status !== 'todos') q = q.eq('status', f.status);
      if (f.origem !== 'todos') q = q.eq('origem', f.origem);
      if (f.dataInicio) q = q.gte('criado_em', f.dataInicio + 'T00:00:00');
      if (f.dataFim)    q = q.lte('criado_em', f.dataFim + 'T23:59:59');

      q = q.order('criado_em', { ascending: false }).limit(5);
      const { data, count } = await q;
      setPreview({ total: count || 0, amostra: data || [] });
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (!wizardOpen || step !== 1) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => doFetchPreview(filtros), 400);
    return () => clearTimeout(previewTimer.current);
  }, [filtros, wizardOpen, step, doFetchPreview]);

  // ── Open wizard ──
  const openWizard = () => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    setStep(1);
    setNomeCampanha(`Campanha ${hoje}`);
    setFiltros({ status: 'todos', origem: 'todos', busca: '', dataInicio: '', dataFim: '' });
    setCreating(false);
    setCreated(false);
    setWizardOpen(true);
    doFetchPreview({ status: 'todos', origem: 'todos', busca: '', dataInicio: '', dataFim: '' });
  };

  // ── Fetch all filtered (sem limit) para criar campanha ──
  const fetchAllFiltrados = async () => {
    let q = supabase.from('contatos').select('nome, telefone').not('telefone', 'is', null);
    if (filtros.busca.trim()) q = q.or(`nome.ilike.%${filtros.busca.trim()}%,telefone.ilike.%${filtros.busca.trim()}%`);
    if (filtros.status !== 'todos') q = q.eq('status', filtros.status);
    if (filtros.origem !== 'todos') q = q.eq('origem', filtros.origem);
    if (filtros.dataInicio) q = q.gte('criado_em', filtros.dataInicio + 'T00:00:00');
    if (filtros.dataFim)    q = q.lte('criado_em', filtros.dataFim + 'T23:59:59');
    const { data } = await q;
    return (data || []).filter(c => c.telefone?.replace(/\D/g, '').length >= 10);
  };

  // ── Criar campanha ──
  const handleCreate = async () => {
    setCreating(true);
    try {
      const contatos = await fetchAllFiltrados();
      if (!contatos.length) return;

      if (configId) {
        await supabase.from('disparo_config')
          .update({ ...config, atualizado_em: new Date().toISOString() })
          .eq('id', configId);
      } else {
        const { data } = await supabase.from('disparo_config').insert(config).select().single();
        if (data) setConfigId(data.id);
      }

      const { data: campanha, error } = await supabase
        .from('disparo_campanhas')
        .insert({ nome: nomeCampanha || `Campanha ${new Date().toLocaleDateString('pt-BR')}`, total_contatos: contatos.length })
        .select().single();

      if (error || !campanha) throw new Error(error?.message || 'Erro ao criar campanha');

      // Todos os itens entram como futuro distante; só o primeiro é ativado agora.
      // Isso garante que o delay entre mensagens é respeitado corretamente.
      const FAR_FUTURE = '2099-01-01T00:00:00.000Z';
      const BATCH = 500;
      const itens = contatos.map(c => ({
        campanha_id: campanha.id,
        nome: c.nome || '',
        telefone: c.telefone,
        send_after: FAR_FUTURE,
      }));
      for (let i = 0; i < itens.length; i += BATCH) {
        await supabase.from('disparo_fila').insert(itens.slice(i, i + BATCH));
      }

      // Ativa apenas o primeiro item para envio imediato
      const { data: firstItem } = await supabase
        .from('disparo_fila')
        .select('id')
        .eq('campanha_id', campanha.id)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (firstItem) {
        await supabase.from('disparo_fila')
          .update({ send_after: new Date().toISOString() })
          .eq('id', firstItem.id);
      }

      setCreated(true);
      fetchCampanhas();
    } catch (e) {
      console.error('Erro ao criar campanha:', e);
    } finally {
      setCreating(false);
    }
  };

  const handlePausar = async (id, status) => {
    await supabase.from('disparo_campanhas')
      .update({ status: status === 'ativa' ? 'pausada' : 'ativa' })
      .eq('id', id);
    fetchCampanhas();
  };

  const handleSaveEdit = async () => {
    if (!editModal || !editNome.trim()) return;
    setEditSaving(true);
    await supabase.from('disparo_campanhas')
      .update({ nome: editNome.trim() })
      .eq('id', editModal.id);
    setEditSaving(false);
    setEditModal(null);
    fetchCampanhas();
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    await supabase.from('disparo_fila').delete().eq('campanha_id', deleteModal.id);
    await supabase.from('disparo_campanhas').delete().eq('id', deleteModal.id);
    setDeleting(false);
    setDeleteModal(null);
    fetchCampanhas();
  };

  const handleTesteWebhook = async () => {
    if (!config.webhook_url || !testPhone.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    setTestErro('');
    try {
      let tel = testPhone.replace(/\D/g, '');
      if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
      const res = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente: 'Teste Brave HUB', telefone: tel }),
      });
      if (res.ok) {
        setTestResult('ok');
      } else {
        setTestResult('erro');
        setTestErro(`HTTP ${res.status}`);
      }
    } catch (e) {
      setTestResult('erro');
      setTestErro(e.message);
    } finally {
      setTestLoading(false);
    }
  };

  const handleForcarDisparo = async () => {
    setForcing(true);
    setForceResult(null);
    try {
      const res = await fetch('/api/disparo-sender', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        const total = data.processed || 0;
        const sentList = data.results?.filter(r => r.sent) || [];
        const failedList = data.results?.filter(r => !r.sent) || [];
        
        let msg = '';
        if (sentList.length > 0) {
          msg += `${sentList.length} enviado(s) com sucesso. `;
        }
        if (failedList.length > 0) {
          msg += `${failedList.length} falha(s). `;
        }
        if (sentList.length === 0 && failedList.length === 0) {
          if (data.skipped) {
            msg = `Nenhum disparo realizado: ${data.skipped}.`;
          } else {
            msg = 'Nenhum disparo pendente na fila para o horário atual.';
          }
        }
        
        setForceResult({ success: true, msg });
        fetchCampanhas();
      } else {
        setForceResult({ success: false, msg: data.fatal || data.error || 'Erro desconhecido ao processar disparos.' });
      }
    } catch (e) {
      setForceResult({ success: false, msg: `Erro de rede: ${e.message}` });
    } finally {
      setForcing(false);
      setTimeout(() => setForceResult(null), 10000);
    }
  };

  const estimativa = () => {
    if (!preview.total || !config.max_por_dia) return '—';
    return Math.ceil(preview.total / config.max_por_dia);
  };

  // ── Status config ──
  const statusMap = {
    ativa:     { label: 'Ativa',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', bar: 'bg-emerald-500' },
    pausada:   { label: 'Pausada',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     bar: 'bg-amber-500'   },
    concluida: { label: 'Concluída', color: 'text-neon',        bg: 'bg-neon/10 border-neon/20',               bar: 'bg-neon'        },
  };

  const pillBase = 'px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer';
  const pillActive = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
  const pillInactive = 'bg-dark-800 border-dark-700 text-zinc-500 hover:text-zinc-300';

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" /> Disparos
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {campanhas.length} campanha{campanhas.length !== 1 ? 's' : ''} criada{campanhas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInfoOpen(!infoOpen)}
            title="Ajuda e Instruções"
            className={`p-2.5 border rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer ${infoOpen ? 'bg-dark-750 border-zinc-600 text-white' : 'bg-dark-800 border-dark-700'}`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleForcarDisparo}
            disabled={forcing}
            title="Forçar execução imediata da fila de disparos"
            className="flex items-center gap-1.5 px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-xs font-bold text-zinc-450 hover:text-white hover:border-emerald-500/50 transition-colors cursor-pointer disabled:opacity-40"
          >
            {forcing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {forcing ? 'Disparando...' : 'Forçar Disparo'}
          </button>
          <button onClick={fetchCampanhas}
            className="p-2.5 bg-dark-800 border border-dark-700 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Atualizar lista">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openWizard}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Nova Campanha
          </button>
        </div>
      </div>

      {/* ── Painel de Objetivos, Instruções e Informações ── */}
      {infoOpen && (
        <div className="bg-dark-800/40 border border-dark-700/50 rounded-2xl p-5 space-y-4 text-xs text-zinc-400 transition-all">
          <div className="flex items-center justify-between border-b border-dark-700/50 pb-2">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-emerald-400" /> Objetivos e Instruções do Painel de Disparos
            </h3>
            <button onClick={() => setInfoOpen(false)} className="text-[10px] text-zinc-500 hover:text-white transition-colors cursor-pointer">
              Ocultar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p>
                <strong className="text-white">Objetivo:</strong> O módulo de disparos permite enviar mensagens automáticas em lote para seus clientes através da API do <strong className="text-white">BotConversa</strong>. Para proteger sua conta de WhatsApp contra banimentos, o envio é realizado em fila individual e espaçado de forma segura.
              </p>
              <p>
                <strong className="text-white">Janela de Funcionamento:</strong> Os disparos automáticos respeitam o horário configurado em regras (início, fim e dias da semana). Se um disparo for calculado para fora deste intervalo, ele será agendado automaticamente para o próximo dia útil, no horário inicial.
              </p>
            </div>
            <div className="space-y-2">
              <p>
                <strong className="text-white">Automação em Background (Cron):</strong> As mensagens da fila são disparadas automaticamente a cada minuto em produção. O agendador externo chama o serviço continuamente.
              </p>
              <p>
                <strong className="text-white">Testabilidade Prática:</strong> Use o botão <strong className="text-white">"Forçar Disparo"</strong> acima para executar a fila manualmente e disparar a próxima mensagem pendente imediatamente, ou o teste de webhook no passo 2 de criação.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Notificação de feedback do disparo forçado ── */}
      {forceResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${forceResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{forceResult.msg}</span>
          </div>
          <button onClick={() => setForceResult(null)} className="p-1 hover:bg-dark-700/50 rounded-lg shrink-0 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Campaign list ── */}
      {loadingCampanhas ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-neon animate-spin" />
        </div>
      ) : campanhas.length === 0 ? (
        <div className="text-center py-20 bg-dark-800/30 rounded-2xl border border-dark-700/30">
          <Zap className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Nenhuma campanha ainda</p>
          <p className="text-xs text-dark-600 mt-1 mb-4">Crie sua primeira campanha de disparo</p>
          <button onClick={openWizard}
            className="px-4 py-2 text-sm font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> Nova Campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campanhas.map(c => {
            const pct = c.total_contatos ? Math.round((c.enviados_total / c.total_contatos) * 100) : 0;
            const st = statusMap[c.status] || statusMap.ativa;
            const expanded = expandedId === c.id;
            const resp = respostas[c.id];
            const totalRespondeu = resp ? (resp.aceitou + resp.optout + resp.sem_resposta) : 0;
            const semResposta = c.enviados_total - totalRespondeu;

            const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
            const enviadosHoje = c.ultima_data === todayStr ? c.enviados_hoje : 0;

            return (
              <div key={c.id} className="bg-dark-800/50 border border-dark-700/40 rounded-2xl overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${st.bg} ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">{c.nome}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        Criada em {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(c.status === 'ativa' || c.status === 'pausada') && (
                        <button onClick={() => handlePausar(c.id, c.status)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-dark-600 text-zinc-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
                          {c.status === 'ativa'
                            ? <><Pause className="w-3 h-3" /> Pausar</>
                            : <><Play className="w-3 h-3" /> Retomar</>}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditModal(c); setEditNome(c.nome); }}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-dark-700 transition-colors cursor-pointer"
                        title="Editar nome">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteModal(c)}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Deletar campanha">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-1.5">
                      <span>{c.enviados_total.toLocaleString('pt-BR')} de {c.total_contatos.toLocaleString('pt-BR')} enviados</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${st.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Total',    value: c.total_contatos,    color: 'text-white' },
                      { label: 'Enviados', value: c.enviados_total,    color: 'text-emerald-400' },
                      { label: 'Hoje',     value: enviadosHoje,        color: 'text-blue-400' },
                      { label: 'Falhas',   value: c.falhas_total || 0, color: c.falhas_total ? 'text-red-400' : 'text-zinc-600' },
                    ].map(s => (
                      <div key={s.label} className="bg-dark-700/30 rounded-xl p-2.5 text-center">
                        <p className={`text-sm font-bold ${s.color}`}>{s.value.toLocaleString('pt-BR')}</p>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Expandir métricas de resposta */}
                  <button
                    onClick={() => {
                      const next = expanded ? null : c.id;
                      setExpandedId(next);
                      if (next && !respostas[c.id]) fetchRespostas(c.id);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? 'Ocultar respostas' : 'Ver respostas do BotConversa'}
                  </button>
                </div>

                {/* Painel de respostas */}
                {expanded && (
                  <div className="border-t border-dark-700/40 bg-dark-900/40 px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Respostas do fluxo</p>
                      <button onClick={() => fetchRespostas(c.id)}
                        className="p-1 text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors">
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>

                    {!resp ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                            <ThumbsUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                            <p className="text-lg font-black text-emerald-400">{resp.aceitou}</p>
                            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Aceitaram</p>
                          </div>
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                            <ThumbsDown className="w-4 h-4 text-red-400 mx-auto mb-1" />
                            <p className="text-lg font-black text-red-400">{resp.optout}</p>
                            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Optout</p>
                          </div>
                          <div className="bg-zinc-700/20 border border-zinc-700/30 rounded-xl p-3 text-center">
                            <MessageSquareOff className="w-4 h-4 text-zinc-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-zinc-400">{Math.max(0, semResposta)}</p>
                            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Sem resposta</p>
                          </div>
                        </div>

                        {c.enviados_total > 0 && (
                          <div className="space-y-1.5 text-[10px] text-zinc-500">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-400">Taxa de aceitação</span>
                              <span className="text-emerald-400 font-bold">
                                {Math.round((resp.aceitou / c.enviados_total) * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-red-400">Taxa de optout</span>
                              <span className="text-red-400 font-bold">
                                {Math.round((resp.optout / c.enviados_total) * 100)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Aguardando resposta</span>
                              <span className="font-bold">{Math.max(0, semResposta)} ({Math.round((Math.max(0, semResposta) / c.enviados_total) * 100)}%)</span>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-dark-700/30">
                          <p className="text-[9px] text-zinc-600">
                            Configure o BotConversa para enviar webhooks para:<br/>
                            <span className="font-mono text-zinc-500">POST brave-hub-two.vercel.app/api/disparo-resposta</span>
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Editar nome ── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Editar campanha</h3>
              <button onClick={() => setEditModal(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">Nome</label>
              <input
                value={editNome}
                onChange={e => setEditNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
                className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditModal(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={editSaving || !editNome.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar deleção ── */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Deletar campanha?</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-white truncate">{deleteModal.nome}</p>
              <p className="text-xs text-zinc-500">
                {deleteModal.total_contatos.toLocaleString('pt-BR')} contatos na fila ·{' '}
                {deleteModal.enviados_total.toLocaleString('pt-BR')} já enviados
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteModal(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wizard Modal ── */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40 shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" /> Nova Campanha
                </h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Etapa {step} de 3</p>
              </div>
              <button onClick={() => setWizardOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center px-6 py-3 border-b border-dark-700/30 shrink-0">
              {[{ n:1, label:'Segmento' }, { n:2, label:'Regras' }, { n:3, label:'Confirmar' }].map(({ n, label }, i) => (
                <div key={n} className="flex items-center flex-1">
                  <div className={`flex items-center gap-1.5 ${step >= n ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${step > n ? 'bg-emerald-500 border-emerald-500 text-white' : step === n ? 'border-emerald-400 text-emerald-400' : 'border-dark-600 text-zinc-600'}`}>
                      {step > n ? <Check className="w-3 h-3" /> : n}
                    </div>
                    <span className="text-[10px] font-semibold hidden sm:block">{label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-px mx-2 transition-colors ${step > n ? 'bg-emerald-500' : 'bg-dark-700'}`} />}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ── Step 1: Segmento ── */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
                      Nome da campanha
                    </label>
                    <input
                      value={nomeCampanha}
                      onChange={e => setNomeCampanha(e.target.value)}
                      placeholder="Ex: Disparo Leads Maio 2026"
                      className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 placeholder:text-dark-500"
                    />
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Filtrar contatos</p>

                    {/* Status */}
                    <div>
                      <p className="text-[10px] text-zinc-600 mb-2">Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <button key={value}
                            onClick={() => setFiltros(p => ({ ...p, status: value }))}
                            className={`${pillBase} ${filtros.status === value ? pillActive : pillInactive}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Origem */}
                    <div>
                      <p className="text-[10px] text-zinc-600 mb-2">Origem</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ORIGEM_LABEL).map(([value, label]) => (
                          <button key={value}
                            onClick={() => setFiltros(p => ({ ...p, origem: value }))}
                            className={`${pillBase} ${filtros.origem === value ? pillActive : pillInactive}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Busca */}
                    <div>
                      <p className="text-[10px] text-zinc-600 mb-2">Buscar por nome ou telefone</p>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                          value={filtros.busca}
                          onChange={e => setFiltros(p => ({ ...p, busca: e.target.value }))}
                          placeholder="Filtrar contatos..."
                          className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-emerald-500/50 placeholder:text-dark-500"
                        />
                      </div>
                    </div>

                    {/* Data de inserção */}
                    <div>
                      <p className="text-[10px] text-zinc-600 mb-2">Data de inserção no sistema</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-zinc-600 block mb-1">De</label>
                          <input type="date"
                            value={filtros.dataInicio}
                            onChange={e => setFiltros(p => ({ ...p, dataInicio: e.target.value }))}
                            className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 [color-scheme:dark]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-zinc-600 block mb-1">Até</label>
                          <input type="date"
                            value={filtros.dataFim}
                            onChange={e => setFiltros(p => ({ ...p, dataFim: e.target.value }))}
                            className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 [color-scheme:dark]"
                          />
                        </div>
                      </div>
                      {(filtros.dataInicio || filtros.dataFim) && (
                        <button
                          onClick={() => setFiltros(p => ({ ...p, dataInicio: '', dataFim: '' }))}
                          className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-1 cursor-pointer transition-colors">
                          × Limpar datas
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-3">Prévia do segmento</p>
                    {loadingPreview ? (
                      <div className="flex items-center gap-2 text-zinc-500 text-xs">
                        <Loader2 className="w-4 h-4 animate-spin" /> Calculando...
                      </div>
                    ) : (
                      <>
                        <p className="text-3xl font-black text-emerald-400 mb-3">
                          {preview.total.toLocaleString('pt-BR')}
                          <span className="text-sm font-normal text-zinc-500 ml-2">contatos selecionados</span>
                        </p>
                        {preview.amostra.length > 0 ? (
                          <div className="space-y-2">
                            {preview.amostra.map((c, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${avatarColor(c.nome)} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>
                                  {initials(c.nome)}
                                </div>
                                <span className="text-xs text-zinc-400 truncate flex-1">{c.nome || '—'}</span>
                                <span className="text-[10px] text-zinc-600 shrink-0">{fmtTel(c.telefone)}</span>
                              </div>
                            ))}
                            {preview.total > 5 && (
                              <p className="text-[10px] text-zinc-600 mt-1">
                                + {(preview.total - 5).toLocaleString('pt-BR')} outros contatos...
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-600">
                            Nenhum contato com telefone válido nos filtros selecionados.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 2: Regras ── */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'hora_inicio', label: 'Hora início', type: 'time' },
                      { key: 'hora_fim',    label: 'Hora fim',    type: 'time' },
                      { key: 'max_por_dia',    label: 'Máx. por dia',     type: 'number', min: 1,  max: 500 },
                      { key: 'delay_min_min',  label: 'Delay mín. (min)', type: 'number', min: 1,  max: 60  },
                      { key: 'delay_max_min',  label: 'Delay máx. (min)', type: 'number', min: 1,  max: 120 },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
                          {f.label}
                        </label>
                        <input
                          type={f.type}
                          min={f.min} max={f.max}
                          value={config[f.key]}
                          onChange={e => setConfig(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
                      Dias da semana
                    </label>
                    <div className="flex gap-1.5">
                      {DIAS.map(([label, val]) => {
                        const ativo = config.dias_semana?.includes(val);
                        return (
                          <button key={val}
                            onClick={() => setConfig(p => ({
                              ...p,
                              dias_semana: ativo
                                ? p.dias_semana.filter(d => d !== val)
                                : [...(p.dias_semana || []), val].sort((a,b)=>a-b),
                            }))}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-colors cursor-pointer border ${ativo ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-dark-800 text-zinc-600 border-dark-700 hover:border-dark-600'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
                      Webhook URL (BotConversa)
                    </label>
                    <input
                      type="text"
                      value={config.webhook_url || ''}
                      onChange={e => setConfig(p => ({ ...p, webhook_url: e.target.value }))}
                      className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 font-mono"
                    />
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4 space-y-1.5 text-xs text-zinc-400">
                    <p className="font-semibold text-zinc-300 mb-2">Estimativa desta campanha</p>
                    <p>· <span className="text-white font-semibold">{preview.total.toLocaleString('pt-BR')}</span> contatos em aproximadamente <span className="text-white font-semibold">{estimativa()} dias</span> úteis</p>
                    <p>· <span className="text-white font-semibold">{config.max_por_dia}</span> mensagens/dia · delay <span className="text-white font-semibold">{config.delay_min_min}–{config.delay_max_min} min</span> entre envios</p>
                    <p>· Horário: <span className="text-white font-semibold">{config.hora_inicio} – {config.hora_fim}</span> · {diasLabel(config.dias_semana)}</p>
                  </div>
                </div>
              )}

              {/* ── Step 3: Confirmar ── */}
              {step === 3 && !created && (
                <div className="space-y-4">
                  <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-5 space-y-4">
                    <p className="text-sm font-bold text-white">{nomeCampanha}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span><span className="text-white font-semibold">{preview.total.toLocaleString('pt-BR')}</span> contatos</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{config.hora_inicio} – {config.hora_fim}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{diasLabel(config.dias_semana)}</span>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Máx. <span className="text-white font-semibold">{config.max_por_dia}</span>/dia</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Settings className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Delay {config.delay_min_min}–{config.delay_max_min} min</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>~<span className="text-white font-semibold">{estimativa()}</span> dias úteis</span>
                        </div>
                      </div>
                    </div>

                    {/* Filtros aplicados */}
                    <div className="pt-3 border-t border-dark-700/40 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-zinc-600 self-center mr-1">Segmento:</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-zinc-400">
                        Status: {STATUS_LABEL[filtros.status]}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-zinc-400">
                        Origem: {ORIGEM_LABEL[filtros.origem]}
                      </span>
                      {filtros.busca && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-zinc-400">
                          Busca: "{filtros.busca}"
                        </span>
                      )}
                      {filtros.dataInicio && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-zinc-400">
                          De: {new Date(filtros.dataInicio).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {filtros.dataFim && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-zinc-400">
                          Até: {new Date(filtros.dataFim).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Teste de webhook ── */}
                  <div className="bg-dark-800/40 border border-dark-700/30 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Testar webhook antes de ativar</p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={testPhone}
                        onChange={e => { setTestPhone(e.target.value); setTestResult(null); }}
                        placeholder="Seu WhatsApp: (11) 99999-9999"
                        className="flex-1 bg-dark-800 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 placeholder:text-dark-500"
                      />
                      <button
                        onClick={handleTesteWebhook}
                        disabled={testLoading || !testPhone.trim() || !config.webhook_url}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default text-zinc-300 border-dark-600 hover:text-white hover:bg-dark-700">
                        {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        {testLoading ? 'Enviando...' : 'Disparar teste'}
                      </button>
                    </div>
                    {testResult === 'ok' && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        Webhook respondeu OK — verifique seu WhatsApp!
                      </div>
                    )}
                    {testResult === 'erro' && (
                      <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Falha: {testErro} — verifique a Webhook URL nas Regras.
                      </div>
                    )}
                  </div>

                  {preview.total === 0 && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Nenhum contato selecionado. Volte e ajuste os filtros.
                    </div>
                  )}

                  <button
                    onClick={handleCreate}
                    disabled={creating || preview.total === 0}
                    className="w-full flex items-center justify-center gap-2 py-4 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    {creating
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando campanha...</>
                      : <><Zap className="w-4 h-4" /> Criar e Ativar — {preview.total.toLocaleString('pt-BR')} contatos</>}
                  </button>
                </div>
              )}

              {/* ── Criado com sucesso ── */}
              {created && (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">Campanha criada!</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      {preview.total.toLocaleString('pt-BR')} contatos enfileirados com sucesso.
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      O worker processa automaticamente dentro da janela configurada.
                    </p>
                  </div>
                  <button
                    onClick={() => setWizardOpen(false)}
                    className="px-6 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-xl hover:bg-emerald-500/20 transition-colors cursor-pointer">
                    Ver campanhas
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {!created && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-dark-700/40 shrink-0">
                <button
                  onClick={() => step > 1 ? setStep(s => s - 1) : setWizardOpen(false)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-dark-800 transition-colors cursor-pointer">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {step > 1 ? 'Voltar' : 'Cancelar'}
                </button>
                {step < 3 && (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    disabled={step === 1 && (preview.total === 0 || !nomeCampanha.trim())}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    Próximo <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
