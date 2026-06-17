import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Settings, Zap, MapPin, Play, Loader2, Info, CheckCircle2,
  Trash2, Mail, Phone, Globe, Award, Filter, ExternalLink, RefreshCw,
  PlusCircle, Sparkles, X, ChevronRight, AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const NICHO_SUGESTOES = [
  'Box de Crossfit',
  'Academia de Musculação',
  'Studio de Personal',
  'Box de Funcional',
  'Arena de Beach Tennis',
  'Clube de Ginástica'
];

export default function ProspeccaoTab() {
  const [activeSubTab, setActiveSubTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [toast, setToast] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroEmail, setFiltroEmail] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Config de Prospecção do Supabase
  const [config, setConfig] = useState({
    apify_token: '',
    gemini_key: '',
    instantly_key: '',
    instantly_campaign_id: '',
    prompt_personalizacao: ''
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Form de Raspagem
  const [nicho, setNicho] = useState('Box de Crossfit');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('SP');
  const [limite, setLimite] = useState(10);
  const [priorizarEmails, setPriorizarEmails] = useState(true);

  // Estado do Processo de Raspagem
  const [raspando, setRaspando] = useState(false);
  const [progressoStatus, setProgressoStatus] = useState('');
  const [percentualProgresso, setPercentualProgresso] = useState(0);
  const [logsRaspagem, setLogsRaspagem] = useState([]);

  // Detalhes do Lead no Modal
  const [selectedLead, setSelectedLead] = useState(null);

  // ─── Toast Feedback ────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // ─── Fetch Config do Supabase ──────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data, error } = await supabase
        .from('prospeccao_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setConfig({
          apify_token: data.apify_token || '',
          gemini_key: data.gemini_key || '',
          instantly_key: data.instantly_key || '',
          instantly_campaign_id: data.instantly_campaign_id || '',
          prompt_personalizacao: data.prompt_personalizacao || ''
        });
      }
    } catch (e) {
      console.error('Erro ao buscar config de prospecção:', e);
      showToast('❌ Erro ao carregar configurações.');
    } finally {
      setLoadingConfig(false);
    }
  }, [showToast]);

  // ─── Salvar Config no Supabase ─────────────────────────────────────────────
  const saveConfig = async () => {
    setSalvandoConfig(true);
    try {
      const { error } = await supabase
        .from('prospeccao_config')
        .upsert({
          id: 1,
          apify_token: config.apify_token.trim(),
          gemini_key: config.gemini_key.trim(),
          instantly_key: config.instantly_key.trim(),
          instantly_campaign_id: config.instantly_campaign_id.trim(),
          prompt_personalizacao: config.prompt_personalizacao.trim(),
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      showToast('✅ Configurações salvas com sucesso!');
    } catch (e) {
      console.error('Erro ao salvar config de prospecção:', e);
      showToast('❌ Erro ao salvar configurações.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ─── Fetch Leads do Supabase ───────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const { data, error } = await supabase
        .from('potenciais_clientes')
        .select('*')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      setLeads(data || []);
    } catch (e) {
      console.error('Erro ao buscar potenciais clientes:', e);
      showToast('❌ Erro ao carregar potenciais clientes.');
    } finally {
      setLoadingLeads(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfig();
    fetchLeads();
  }, [fetchConfig, fetchLeads]);

  // ─── Filtros de Leads ──────────────────────────────────────────────────────
  const leadsFiltrados = useMemo(() => {
    return leads.filter(l => {
      const matchBusca = busca.trim() === '' ||
        l.nome_empresa?.toLowerCase().includes(busca.toLowerCase()) ||
        l.segmento?.toLowerCase().includes(busca.toLowerCase()) ||
        l.cidade?.toLowerCase().includes(busca.toLowerCase());

      const matchStatus = filtroStatus === 'todos' || l.status === filtroStatus;
      const matchEmail = !filtroEmail || (l.email && l.email.trim() !== '');
      const matchEstado = filtroEstado === 'todos' || l.estado === filtroEstado;

      return matchBusca && matchStatus && matchEmail && matchEstado;
    });
  }, [leads, busca, filtroStatus, filtroEmail, filtroEstado]);

  // Extrair estados únicos para filtros
  const estadosDisponiveis = useMemo(() => {
    const set = new Set(leads.map(l => l.estado).filter(Boolean));
    return Array.from(set);
  }, [leads]);

  // ─── Qualificar Lead (Mover para CRM Leads) ────────────────────────────────
  const qualificarLead = async (lead) => {
    try {
      showToast('🚀 Qualificando lead...');
      const observacao = `Lead qualificado a partir da Prospecção Inteligente.\nNicho original: ${lead.segmento}\nGancho de abordagem gerado pela IA: ${lead.dados_personalizados?.gancho_whatsapp || 'Não gerado'}`;

      // 1. Inserir no pipeline principal de leads
      const { error: errorInsert } = await supabase
        .from('leads')
        .insert({
          nome: lead.nome_empresa,
          telefone: lead.telefone || 'Sem telefone',
          email: lead.email || null,
          momento_compra: 'frio',
          observacoes: observacao,
          status: 'novo'
        });

      if (errorInsert) throw errorInsert;

      // 2. Atualizar status para 'convertido' na tabela de potenciais_clientes
      const { error: errorUpdate } = await supabase
        .from('potenciais_clientes')
        .update({ status: 'convertido', atualizado_em: new Date().toISOString() })
        .eq('id', lead.id);

      if (errorUpdate) throw errorUpdate;

      // 3. Enviar para o Instantly se configurado e o lead tiver e-mail
      if (config.instantly_key && config.instantly_campaign_id && lead.email) {
        try {
          const resInstantly = await fetch('https://api.instantly.ai/api/v2/leads/add', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.instantly_key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              campaign_id: config.instantly_campaign_id,
              leads: [{
                email: lead.email,
                first_name: lead.nome_empresa,
                company_name: lead.nome_empresa,
                custom_variables: {
                  gancho: lead.dados_personalizados?.gancho_whatsapp || '',
                  cidade: lead.cidade || '',
                  estado: lead.estado || '',
                  segmento: lead.segmento || '',
                  telefone: lead.telefone || ''
                }
              }]
            })
          });
          if (resInstantly.ok) {
            showToast('🚀 Lead qualificado no CRM e enviado ao Instantly!');
          } else {
            const errText = await resInstantly.text();
            console.error('Erro ao enviar lead para o Instantly:', errText);
            showToast('⚠️ Qualificado no CRM, erro ao enviar para o Instantly.');
          }
        } catch (errInstantly) {
          console.error('Erro de conexão com Instantly:', errInstantly);
          showToast('⚠️ Qualificado no CRM, erro de rede com Instantly.');
        }
      } else {
        showToast('✅ Lead qualificado e enviado ao CRM de vendas!');
      }

      fetchLeads();
    } catch (e) {
      console.error('Erro ao qualificar lead:', e);
      showToast('❌ Falha ao qualificar lead.');
    }
  };

  // ─── Descartar Lead ────────────────────────────────────────────────────────
  const descartarLead = async (leadId) => {
    try {
      const { error } = await supabase
        .from('potenciais_clientes')
        .update({ status: 'descartado', atualizado_em: new Date().toISOString() })
        .eq('id', leadId);
      if (error) throw error;
      showToast('🗑️ Lead marcado como descartado.');
      fetchLeads();
    } catch (e) {
      console.error('Erro ao descartar lead:', e);
      showToast('❌ Falha ao descartar lead.');
    }
  };

  // ─── Deletar Lead Permanentemente ──────────────────────────────────────────
  const deletarLead = async (leadId) => {
    if (!confirm('Deseja excluir permanentemente este lead do banco de dados?')) return;
    try {
      const { error } = await supabase
        .from('potenciais_clientes')
        .delete()
        .eq('id', leadId);
      if (error) throw error;
      showToast('🗑️ Lead deletado permanentemente.');
      fetchLeads();
    } catch (e) {
      console.error('Erro ao deletar lead:', e);
      showToast('❌ Falha ao deletar lead.');
    }
  };

  // ─── Motor de Raspagem e Enriquecimento no Frontend ───────────────────────
  const iniciarProspeccao = async () => {
    if (!config.apify_token) {
      showToast('⚠️ configure o Token do Apify na aba de Configurações primeiro.');
      setActiveSubTab('config');
      return;
    }
    if (!cidade.trim()) {
      showToast('⚠️ Informe a Cidade para a busca.');
      return;
    }

    setRaspando(true);
    setProgressoStatus('Iniciando...');
    setPercentualProgresso(5);
    setLogsRaspagem([`[${new Date().toLocaleTimeString()}] Iniciando processo de prospecção...`]);

    const addLog = (log) => {
      setLogsRaspagem(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
    };

    try {
      // 1. Iniciar Actor no Apify (Google Maps Scraper) via Proxy Unificado
      addLog(`Disparando busca no Google Maps via Apify: "${nicho} em ${cidade} - ${estado}"...`);
      const startRes = await fetch('/api/prospeccao-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'apify', nicho, cidade, estado, limite })
      });

      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({}));
        const errMsg = typeof errData.error === 'object'
          ? errData.error?.message || JSON.stringify(errData.error)
          : errData.error || `Apify retornou erro HTTP ${startRes.status}`;
        throw new Error(errMsg);
      }

      const startData = await startRes.json();
      const runId = startData.data?.id;
      const datasetId = startData.data?.defaultDatasetId;

      addLog(`Scraper iniciado no Apify. Run ID: ${runId}`);
      setPercentualProgresso(20);

      // 2. Polling de Status do Apify Run via Proxy Unificado
      let statusApify = 'RUNNING';
      let checkCount = 0;

      while (statusApify === 'RUNNING' || statusApify === 'READY') {
        if (checkCount > 30) {
          throw new Error('Tempo limite excedido na raspagem do Apify.');
        }
        await new Promise(r => setTimeout(r, 6000));
        checkCount++;
        setProgressoStatus(`Raspando locais no Google Maps... (${checkCount * 6}s)`);
        setPercentualProgresso(prev => Math.min(60, prev + 2));

        const checkRes = await fetch(`/api/prospeccao-proxy?service=apify&action=status&runId=${runId}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          statusApify = checkData.data?.status;
          addLog(`Status da tarefa Apify: ${statusApify}`);
        }
      }

      if (statusApify !== 'SUCCEEDED') {
        throw new Error(`Scraper do Apify finalizou com status: ${statusApify}`);
      }

      setPercentualProgresso(65);
      setProgressoStatus('Coletando dados brutos extraídos...');

      // 3. Baixar Dataset do Apify via Proxy Unificado
      const dataRes = await fetch(`/api/prospeccao-proxy?service=apify&action=dataset&datasetId=${datasetId}`);
      if (!dataRes.ok) throw new Error('Falha ao baixar os leads extraídos do Apify.');
      const items = await dataRes.json();

      const totalResultados = items.length;
      addLog(`Dataset baixado. Encontradas ${totalResultados} empresas.`);

      if (totalResultados === 0) {
        addLog('Nenhuma empresa encontrada com os parâmetros informados.');
        setPercentualProgresso(100);
        setProgressoStatus('Finalizado sem resultados.');
        setRaspando(false);
        return;
      }

      setPercentualProgresso(75);
      
      // 4. Iterar pelos leads para verificar duplicidade, enriquecer e salvar
      let inseridos = 0;
      let pulados = 0;
      let enriquecidos = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const nomeEmpresa = item.title;
        if (!nomeEmpresa) continue;

        setProgressoStatus(`Processando lead ${i + 1} de ${totalResultados}: ${nomeEmpresa}`);
        setPercentualProgresso(75 + Math.floor((i / totalResultados) * 20));

        // Verificar se já existe no banco
        const { data: existe } = await supabase
          .from('potenciais_clientes')
          .select('id')
          .eq('nome_empresa', nomeEmpresa)
          .eq('cidade', cidade)
          .maybeSingle();

        if (existe) {
          addLog(`Lead "${nomeEmpresa}" já cadastrado nesta cidade. Pulando.`);
          pulados++;
          continue;
        }

        // Sanitizar dados
        const telBruto = item.phone || item.phoneUnformatted || '';
        const telLimpo = telBruto.replace(/\D/g, '');
        const emailExtraido = item.email || '';

        // Prioridade de contatos: Se priorizar e-mails está ativo e não tem e-mail,
        // podemos marcar ou apenas logar
        if (priorizarEmails && !emailExtraido) {
          addLog(`[INFO] Lead "${nomeEmpresa}" não tem e-mail. Salvando mesmo assim.`);
        }

        const leadPayload = {
          nome_empresa: nomeEmpresa,
          segmento: item.categoryName || nicho,
          telefone: telLimpo.length >= 8 ? telLimpo : null,
          email: emailExtraido || null,
          site: item.website || null,
          cidade: cidade,
          estado: estado,
          origem: 'raspagem',
          status: 'prospecto',
          dados_personalizados: {
            stars: item.stars || null,
            reviews: item.reviewsCount || 0,
            maps_url: item.url || '',
            gancho_whatsapp: ''
          }
        };

        // Enriquecer com Gemini 3.5 Flash se gemini_key e site existirem
        if (config.gemini_key) {
          try {
            addLog(`Enriquecendo com Gemini 3.5 Flash: ${nomeEmpresa}...`);
            const promptIa = `${config.prompt_personalizacao || 'Escreva um gancho comercial.'}\n\nEmpresa: ${nomeEmpresa}\nSite: ${item.website || 'Sem site'}\nSegmento: ${item.categoryName || nicho}\nDescrição: ${item.subTitle || ''}`;

            const geminiRes = await fetch('/api/prospeccao-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service: 'gemini', prompt: promptIa })
            });

            if (geminiRes.ok) {
              const geminiJson = await geminiRes.json();
              const gancho = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
              leadPayload.dados_personalizados.gancho_whatsapp = gancho.strip ? gancho.strip() : gancho.trim();
              enriquecidos++;
              addLog(`Gancho de abordagem gerado com sucesso.`);
            } else {
              addLog(`⚠️ Erro na chamada do Gemini (HTTP ${geminiRes.status}). Lead salvo sem gancho.`);
            }
          } catch (eIa) {
            addLog(`⚠️ Falha ao enriquecer com IA: ${eIa.message}`);
          }
        }

        // Salvar no Supabase
        const { error: saveError } = await supabase
          .from('potenciais_clientes')
          .insert(leadPayload);

        if (saveError) {
          addLog(`❌ Falha ao salvar no Supabase: ${saveError.message}`);
        } else {
          inseridos++;
          addLog(`Lead salvo no Supabase com sucesso.`);
        }

        // Delay para rate limit do Gemini/Supabase
        await new Promise(r => setTimeout(r, 600));
      }

      setPercentualProgresso(100);
      setProgressoStatus('Prospecção Finalizada com Sucesso!');
      addLog(`Resumo da Operação: Coletados=${totalResultados} | Inseridos=${inseridos} | Pulados=${pulados} | IA Enriquecidos=${enriquecidos}`);
      fetchLeads();
    } catch (e) {
      console.error(e);
      addLog(`❌ Erro crítico no processo: ${e.message}`);
      setProgressoStatus('Falha na Prospecção.');
    } finally {
      setRaspando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-in-right">
          <div className="flex items-center gap-3 bg-dark-700 px-5 py-3 rounded-xl shadow-lg border border-neon/30">
            <CheckCircle2 className="w-4 h-4 text-neon" />
            <span className="text-sm font-medium text-white">{toast}</span>
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Search className="w-6 h-6 text-neon" />
            Prospecção & Potenciais Clientes
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Encontre e qualifique novas academias e boxes usando IA e Google Maps</p>
        </div>
        <div className="flex bg-dark-800/60 border border-dark-700/50 rounded-xl p-1 gap-1">
          {[
            { id: 'leads', label: 'Leads Encontrados', icon: Award },
            { id: 'raspar', label: 'Nova Raspagem', icon: Play },
            { id: 'config', label: 'Configurações API', icon: Settings }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === t.id
                  ? 'bg-dark-700 text-white shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Info/Objectives Card B.L.A.S.T. ─── */}
      <div className="bg-dark-900 border border-neon/20 rounded-2xl p-6 space-y-4 shadow-xl shadow-neon/5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-neon shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-1">Objetivo da Funcionalidade (Prospecção B2B)</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Descobrir, filtrar e qualificar novos clientes em potencial para a <strong>Brave Equipment</strong> de forma autônoma. O fluxo utiliza a API do Apify para buscar listagens no Google Maps por nicho de atuação e região, enriquecendo as informações com o modelo de inteligência artificial <strong>Gemini 3.5 Flash</strong> para gerar propostas comerciais personalizadas e ganchos de WhatsApp de impacto com base no site mapeado.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dark-800">
          <div>
            <h4 className="text-xs font-black text-neon uppercase tracking-wider mb-2">Instruções de Prospecção</h4>
            <ul className="text-xs text-zinc-400 space-y-1.5 list-disc pl-4">
              <li>Configure suas chaves da API do Apify e Gemini 3.5 Flash na aba <strong>Configurações API</strong>.</li>
              <li>Acesse a aba <strong>Nova Raspagem</strong>, preencha o nicho, região e clique em iniciar.</li>
              <li>Acompanhe em tempo real os logs de progresso e veja a lista se preencher automaticamente.</li>
              <li>Qualifique os melhores leads para inseri-los no pipeline do CRM principal com um clique.</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black text-blue-400 uppercase tracking-wider mb-2">🧪 Teste Rápido (Autocura & Python)</h4>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              Se preferir rodar a raspagem em massa e com maior velocidade em background pelo seu computador, você pode disparar o script Python local:
            </p>
            <div className="bg-dark-950 border border-dark-700/60 rounded-xl p-3 font-mono text-[10px] text-zinc-300 select-all">
              python tools/prospectar_leads.py --nicho "crossfit" --cidade "Sorocaba" --estado "SP" --limite 5
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════ SUB-ABA: LISTAGEM DE LEADS ══════════════════════ */}
      {activeSubTab === 'leads' && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Buscar por nome da empresa, nicho ou cidade..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-neon/40 transition-all placeholder:text-dark-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value)}
                className="bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-neon/40 cursor-pointer"
              >
                <option value="todos">Todos os Status</option>
                <option value="prospecto">Prospecto</option>
                <option value="em_contato">Em Contato</option>
                <option value="convertido">Qualificado/CRM</option>
                <option value="descartado">Descartado</option>
              </select>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className="bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-neon/40 cursor-pointer"
              >
                <option value="todos">Todos os Estados</option>
                {estadosDisponiveis.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-850 border border-dark-700 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filtroEmail}
                  onChange={e => setFiltroEmail(e.target.checked)}
                  className="rounded border-dark-700 text-neon focus:ring-0 cursor-pointer bg-dark-800"
                />
                Com E-mail disponível
              </label>
              <button
                onClick={fetchLeads}
                className="p-2.5 bg-dark-850 border border-dark-700 text-zinc-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Listagem */}
          {loadingLeads ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 text-neon animate-spin" />
            </div>
          ) : leadsFiltrados.length === 0 ? (
            <div className="text-center py-20 bg-dark-900/40 rounded-2xl border border-dark-800/60">
              <Search className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Nenhum lead em potencial encontrado.</p>
              <p className="text-xs text-zinc-600 mt-1">Ajuste os filtros ou crie uma Nova Raspagem para preencher o banco.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leadsFiltrados.map(lead => {
                const temGancho = !!lead.dados_personalizados?.gancho_whatsapp;
                const statusColors = {
                  prospecto: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  em_contato: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                  convertido: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  descartado: 'bg-zinc-800 text-zinc-500 border-dark-700'
                };

                return (
                  <div
                    key={lead.id}
                    className="bg-dark-900/60 border border-dark-800 rounded-2xl p-5 flex flex-col justify-between hover:border-dark-700 transition-all group relative overflow-hidden"
                  >
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColors[lead.status] || statusColors.prospecto}`}>
                        {lead.status === 'convertido' ? 'Qualificado' : lead.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-zinc-600">{new Date(lead.criado_em).toLocaleDateString('pt-BR')}</span>
                    </div>

                    {/* Informações básicas */}
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white group-hover:text-neon transition-colors truncate">{lead.nome_empresa}</h3>
                      <p className="text-[10px] text-zinc-500 font-medium">{lead.segmento} · {lead.cidade} ({lead.estado})</p>
                    </div>

                    {/* Contatos */}
                    <div className="mt-4 space-y-2 border-t border-dark-800/60 pt-3">
                      {lead.telefone && (
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Phone className="w-3.5 h-3.5 text-zinc-600" />
                          <span className="font-mono">{lead.telefone}</span>
                        </div>
                      )}
                      {lead.email && (
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Mail className="w-3.5 h-3.5 text-zinc-600" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      )}
                      {lead.site && (
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Globe className="w-3.5 h-3.5 text-zinc-600" />
                          <a
                            href={lead.site}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-neon hover:underline truncate flex items-center gap-1 shrink-0"
                          >
                            Site <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div className="mt-5 pt-3 border-t border-dark-800/60 flex items-center gap-2">
                      {temGancho && (
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg border border-neon/30 bg-neon/10 text-neon hover:bg-neon/20 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Ver Gancho
                        </button>
                      )}
                      <div className="flex-1" />
                      {lead.status !== 'convertido' && lead.status !== 'descartado' && (
                        <>
                          <button
                            onClick={() => qualificarLead(lead)}
                            title="Qualificar lead e mandar para o CRM"
                            className="flex items-center gap-1 px-3 py-2 text-[10px] font-bold rounded-lg bg-emerald-500 text-dark-950 hover:bg-emerald-400 transition-colors cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Qualificar
                          </button>
                          <button
                            onClick={() => descartarLead(lead.id)}
                            title="Descartar lead"
                            className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-zinc-500 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deletarLead(lead.id)}
                        title="Deletar permanentemente do banco"
                        className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-zinc-600 hover:text-red-400 hover:bg-dark-700 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ SUB-ABA: FORMULÁRIO RASPAGEM ══════════════════════ */}
      {activeSubTab === 'raspar' && (
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Play className="w-5 h-5 text-neon" />
            <div>
              <h2 className="text-sm font-bold text-white">Configurar Nova Prospecção</h2>
              <p className="text-xs text-zinc-500">Defina os critérios e execute a busca no Google Maps</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Input Nicho */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Nicho / Termo de Busca</label>
              <input
                type="text"
                placeholder="Ex: Box de Crossfit"
                value={nicho}
                onChange={e => setNicho(e.target.value)}
                className="w-full bg-dark-850 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {NICHO_SUGESTOES.map(s => (
                  <button
                    key={s}
                    onClick={() => setNicho(s)}
                    className="text-[9px] px-2 py-0.5 rounded bg-dark-800 text-zinc-500 hover:text-white border border-dark-700/60"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Cidade e Estado */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: São Paulo"
                  value={cidade}
                  onChange={e => setCidade(e.target.value)}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">UF</label>
                <input
                  type="text"
                  placeholder="SP"
                  maxLength={2}
                  value={estado}
                  onChange={e => setEstado(e.target.value.toUpperCase())}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono text-center"
                />
              </div>
            </div>

            {/* Limite e Checkbox */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block flex justify-between">
                  <span>Limite de Resultados</span>
                  <span className="text-neon font-black">{limite} leads</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={50}
                  step={1}
                  value={limite}
                  onChange={e => setLimite(parseInt(e.target.value))}
                  className="w-full h-1 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-neon"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={priorizarEmails}
                  onChange={e => setPriorizarEmails(e.target.checked)}
                  className="rounded border-dark-700 text-neon focus:ring-0 cursor-pointer bg-dark-800"
                />
                Priorizar e-mails (logar leads sem contato)
              </label>
            </div>
          </div>

          {/* Botão de Disparo */}
          <div className="pt-4 border-t border-dark-800 flex items-center justify-between gap-4">
            <div className="text-zinc-500 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>A prospecção consome créditos da sua conta no Apify. Certifique-se de configurar a API.</span>
            </div>
            <button
              onClick={iniciarProspeccao}
              disabled={raspando}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-neon text-dark-950 font-black text-sm hover:bg-neon/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-neon/10 active:scale-[0.98]"
            >
              {raspando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 shrink-0" />}
              {raspando ? 'Prospectando Leads...' : 'Iniciar Prospecção'}
            </button>
          </div>

          {/* Status & Logs da Operação */}
          {(raspando || logsRaspagem.length > 0) && (
            <div className="space-y-4 pt-4 border-t border-dark-800 animate-fade-in">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-bold flex items-center gap-2">
                  {raspando && <Loader2 className="w-3.5 h-3.5 animate-spin text-neon" />}
                  {progressoStatus}
                </span>
                <span className="text-neon font-black">{percentualProgresso}%</span>
              </div>
              {/* Barra de Progresso */}
              <div className="w-full bg-dark-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-neon h-full transition-all duration-500"
                  style={{ width: `${percentualProgresso}%` }}
                />
              </div>
              {/* Logs */}
              <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1">
                {logsRaspagem.map((log, idx) => (
                  <p key={idx} className={log.includes('❌') ? 'text-red-400' : log.includes('✅') || log.includes('[OK]') ? 'text-emerald-400' : ''}>
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ SUB-ABA: CONFIGURAÇÕES ══════════════════════ */}
      {activeSubTab === 'config' && (
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-neon" />
            <div>
              <h2 className="text-sm font-bold text-white">Chaves de API & IA</h2>
              <p className="text-xs text-zinc-500">Credenciais de integração para o motor de busca e personalização</p>
            </div>
          </div>

          {loadingConfig ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-neon animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Apify Key */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Apify API Token</label>
                  <input
                    type="password"
                    placeholder="Token do Apify (ap_...)"
                    value={config.apify_token}
                    onChange={e => setConfig(prev => ({ ...prev, apify_token: e.target.value }))}
                    className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono"
                  />
                </div>

                {/* Gemini Key */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Gemini API Key (Gemini 3.5 Flash)</label>
                  <input
                    type="password"
                    placeholder="Chave do Google Gemini (AIzaSy...)"
                    value={config.gemini_key}
                    onChange={e => setConfig(prev => ({ ...prev, gemini_key: e.target.value }))}
                    className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono"
                  />
                </div>

                {/* Instantly Key */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Instantly API Key</label>
                  <input
                    type="password"
                    placeholder="Token do Instantly"
                    value={config.instantly_key}
                    onChange={e => setConfig(prev => ({ ...prev, instantly_key: e.target.value }))}
                    className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono"
                  />
                </div>

                {/* Instantly Campaign ID */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Instantly Campaign ID</label>
                  <input
                    type="text"
                    placeholder="UUID da Campanha"
                    value={config.instantly_campaign_id}
                    onChange={e => setConfig(prev => ({ ...prev, instantly_campaign_id: e.target.value }))}
                    className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Prompt de Personalização */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Prompt de Personalização da IA (Abordagem WhatsApp)</label>
                <textarea
                  rows={5}
                  placeholder="Escreva a instrução para o Gemini criar o gancho de abordagem..."
                  value={config.prompt_personalizacao}
                  onChange={e => setConfig(prev => ({ ...prev, prompt_personalizacao: e.target.value }))}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all leading-relaxed"
                />
                <p className="text-[10px] text-zinc-600">A IA lerá os dados de site, categoria e estrelas do local e gerará um pitching com base na sua instrução acima.</p>
              </div>

              {/* Botão de Ação */}
              <div className="pt-4 border-t border-dark-800 flex justify-end">
                <button
                  onClick={saveConfig}
                  disabled={salvandoConfig}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-neon text-dark-950 font-bold text-xs hover:bg-neon/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {salvandoConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {salvandoConfig ? 'Salvando...' : 'Salvar Configurações'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal / Drawer de Detalhes do Lead (Gancho IA) */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-neon" />
                <h3 className="text-sm font-bold text-white">Abordagem Gerada via Gemini 3.5 Flash</h3>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-black text-neon uppercase tracking-wider">Lead</h4>
                <p className="text-sm font-bold text-white">{selectedLead.nome_empresa}</p>
                <p className="text-xs text-zinc-500">{selectedLead.segmento} · {selectedLead.cidade} ({selectedLead.estado})</p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-black text-pink-400 uppercase tracking-wider">Gancho de Abordagem WhatsApp</h4>
                <div className="bg-dark-800/80 border border-dark-700/40 rounded-xl p-4 text-xs text-zinc-200 leading-relaxed font-mono whitespace-pre-wrap select-all">
                  {selectedLead.dados_personalizados?.gancho_whatsapp || 'Nenhum gancho disponível.'}
                </div>
              </div>

              <p className="text-[10px] text-zinc-500 italic">💡 Clique duas vezes ou selecione o texto acima para copiar e disparar no WhatsApp.</p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-dark-700/40 flex justify-end gap-2">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-800 transition-colors cursor-pointer"
              >
                Fechar
              </button>
              {selectedLead.status !== 'convertido' && (
                <button
                  onClick={() => {
                    qualificarLead(selectedLead);
                    setSelectedLead(null);
                  }}
                  className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-dark-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Qualificar Leads
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
