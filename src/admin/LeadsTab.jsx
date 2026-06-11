import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Loader2, Plus, Phone, User, Search, ChevronDown, ChevronLeft, ChevronRight, Info,
  Flame, Thermometer, Snowflake, ExternalLink, RotateCcw,
  CheckCircle2, MessageCircle, TrendingUp, X, Image, ScanLine, Trash2,
  ThumbsUp, ArrowRight, Edit2,
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
  { value: 'novo',             label: 'Novo',             color: 'text-zinc-400',   bg: 'bg-zinc-500/10',   border: 'border-zinc-500/20'   },
  { value: 'fluxo_disparado',  label: 'Fluxo Disparado',  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  { value: 'respondeu',        label: 'Respondeu',        color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  { value: 'orcamento_gerado', label: 'Orçamento Gerado', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  { value: 'link_aberto',      label: 'Link Aberto',      color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { value: 'qualificando',     label: 'Qualificando',     color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20'   },
  { value: 'convertido',       label: 'Convertido',       color: 'text-neon',       bg: 'bg-neon/10',       border: 'border-neon/20'       },
  { value: 'aprovado',         label: 'Aprovado ✓',       color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20'},
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

const FUNNEL_STAGES = ['fluxo_disparado', 'respondeu', 'orcamento_gerado', 'link_aberto'];

// Ordem de progressão do funil — usada para contagem cumulativa
const FUNNEL_ORDER = ['fluxo_disparado', 'respondeu', 'orcamento_gerado', 'link_aberto', 'qualificando', 'convertido', 'aprovado'];

// Baseline histórico (leads que passaram pelo estágio antes do sistema rastrear automaticamente)
// Incrementado pelo count cumulativo real do banco a partir desta data
const FUNNEL_BASELINE = { fluxo_disparado: 175, respondeu: 115, orcamento_gerado: 101, link_aberto: 82 };

function atingiuEstagio(status, target) {
  const si = FUNNEL_ORDER.indexOf(status);
  const ti = FUNNEL_ORDER.indexOf(target);
  return si !== -1 && ti !== -1 && si >= ti;
}

/* ─── Funnel metrics ─── */
function FunnelBar({ leads, useBaseline = false }) {
  const counts = STATUS_PIPELINE
    .filter(s => FUNNEL_STAGES.includes(s.value))
    .map(s => {
      const real = leads.filter(l => atingiuEstagio(l.status, s.value)).length;
      return {
        ...s,
        count: useBaseline ? Math.max(FUNNEL_BASELINE[s.value] ?? 0, real) : real,
      };
    });

  // Taxa de conversão: count[i] / count[i-1] (do estágio anterior com pelo menos 1 lead)
  function taxa(i) {
    const prev = counts[i - 1]?.count;
    const curr = counts[i]?.count;
    if (!prev || prev === 0) return null;
    return Math.round((curr / prev) * 100);
  }

  return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-neon" /> Pipeline de Leads
      </h3>
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {counts.map((s, i) => (
          <div key={s.value} className="flex items-start gap-1 shrink-0">
            {/* Estágio */}
            <div className="flex flex-col items-center min-w-[72px]">
              <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
              <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight text-center">{s.label}</div>
              <div className="mt-1.5 w-full h-1 rounded-full bg-dark-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.bg.replace('/10', '/60')}`}
                  style={{ width: `${leads.length ? Math.round((s.count / leads.length) * 100) : 0}%` }}
                />
              </div>
            </div>
            {/* Seta com taxa entre estágios */}
            {i < counts.length - 1 && (
              <div className="flex flex-col items-center pt-1.5 min-w-[32px]">
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                {taxa(i + 1) !== null && (
                  <span className="text-[9px] font-bold text-zinc-500 mt-0.5">{taxa(i + 1)}%</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Parser de texto do RD Station ─── */
function parsarTextoRD(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const resultado = { nome: '', telefone: '', momento_compra: '', produtos_interesse: [] };

  for (const linha of linhas) {
    const lower = linha.toLowerCase();

    // Nome
    if (lower.startsWith('nome:') || lower.startsWith('name:')) {
      resultado.nome = linha.split(':').slice(1).join(':').trim();
    }
    // Telefone
    else if (lower.startsWith('telefone:') || lower.startsWith('fone:') || lower.startsWith('phone:') || lower.startsWith('celular:')) {
      resultado.telefone = linha.split(':').slice(1).join(':').trim().replace(/\D/g, '');
    }
    // Momento (linha que contém alguma das opções)
    else if (lower.includes('momento') || lower.includes('comprar') || lower.includes('comparando') || lower.includes('entender')) {
      const val = linha.split('?').slice(-1)[0].trim() || linha.split(':').slice(-1)[0].trim();
      const match = MOMENTOS.find(m => val.toLowerCase().includes(m.value.toLowerCase().slice(0, 10)));
      if (match) resultado.momento_compra = match.value;
    }
    // Equipamentos (linha que contém "equipamento" ou "ergometro" ou aliases)
    else if (lower.includes('equipamento') || lower.includes('ergometro') || lower.includes('ergômetro')) {
      const parte = linha.split(':').slice(1).join(':').trim() || linha.split('|').slice(-1)[0].trim();
      const itens = parte.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      resultado.produtos_interesse = itens
        .map(item => {
          const eq = EQUIPAMENTOS.find(e => item.includes(e.label.toLowerCase()) || e.label.toLowerCase().includes(item));
          return eq?.alias || null;
        })
        .filter(Boolean);
    }
  }
  return resultado;
}

/* ─── Formulário de cadastro ─── */
function CadastroModal({ onClose, onSaved }) {
  const [abaInput, setAbaInput] = useState('imagem'); // 'texto' | 'imagem'
  const [textoRD, setTextoRD] = useState('');
  const [imagemRD, setImagemRD] = useState(null); // { preview, base64, mimeType }
  const [extraindo, setExtraindo] = useState(false);
  const [form, setForm] = useState({
    nome: '', telefone: '', email: '',
    momento_compra: MOMENTOS[0].value,
    produtos_interesse: [],
    observacoes: '',
    consultor: 'Léo Berg',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(null);

  const aplicarDados = (dados) => {
    setForm(prev => ({
      ...prev,
      nome: dados.nome || prev.nome,
      telefone: dados.telefone || prev.telefone,
      email: dados.email || prev.email,
      momento_compra: dados.momento_compra || prev.momento_compra,
      produtos_interesse: dados.produtos_interesse?.length > 0 ? dados.produtos_interesse : prev.produtos_interesse,
      consultor: dados.consultor || prev.consultor,
    }));
  };

  const handleColar = (texto) => {
    setTextoRD(texto);
    if (!texto.trim()) return;
    aplicarDados(parsarTextoRD(texto));
  };

  const extrairDadosImagem = async (base64, mimeType) => {
    setExtraindo(true);
    setErro('');
    try {
      const { data, error } = await supabase.functions.invoke('extrair-lead-imagem', {
        body: { imageBase64: base64, mimeType },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      aplicarDados(data);
    } catch (err) {
      setErro('Erro ao extrair dados da imagem: ' + err.message);
    } finally {
      setExtraindo(false);
    }
  };

  const processarImagem = (file) => {
    if (!file?.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(',')[1];
      setImagemRD({ preview: dataUrl, base64, mimeType: file.type });
      extrairDadosImagem(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  // Captura Ctrl+V com imagem em qualquer lugar do modal
  useEffect(() => {
    const handlePaste = (e) => {
      if (abaInput !== 'imagem') return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (!imgItem) return;
      e.preventDefault();
      processarImagem(imgItem.getAsFile());
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [abaInput]);

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
        body: form,
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
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-dark-900 border border-neon/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-neon/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-neon" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Lead cadastrado!</h2>
          <p className="text-sm text-zinc-400 mb-6">
            {sucesso.lead.status === 'fluxo_disparado'
              ? 'Fluxo disparado no BotConversa. O link de orçamento será gerado pelo bot ao final do fluxo.'
              : 'Lead salvo. Configure o webhook BOTCONVERSA_WEBHOOK_NOVO_LEAD para disparar o fluxo automaticamente.'}
          </p>
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
          {/* Importar dados do RD Station */}
          <div className="bg-dark-800/80 border border-dashed border-neon/30 rounded-xl overflow-hidden">
            {/* Abas */}
            <div className="flex border-b border-dark-700/60">
              <button
                onClick={() => setAbaInput('imagem')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${abaInput === 'imagem' ? 'text-neon border-b-2 border-neon bg-neon/5' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <ScanLine className="w-3.5 h-3.5" /> Print da tela
              </button>
              <button
                onClick={() => setAbaInput('texto')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${abaInput === 'texto' ? 'text-neon border-b-2 border-neon bg-neon/5' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Texto
              </button>
              <span className="ml-auto flex items-center pr-4 text-[10px] text-zinc-600 italic">opcional — preenche automaticamente</span>
            </div>

            <div className="p-4">
              {abaInput === 'imagem' ? (
                <div
                  className={`relative border-2 border-dashed rounded-xl transition-all ${imagemRD ? 'border-neon/40' : 'border-dark-600 hover:border-neon/30'}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); processarImagem(e.dataTransfer.files[0]); }}
                >
                  {extraindo ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-neon" />
                      <span className="text-sm text-neon font-medium">Extraindo dados com IA...</span>
                      <span className="text-[10px] text-zinc-500">Gemini Vision analisando o print</span>
                    </div>
                  ) : imagemRD ? (
                    <div className="p-3 text-center">
                      <img src={imagemRD.preview} alt="Print RD Station" className="max-h-36 mx-auto rounded-lg mb-2 object-contain border border-dark-600" />
                      <p className="text-[10px] text-neon/80 font-semibold">✓ Dados extraídos — revise os campos abaixo</p>
                      <button onClick={() => setImagemRD(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-1 transition-colors cursor-pointer">Remover imagem</button>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <Image className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-sm text-zinc-400 font-medium">Cole o print aqui <kbd className="text-[10px] bg-dark-700 border border-dark-600 rounded px-1.5 py-0.5 text-zinc-500">Ctrl+V</kbd></p>
                      <p className="text-[10px] text-zinc-600 mt-1">ou arraste a imagem da tela do RD Station</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    value={textoRD}
                    onChange={e => handleColar(e.target.value)}
                    rows={4}
                    placeholder={"Cole o texto copiado do RD Station CRM.\nEx:\nNome: João Silva\nTelefone: 11999999999\nEquipamento | Ergometro: Bike Erg, Remo\nEm que momento você está: Quero comprar agora"}
                    className="w-full bg-dark-900 border border-dark-600 text-zinc-300 text-xs font-mono rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-neon/50 transition-all placeholder:text-dark-600"
                  />
                  {textoRD.trim() && (
                    <p className="text-[10px] text-neon/70 mt-1.5">✓ Dados detectados — revise os campos abaixo antes de salvar.</p>
                  )}
                </div>
              )}
            </div>
          </div>

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

          {/* Email + Consultor */}
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Consultor *</label>
              <select
                value={form.consultor}
                onChange={e => setForm(p => ({ ...p, consultor: e.target.value }))}
                className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-neon/50 transition-all cursor-pointer"
              >
                <option value="Léo Berg">Léo Berg</option>
                <option value="Laís Carlos">Laís Carlos</option>
                <option value="Thiago Freitas">Thiago Freitas</option>
                <option value="Lara Vitória">Lara Vitória</option>
                <option value="Du Barbosa">Du Barbosa</option>
                <option value="Eduardo Aureliano">Eduardo Aureliano</option>
              </select>
            </div>
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
  const [mes, setMes] = useState('todos');

  const changeMonth = (dir) => {
    const base = mes === 'todos'
      ? new Date()
      : new Date(mes + '-15');
    const d = new Date(base.getFullYear(), base.getMonth() + dir, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const mesLabel = mes === 'todos'
    ? 'Todos os meses'
    : new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

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

  const deleteLead = async (lead) => {
    if (!confirm(`Excluir lead "${lead.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('leads').delete().eq('id', lead.id);
    setLeads(prev => prev.filter(l => l.id !== lead.id));
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

  const leadsPorMes = leads.filter(l => {
    if (mes === 'todos') return true;
    const criado = l.criado_em?.slice(0, 7); // 'YYYY-MM'
    return criado === mes;
  });

  const leadsFiltrados = leadsPorMes.filter(l => {
    const matchStatus = filtroStatus === 'todos' || l.status === filtroStatus;
    const matchBusca = !busca || l.nome.toLowerCase().includes(busca.toLowerCase()) || l.telefone.includes(busca);
    return matchStatus && matchBusca;
  });

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Gestão de Leads</h1>
          <p className="text-sm text-zinc-400">
            {mes === 'todos' ? `${leads.length} leads cadastrados` : `${leadsPorMes.length} leads em ${mesLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de mês */}
          <div className="flex items-center gap-1 bg-dark-800 border border-dark-700 rounded-xl p-1">
            <button onClick={() => changeMonth(-1)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-dark-700 cursor-pointer transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMes('todos')}
              className={`text-sm font-semibold px-3 py-1 rounded-lg min-w-[150px] text-center capitalize transition-colors cursor-pointer ${mes === 'todos' ? 'text-neon' : 'text-white hover:text-neon'}`}
            >
              {mesLabel}
            </button>
            <button onClick={() => changeMonth(1)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-dark-700 cursor-pointer transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-neon text-dark-950 font-black text-sm rounded-xl hover:bg-neon/90 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Novo Lead
          </button>
        </div>
      </div>

      {/* Informações da Funcionalidade: Vendedor Dinâmico */}
      <div className="bg-dark-800/40 border border-dark-700/60 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-neon/10 rounded-xl text-neon">
            <Info className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-1">ℹ️ Funcionalidade: Vendedor Dinâmico (Bling)</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              Agora o sistema identifica automaticamente o vendedor/consultor responsável no Bling a partir do lead do CRM.
              Se houver divergências de escrita (como omitir acentos ou sobrenomes), o sistema realiza correspondência inteligente (ex: "Lais" ou "Lais Carlos" se associa a "Laís Carlos" no Bling). Caso não haja correspondência, o padrão será "Léo Berg" (dono da chave de API).
            </p>
            <div className="bg-dark-900/50 rounded-xl p-3 border border-dark-800">
              <span className="text-[10px] font-black uppercase text-neon tracking-wider block mb-1.5">🧪 Como Testar:</span>
              <ol className="list-decimal list-inside text-[11px] text-zinc-400 space-y-1">
                <li>Clique em <strong>Novo Lead</strong> e preencha os dados selecionando um consultor (ex: <code>Thiago Freitas</code>).</li>
                <li>Na aba <strong>Orçamentos</strong>, localize o orçamento gerado para esse lead e clique em <strong>Gerar no Bling</strong> (ou aprove o orçamento rápido).</li>
                <li>Verifique no painel do Bling se a proposta de venda comercial foi corretamente associada ao vendedor cadastrado.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Funil */}
      {!loading && leads.length > 0 && <FunnelBar leads={leadsPorMes} useBaseline={mes === 'todos'} />}

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
                {/* Aprovar lead (manual) */}
                {lead.status !== 'aprovado' && (
                  <button
                    onClick={() => changeStatus(lead, 'aprovado')}
                    disabled={atualizandoStatus === lead.id}
                    title="Marcar como Aprovado"
                    className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-dark-600 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                )}

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

                {/* Editar orçamento no Gerador */}
                {lead.produtos_interesse?.length > 0 && (
                  <a
                    href={`/?nome=${encodeURIComponent(lead.nome)}&produtos=${lead.produtos_interesse.join(',')}&telefone=${encodeURIComponent(lead.telefone || '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Editar orçamento"
                    className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-neon hover:bg-neon/10 border border-dark-600 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </a>
                )}

                {/* Deletar lead */}
                <button
                  onClick={() => deleteLead(lead)}
                  title="Excluir lead"
                  className="p-2 rounded-lg bg-dark-700 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-dark-600 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

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
