import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Settings, Zap, MapPin, Play, Loader2, Info, CheckCircle2,
  Trash2, Mail, Phone, Globe, Award, Filter, ExternalLink, RefreshCw,
  PlusCircle, Sparkles, X, ChevronRight, AlertTriangle, Cpu, Clock
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
    prompt_personalizacao: '',
    automacao_ativa: false,
    automacao_nichos: ['Box de CrossFit', 'Estúdio de Treinamento', 'Centro de Treinamento Hyrox', 'Academia'],
    automacao_nicho_atual_index: 0,
    automacao_cidades: [],
    automacao_cidade_atual_index: 0,
    automacao_limite: 25,
    automacao_webhook_whatsapp: '',
    webhook_botconversa_crossfit: '',
    webhook_botconversa_hyrox: '',
    webhook_botconversa_academia: '',
    webhook_botconversa_studio: '',
    mensagem_ativacao: 'Oi, tudo bem? 👋'
  });
  const [cidadesInput, setCidadesInput] = useState('');
  const [nichosInput, setNichosInput] = useState('');
  
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Estados de Automação
  const [historico, setHistorico] = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [fila, setFila] = useState([]);
  const [loadingFila, setLoadingFila] = useState(false);
  const [testandoAutomacao, setTestandoAutomacao] = useState(false);
  const [processandoFila, setProcessandoFila] = useState(false);

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
          prompt_personalizacao: data.prompt_personalizacao || '',
          automacao_ativa: data.automacao_ativa || false,
          automacao_nichos: data.automacao_nichos || ['Box de CrossFit', 'Estúdio de Treinamento', 'Centro de Treinamento Hyrox', 'Academia'],
          automacao_nicho_atual_index: data.automacao_nicho_atual_index || 0,
          automacao_cidades: data.automacao_cidades || [],
          automacao_cidade_atual_index: data.automacao_cidade_atual_index || 0,
          automacao_limite: data.automacao_limite || 25,
          automacao_webhook_whatsapp: data.automacao_webhook_whatsapp || '',
          webhook_botconversa_crossfit: data.webhook_botconversa_crossfit || '',
          webhook_botconversa_hyrox:    data.webhook_botconversa_hyrox    || '',
          webhook_botconversa_academia: data.webhook_botconversa_academia || '',
          webhook_botconversa_studio:   data.webhook_botconversa_studio   || '',
          mensagem_ativacao: data.mensagem_ativacao || 'Oi, tudo bem? 👋'
        });
        setCidadesInput((data.automacao_cidades || []).join('\n'));
        setNichosInput((data.automacao_nichos || ['Box de CrossFit', 'Estúdio de Treinamento', 'Centro de Treinamento Hyrox', 'Academia']).join('\n'));
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
        .update({
          apify_token: config.apify_token.trim(),
          gemini_key: config.gemini_key.trim(),
          instantly_key: config.instantly_key.trim(),
          instantly_campaign_id: config.instantly_campaign_id.trim(),
          prompt_personalizacao: config.prompt_personalizacao.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
      if (error) throw error;
      showToast('✅ Configurações salvas com sucesso!');
    } catch (e) {
      console.error('Erro ao salvar config de prospecção:', e);
      showToast('❌ Erro ao salvar configurações.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ─── Salvar Configurações da Automação ──────────────────────────────────────
  const saveAutomacaoConfig = async () => {
    setSalvandoConfig(true);
    try {
      const cidadesArray = cidadesInput
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const nichosArray = nichosInput
        .split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

      const { error } = await supabase
        .from('prospeccao_config')
        .update({
          automacao_ativa: config.automacao_ativa,
          automacao_nichos: nichosArray,
          automacao_cidades: cidadesArray,
          automacao_limite: parseInt(config.automacao_limite || 25),
          automacao_webhook_whatsapp: config.automacao_webhook_whatsapp.trim(),
          webhook_botconversa_crossfit: config.webhook_botconversa_crossfit.trim(),
          webhook_botconversa_hyrox:    config.webhook_botconversa_hyrox.trim(),
          webhook_botconversa_academia: config.webhook_botconversa_academia.trim(),
          webhook_botconversa_studio:   config.webhook_botconversa_studio.trim(),
          mensagem_ativacao: config.mensagem_ativacao.trim() || 'Oi, tudo bem? 👋',
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) throw error;
      showToast('✅ Configurações da automação salvas!');
      fetchConfig();
    } catch (e) {
      console.error('Erro ao salvar config de automação:', e);
      showToast('❌ Erro ao salvar.');
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

  // ─── Fetch Histórico de Automação ──────────────────────────────────────────
  const fetchHistorico = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from('prospeccao_historico')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(20);
      if (error) throw error;
      setHistorico(data || []);
    } catch (e) {
      console.error('Erro ao buscar histórico:', e);
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  // ─── Fetch Fila de Envios ──────────────────────────────────────────────────
  const fetchFila = useCallback(async () => {
    setLoadingFila(true);
    try {
      const { data, error } = await supabase
        .from('prospeccao_fila_envio')
        .select('*')
        .order('agendado_para', { ascending: true })
        .limit(100);
      if (error) throw error;
      setFila(data || []);
    } catch (e) {
      console.error('Erro ao buscar fila:', e);
    } finally {
      setLoadingFila(false);
    }
  }, []);

  // ─── Simular Cron de Extração (06h AM) ──────────────────────────────────────
  const testarAgendamento = async () => {
    setTestandoAutomacao(true);
    try {
      showToast('🧪 Simulando Cron de Extração...');
      const res = await fetch('/api/prospeccao-proxy?service=apify&action=cron&force=true');
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'inactive') {
          showToast('⚠️ Automação inativa nas configurações.');
        } else {
          showToast('🚀 Automação diária disparada!');
          fetchHistorico();
          setTimeout(() => fetchFila(), 5000); // Dar tempo do webhook iniciar
        }
      } else {
        throw new Error(data.error || 'Erro no agendamento');
      }
    } catch (e) {
      console.error(e);
      showToast(`❌ Erro no teste: ${e.message}`);
    } finally {
      setTestandoAutomacao(false);
    }
  };

  // ─── Simular Cron de Fila (Disparos 10h-19h) ────────────────────────────────
  const testarProcessarFila = async () => {
    setProcessandoFila(true);
    try {
      showToast('⚡ Processando mensagens pendentes...');
      const res = await fetch('/api/prospeccao-proxy?service=apify&action=fila');
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Fila processada! Enviados: ${data.enviados || 0}, Falhas: ${data.falhas || 0}`);
        fetchFila();
      } else {
        throw new Error(data.message || 'Erro');
      }
    } catch (e) {
      console.error(e);
      showToast('❌ Erro ao disparar mensagens.');
    } finally {
      setProcessandoFila(false);
    }
  };

  // ─── Disparar Registro Individual da Fila ──────────────────────────────────
  const dispararFilaLead = async (lead) => {
    try {
      showToast('⚡ Enviando mensagem individual...');
      if (!config.automacao_webhook_whatsapp) {
        showToast('⚠️ Configure o webhook de WhatsApp da automação.');
        return;
      }
      const response = await fetch(config.automacao_webhook_whatsapp.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_empresa: lead.nome_empresa,
          telefone: lead.telefone,
          mensagem: lead.mensagem,
          perfil_detectado: lead.perfil_detectado,
          cidade_origem: lead.cidade_origem,
          segmento_origem: lead.segmento_origem
        })
      });

      if (response.ok) {
        showToast('✅ Mensagem enviada!');
        await supabase
          .from('prospeccao_fila_envio')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            tentativas: lead.tentativas + 1
          })
          .eq('id', lead.id);
        fetchFila();
      } else {
        const errText = await response.text();
        throw new Error(errText);
      }
    } catch (e) {
      console.error(e);
      showToast('❌ Falha ao enviar.');
    }
  };

  // ─── Remover Item da Fila ──────────────────────────────────────────────────
  const removerItemFila = async (id) => {
    try {
      const { error } = await supabase
        .from('prospeccao_fila_envio')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('🗑️ Lead removido da fila de envio.');
      fetchFila();
    } catch (e) {
      console.error(e);
      showToast('❌ Falha ao remover da fila.');
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchLeads();
    fetchHistorico();
    fetchFila();
  }, [fetchConfig, fetchLeads, fetchHistorico, fetchFila]);

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
          status: 'novo',
          origem: 'prospeccao'
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
            { id: 'automacao', label: 'Automação Diária', icon: Cpu },
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

      {/* ══════════════════════ SUB-ABA: AUTOMACÃO DIÁRIA ══════════════════════ */}
      {activeSubTab === 'automacao' && (
        <div className="space-y-6 animate-fade-in">
          {/* ─── Painel Informativo ─── */}
          <div className="bg-dark-900 border border-neon/30 rounded-2xl p-6 space-y-4 shadow-xl shadow-neon/5">
            <div className="flex items-start gap-3">
              <Cpu className="w-5 h-5 text-neon shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white mb-1">Painel de Automação Diária (Prospecção Inteligente)</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Esta funcionalidade roda de forma 100% autônoma na nuvem (Vercel Cron + Supabase). Ela automatiza o pipeline de captação
                  e envio de mensagens frias via WhatsApp, garantindo um fluxo constante de novos potenciais clientes sem esforço manual.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-dark-800 text-xs">
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-neon uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 1. Extração de Dados
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Diariamente às <strong>06:00 AM</strong>, o robô raspa o Google Maps buscando por um Nicho na Cidade do dia.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-neon uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> 2. Filtro & IA Gemini
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Filtra leads repetidos ou inválidos. O <strong>Gemini 3.5 Flash</strong> analisa o site e gera um gancho de abordagem sob medida. 
                  <em> Destaque especial para locais com modalidade Hyrox.</em>
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-neon uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> 3. Fila de Envios Humanos
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Das <strong>10:00 AM às 19:00 PM</strong>, as mensagens são enfileiradas e disparadas via webhook com intervalos randômicos de 1 a 15 min.
                </p>
              </div>
            </div>
            {/* Aviso Vercel Hobby e Cron-Job.org */}
            <div className="mt-4 p-4 bg-dark-950/80 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-amber-400 block">Configuração para Contas Vercel Hobby (Gratuita)</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  A Vercel Hobby permite apenas 1 Cron Job diário nativo (utilizado para iniciar a extração das 06:00 AM).
                  Para processar os disparos agendados na fila ao longo do dia, configure uma chamada periódica gratuita em um serviço de cron externo como o{' '}
                  <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-neon hover:underline inline-flex items-center gap-0.5">
                    cron-job.org <ExternalLink className="w-2.5 h-2.5" />
                  </a>{' '}
                  para bater na URL abaixo a cada <strong>5 ou 10 minutos</strong>:
                </p>
                <div className="bg-dark-900 border border-dark-700/60 p-2.5 rounded-lg font-mono text-[10px] text-zinc-300 select-all break-all">
                  https://brave-hub-two.vercel.app/api/prospeccao-proxy?service=apify&action=fila
                </div>
              </div>
            </div>
          </div>

          {/* ─── Configurações da Automação ─── */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-dark-800 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-neon" />
                <div>
                  <h3 className="text-sm font-bold text-white">Configurar Parâmetros & Rotação</h3>
                  <p className="text-xs text-zinc-500">Ajuste o comportamento do fluxo automático de prospecção</p>
                </div>
              </div>

              {/* Ativar/Desativar Switch */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-xs text-zinc-400 font-bold">Automação Ativa</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={config.automacao_ativa}
                    onChange={e => setConfig(prev => ({ ...prev, automacao_ativa: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-dark-800 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon peer-checked:after:bg-dark-950"></div>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Webhook do WhatsApp */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Webhook de WhatsApp Comercial</label>
                <input
                  type="text"
                  placeholder="https://sua-api-whatsapp.com/webhook..."
                  value={config.automacao_webhook_whatsapp}
                  onChange={e => setConfig(prev => ({ ...prev, automacao_webhook_whatsapp: e.target.value }))}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono"
                />
                <p className="text-[10px] text-zinc-500">Endpoint que receberá o JSON com os dados do lead para realizar o disparo das mensagens.</p>
              </div>

              {/* Cidades Rotacionais */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Cidades Rotacionais ({cidadesInput.split('\n').filter(Boolean).length} cadastradas)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCidadesInput([
                      'Curitiba', 'Porto Alegre', 'Florianópolis', 'Londrina', 'Caxias do Sul', 'Joinville', 'Maringá', 'Blumenau',
                      'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Vitória', 'Campinas', 'Ribeirão Preto', 'Sorocaba', 'Uberlândia',
                      'Brasília', 'Goiânia', 'Cuiabá', 'Campo Grande',
                      'Salvador', 'Recife', 'Fortaleza', 'São Luís', 'Maceió', 'Teresina', 'Natal', 'João Pessoa', 'Aracaju'
                    ].join('\n'))}
                    className="text-[9px] text-neon hover:underline cursor-pointer"
                  >
                    Carregar Sugeridas (Regiões Sul, Sudeste, Centro-Oeste e Cap. Nordeste)
                  </button>
                </div>
                <textarea
                  rows={6}
                  placeholder="Escreva uma cidade por linha (Ex: Sorocaba)..."
                  value={cidadesInput}
                  onChange={e => setCidadesInput(e.target.value)}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono leading-relaxed"
                />
              </div>

              {/* Nichos Rotacionais */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Nichos a Prospectar ({nichosInput.split('\n').filter(Boolean).length} cadastrados)
                  </label>
                  <button
                    type="button"
                    onClick={() => setNichosInput([
                      'Box de CrossFit',
                      'Estúdio de Treinamento',
                      'Centro de Treinamento Hyrox',
                      'Academia'
                    ].join('\n'))}
                    className="text-[9px] text-neon hover:underline cursor-pointer"
                  >
                    Resetar Nichos Recomendados
                  </button>
                </div>
                <textarea
                  rows={6}
                  placeholder="Escreva um nicho por linha..."
                  value={nichosInput}
                  onChange={e => setNichosInput(e.target.value)}
                  className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-neon/40 transition-all font-mono leading-relaxed"
                />
              </div>

              {/* Limite de Leads */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block flex justify-between">
                  <span>Limite Diário de Captação (Apify)</span>
                  <span className="text-neon font-black">{config.automacao_limite || 25} leads por execução</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={config.automacao_limite}
                  onChange={e => setConfig(prev => ({ ...prev, automacao_limite: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-neon"
                />
                <p className="text-[10px] text-zinc-500">
                  💡 <strong>Atenção:</strong> Recomendamos manter em <strong>25 leads diários</strong> para garantir que a cota gratuita do Apify de US$ 5/mês dure o mês inteiro sem custos adicionais.
                </p>
              </div>
            </div>

            {/* Botão de Salvar Configs */}
            <div className="pt-4 border-t border-dark-800 flex justify-end">
              <button
                onClick={saveAutomacaoConfig}
                disabled={salvandoConfig}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-neon text-dark-950 font-bold text-xs hover:bg-neon/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {salvandoConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {salvandoConfig ? 'Salvando...' : 'Salvar Configurações da Automação'}
              </button>
            </div>
          </div>

          {/* ─── Card: Integração BotConversa ─── */}
          <div className="bg-dark-900 border border-purple-500/20 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/10 rounded-xl shrink-0">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Fluxos BotConversa por Perfil</h3>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Configure um webhook do BotConversa para cada perfil de cliente. Quando um lead for qualificado, o sistema
                  enviará automaticamente os dados para o fluxo correto — incluindo a{' '}
                  <strong className="text-purple-400">mensagem de ativação</strong> (para acionar o bot automático do negócio)
                  e o <strong className="text-purple-400">gancho personalizado pela IA</strong>.
                </p>
              </div>
            </div>

            {/* Estratégia Visual */}
            <div className="bg-dark-950 border border-dark-800 rounded-xl p-4">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-wider mb-3">🧠 Estratégia de Duplo Disparo</p>
              <div className="flex items-center gap-2 flex-wrap text-[10px] text-zinc-400">
                <span className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 font-mono">MSG 0 → Oi, tudo bem? 👋</span>
                <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                <span className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-zinc-500">Bot deles responde (60s)</span>
                <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                <span className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1.5 text-purple-300 font-mono">MSG 1 → Gancho IA personalizado</span>
                <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                <span className="bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-zinc-500">Fluxo de relacionamento</span>
              </div>
            </div>

            {/* Mensagem de Ativação */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Mensagem de Ativação (MSG 0 — enviada antes do gancho)
              </label>
              <input
                type="text"
                placeholder="Oi, tudo bem? 👋"
                value={config.mensagem_ativacao}
                onChange={e => setConfig(prev => ({ ...prev, mensagem_ativacao: e.target.value }))}
                className="w-full bg-dark-850 border border-dark-700 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500/40 transition-all"
              />
              <p className="text-[10px] text-zinc-600">Mensagem simples enviada antes do gancho para ativar o bot automático do negócio.</p>
            </div>

            {/* Webhooks por perfil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'webhook_botconversa_crossfit', label: '🏋️ CrossFit', color: 'text-green-400', border: 'focus:border-green-500/40', placeholder: 'Webhook BotConversa — Fluxo CrossFit' },
                { key: 'webhook_botconversa_hyrox',    label: '🏃 Hyrox',    color: 'text-pink-400',  border: 'focus:border-pink-500/40',  placeholder: 'Webhook BotConversa — Fluxo Hyrox' },
                { key: 'webhook_botconversa_academia', label: '🏛️ Academia', color: 'text-blue-400',  border: 'focus:border-blue-500/40',  placeholder: 'Webhook BotConversa — Fluxo Academia' },
                { key: 'webhook_botconversa_studio',   label: '🎨 Studio',   color: 'text-amber-400', border: 'focus:border-amber-500/40', placeholder: 'Webhook BotConversa — Fluxo Studio' },
              ].map(({ key, label, color, border, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</label>
                    {config[key] ? (
                      <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider">✓ Configurado</span>
                    ) : (
                      <span className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">Não configurado</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={config[key]}
                    onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                    className={`w-full bg-dark-850 border border-dark-700 text-white text-[11px] rounded-xl px-3 py-2.5 focus:outline-none ${border} transition-all font-mono`}
                  />
                </div>
              ))}
            </div>

            {/* Payload enviado ao BotConversa */}
            <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">📦 Payload enviado ao BotConversa (campos disponíveis)</p>
              <pre className="text-[10px] text-zinc-400 font-mono leading-relaxed select-all">{`{
  "telefone":          "11999999999",
  "nome_empresa":      "Box CrossFit Alpha",
  "mensagem_ativacao": "Oi, tudo bem? 👋",
  "gancho_inicial":    "Mensagem personalizada da IA",
  "perfil_detectado":  "crossfit | hyrox | academia | studio",
  "cidade_origem":     "São Paulo",
  "segmento_origem":   "Box de CrossFit"
}`}</pre>
            </div>

            <div className="pt-2 border-t border-dark-800 flex justify-end">
              <button
                onClick={saveAutomacaoConfig}
                disabled={salvandoConfig}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {salvandoConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {salvandoConfig ? 'Salvando...' : 'Salvar Fluxos BotConversa'}
              </button>
            </div>
          </div>

          {/* ─── Painel de Testes Práticos (Autocura & Validação Fácil) ─── */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-neon" />
              <div>
                <h3 className="text-sm font-bold text-white">Painel de Testes Rápidos</h3>
                <p className="text-xs text-zinc-500">Dispare os gatilhos crons manualmente para validar o comportamento e depurar sem precisar esperar o agendador</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Simular extração */}
              <div className="bg-dark-850 border border-dark-750 p-4 rounded-xl flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-neon" />
                    Extração & Agendamento (06:00)
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Dispara a extração do Apify na cidade atual da rotação, qualifica pelo Gemini e agenda os envios na fila.
                  </p>
                </div>
                <button
                  onClick={testarAgendamento}
                  disabled={testandoAutomacao}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neon text-dark-950 font-bold text-xs hover:bg-neon/90 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {testandoAutomacao ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Simular Agendamento (Extração)
                </button>
              </div>

              {/* Processar Fila */}
              <div className="bg-dark-850 border border-dark-750 p-4 rounded-xl flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Disparar Fila de WhatsApp (10:00 - 19:00)
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Processa as mensagens que já alcançaram seu horário agendado e dispara via webhook de WhatsApp cadastrado.
                  </p>
                </div>
                <button
                  onClick={testarProcessarFila}
                  disabled={processandoFila}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-500 text-dark-950 font-bold text-xs hover:bg-emerald-400 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {processandoFila ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  Processar Fila Agora
                </button>
              </div>
            </div>
          </div>

          {/* ─── Fila de Envios do Dia ─── */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-neon" />
                <div>
                  <h3 className="text-sm font-bold text-white">Fila de Envios Agendados</h3>
                  <p className="text-xs text-zinc-500">Leads qualificados agendados para receber abordagem hoje</p>
                </div>
              </div>
              <button
                onClick={fetchFila}
                className="p-2 bg-dark-850 hover:bg-dark-800 border border-dark-700 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingFila ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-neon animate-spin" />
              </div>
            ) : fila.length === 0 ? (
              <div className="text-center py-12 bg-dark-850/40 rounded-xl border border-dark-800/40">
                <Clock className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">Nenhum lead agendado na fila.</p>
                <p className="text-[10px] text-zinc-650 mt-0.5">Use o botão "Simular Agendamento" para extrair e enfileirar leads de teste.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-dark-800 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      <th className="pb-3">Empresa / Cidade</th>
                      <th className="pb-3">Contato</th>
                      <th className="pb-3">Mensagem (IA)</th>
                      <th className="pb-3">Agendado Para</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/45 text-xs text-zinc-300">
                    {fila.map(item => {
                      const isHyrox = item.perfil_detectado === 'hyrox';
                      const statusBadge = {
                        pendente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                        enviado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                        falhou: 'bg-red-500/10 text-red-400 border-red-500/20'
                      };

                      return (
                        <tr key={item.id} className="hover:bg-dark-850/30 transition-colors">
                          <td className="py-3.5 pr-2">
                            <div className="font-bold text-white truncate max-w-[160px]">{item.nome_empresa}</div>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                              <span className="truncate max-w-[100px]">{item.cidade_origem}</span>
                              <span className="text-zinc-700">·</span>
                              {isHyrox ? (
                                <span className="inline-flex items-center gap-1 bg-pink-500/10 text-pink-400 border border-pink-500/20 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                                  <span className="h-1.5 w-1.5 bg-pink-500 rounded-full animate-pulse"></span>
                                  Hyrox
                                </span>
                              ) : (
                                <span className="text-zinc-650 uppercase text-[9px]">{item.perfil_detectado}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 pr-2 font-mono text-zinc-400">{item.telefone}</td>
                          <td className="py-3.5 pr-2 max-w-[200px]">
                            <p className="truncate text-zinc-450" title={item.mensagem}>{item.mensagem}</p>
                          </td>
                          <td className="py-3.5 pr-2 text-zinc-400">
                            {new Date(item.agendado_para).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h
                            <span className="text-[10px] text-zinc-650 ml-1">({new Date(item.agendado_para).toLocaleDateString('pt-BR')})</span>
                          </td>
                          <td className="py-3.5 pr-2">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadge[item.status] || 'bg-zinc-800'}`}>
                              {item.status}
                            </span>
                            {item.tentativas > 0 && (
                              <span className="text-[9px] text-zinc-605 block mt-0.5">({item.tentativas} tent.)</span>
                            )}
                          </td>
                          <td className="py-3.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              {item.status === 'pendente' && (
                                <button
                                  onClick={() => dispararFilaLead(item)}
                                  title="Enviar imediatamente"
                                  className="p-1.5 bg-dark-800 border border-dark-700 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                                >
                                  <Zap className="w-3.5 h-3.5 text-neon" />
                                </button>
                              )}
                              <button
                                onClick={() => removerItemFila(item.id)}
                                title="Remover da fila"
                                className="p-1.5 bg-dark-800 border border-dark-700 text-zinc-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Histórico de Logs / Execuções ─── */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-neon" />
                <div>
                  <h3 className="text-sm font-bold text-white">Histórico de Execuções</h3>
                  <p className="text-xs text-zinc-500">Últimos logs da automação diária de prospecção</p>
                </div>
              </div>
              <button
                onClick={fetchHistorico}
                className="p-2 bg-dark-850 hover:bg-dark-800 border border-dark-700 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingHistorico ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-neon animate-spin" />
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                Nenhuma execução registrada no histórico ainda.
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {historico.map(log => {
                  const statusColor = log.status === 'sucesso' ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <div key={log.id} className="bg-dark-850/45 border border-dark-800/80 rounded-xl p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">Extração: {log.nicho_buscado}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-400">{log.cidade_buscada}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed max-w-xl">{log.detalhes}</p>
                      </div>
                      <div className="flex items-center md:flex-col md:items-end gap-3 md:gap-1.5 text-[10px] shrink-0">
                        <span className={`font-black uppercase tracking-wider ${statusColor}`}>{log.status}</span>
                        <span className="text-zinc-500">{new Date(log.criado_em).toLocaleString('pt-BR')}</span>
                        <div className="text-zinc-400 bg-dark-800 px-2 py-0.5 rounded border border-dark-700/60">
                          Qualificados: <strong className="text-neon font-black">{log.leads_qualificados}</strong> / {log.leads_encontrados}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
