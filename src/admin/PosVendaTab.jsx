import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Heart, Star, Send, Clock, CheckCircle2, AlertCircle, RefreshCw,
  Loader2, ChevronDown, ChevronUp, MessageSquare, Gift, TrendingUp,
  Users, Zap, BarChart3, Settings, X, Check, Edit3, ExternalLink,
  Smile, Package, ThumbsUp, Bell, Repeat, Info, Copy, Phone, Truck,
  Wrench, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data';

// ─── Mapa de Equipamentos para Montagem ──────────────────────────────────────

export const EQUIPAMENTOS_MONTAGEM = [
  {
    id: 'remo',
    label: 'Remo',
    icon: '🚣',
    keywords: ['remo', 'rowing', 'concept2', 'waterrower'],
    linkKey: 'link_montagem_remo',
    linkVideosKey: 'link_videos_remo',
    linkManutencaoKey: 'link_manutencao_remo',
  },
  {
    id: 'esteira',
    label: 'Esteira Curva',
    icon: '🏃',
    keywords: ['esteira', 'curva', 'treadmill', 'skillmill', 'woodway'],
    linkKey: 'link_montagem_esteira',
    linkVideosKey: 'link_videos_esteira',
    linkManutencaoKey: 'link_manutencao_esteira',
  },
  {
    id: 'skierg',
    label: 'SkiErg',
    icon: '⛷️',
    keywords: ['skierg', 'ski erg', 'ski-erg'],
    linkKey: 'link_montagem_skierg',
    linkVideosKey: 'link_videos_skierg',
    linkManutencaoKey: 'link_manutencao_skierg',
  },
  {
    id: 'stormbike',
    label: 'Storm Bike',
    icon: '🌪️',
    keywords: ['storm bike', 'stormbike', 'assault bike', 'echo bike', 'air bike'],
    linkKey: 'link_montagem_stormbike',
    linkVideosKey: 'link_videos_stormbike',
    linkManutencaoKey: 'link_manutencao_stormbike',
  },
  {
    id: 'bikeerg',
    label: 'Bike Erg',
    icon: '🚴',
    keywords: ['bike erg', 'bikeerg', 'ergometer', 'concept2 bike'],
    linkKey: 'link_montagem_bikeerg',
    linkVideosKey: 'link_videos_bikeerg',
    linkManutencaoKey: 'link_manutencao_bikeerg',
  },
  {
    id: 'escada',
    label: 'Escada Ergométrica',
    icon: '🪜',
    keywords: ['escada', 'stairmaster', 'stepmill', 'ergométrica', 'ergometrica'],
    linkKey: 'link_montagem_escada',
    linkVideosKey: 'link_videos_escada',
    linkManutencaoKey: 'link_manutencao_escada',
  },
];

/**
 * Detecta quais equipamentos o cliente comprou com base nos nomes dos itens.
 * Retorna array de EQUIPAMENTOS_MONTAGEM que tiveram match.
 */
export function detectarEquipamentos(itens = []) {
  const nomes = itens.map(i => (i.nome || '').toLowerCase());
  return EQUIPAMENTOS_MONTAGEM.filter(eq =>
    eq.keywords.some(kw => nomes.some(n => n.includes(kw)))
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtTel(tel) {
  if (!tel) return '—';
  const d = tel.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

function diasDesde(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function whatsappLink(tel, msg) {
  if (!tel) return '#';
  const num = tel.replace(/\D/g, '');
  const full = num.length === 10 || num.length === 11 ? '55' + num : num;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
}

// ─── Configuração de Estratégias ─────────────────────────────────────────────

const ESTRATEGIAS = [
  {
    id: 'montagem',
    icon: Package,
    cor: 'blue',
    titulo: 'Instruções de Montagem',
    subtitulo: 'Enviado logo após a compra aprovada',
    gatilho: 'Imediatamente após aprovação',
    diasAposCompra: 0,
    descricao: 'Envie um guia de montagem, manutenção e uso dos equipamentos Brave. Isso reduz dúvidas, aumenta a satisfação e demonstra cuidado com o cliente.',
    templatePadrao: `Olá {nome}! 🎉

Sua compra da *Brave* foi aprovada com sucesso!

Preparamos um guia exclusivo para você aproveitar ao máximo seus equipamentos:

📋 *Guia de Montagem:* {link_montagem}
🎥 *Vídeos de Uso:* {link_videos}
🔧 *Dicas de Manutenção:* {link_manutencao}

Qualquer dúvida estamos à disposição! 💪
— {consultor} | Brave Equipment`,
  },
  {
    id: 'avaliacao',
    icon: Star,
    cor: 'yellow',
    titulo: 'Solicitação de Avaliação Google',
    subtitulo: 'Disparado após confirmação de entrega',
    gatilho: 'Entrega confirmada (status Bling "atendido")',
    diasAposCompra: null,
    descricao: 'Solicite avaliação no Google Minha Empresa após a entrega confirmada. Avaliações positivas fortalecem a reputação da Brave e aumentam conversões de novos clientes.',
    templatePadrao: `Olá {nome}! 😊

Os equipamentos Brave chegaram bem?

Sua opinião é *muito importante* para nós e ajuda outros atletas a descobrirem a qualidade dos nossos produtos.

⭐ Deixe sua avaliação (leva menos de 1 minuto):
👉 {link_google}

Muito obrigado pelo carinho! 🙏
— Equipe Brave Equipment`,
  },
  {
    id: 'checkin30',
    icon: Heart,
    cor: 'pink',
    titulo: 'Check-in 30 Dias',
    subtitulo: 'Como estão os primeiros treinos?',
    gatilho: '30 dias após a compra aprovada',
    diasAposCompra: 30,
    descricao: 'Demonstre interesse genuíno no progresso do cliente. Este contato cria um vínculo emocional forte e abre oportunidade para resolver qualquer problema antes que vire insatisfação.',
    templatePadrao: `Olá {nome}! 💪

Já faz *30 dias* que você começou a treinar com a Brave!

Como estão os resultados? Os equipamentos estão atendendo suas expectativas?

Estamos aqui para ajudar no que precisar. É só chamar! 😊

— {consultor} | Brave Equipment`,
  },
  {
    id: 'checkin60',
    icon: TrendingUp,
    cor: 'purple',
    titulo: 'Upsell Inteligente (60 Dias)',
    subtitulo: 'Oferta personalizada baseada na compra',
    gatilho: '60 dias após a compra aprovada',
    diasAposCompra: 60,
    descricao: 'Com 2 meses de uso, o cliente já percebeu o valor dos equipamentos. É o momento ideal para apresentar produtos complementares ao seu setup atual e aumentar o ticket de vida do cliente.',
    templatePadrao: `Olá {nome}! 🚀

Dois meses de treino incrível com a Brave, parabéns pela dedicação!

Tenho novidades e equipamentos que combinam *perfeitamente* com o que você já tem. Posso te apresentar as opções?

Tenho certeza que você vai gostar! 💪

— {consultor} | Brave Equipment`,
  },
  {
    id: 'checkin90',
    icon: Repeat,
    cor: 'green',
    titulo: 'Check-in 90 Dias',
    subtitulo: 'Fortalecendo o relacionamento de longo prazo',
    gatilho: '90 dias após a compra aprovada',
    diasAposCompra: 90,
    descricao: 'Aos 3 meses, o cliente está fidelizado ou pode estar esquecendo da Brave. Este contato reativa o relacionamento e posiciona a Brave como parceira de longo prazo dos treinos.',
    templatePadrao: `Olá {nome}! 🎯

3 meses de parceria com a Brave — como o tempo passa rápido!

Fico feliz em saber que está evoluindo nos treinos. Nossa equipe está sempre disponível para te apoiar.

Algo que posso ajudar? 😊

— {consultor} | Brave Equipment`,
  },
  {
    id: 'nps',
    icon: ThumbsUp,
    cor: 'cyan',
    titulo: 'Pesquisa NPS',
    subtitulo: 'Meça a satisfação e identifique promotores',
    gatilho: '7 dias após confirmação de entrega',
    diasAposCompra: null,
    descricao: 'O Net Promoter Score identifica promotores (que indicam), neutros e detratores. Permite agir rapidamente em casos de insatisfação e transformar clientes felizes em embaixadores da marca.',
    templatePadrao: `Olá {nome}! 📊

Gostaríamos de saber como foi sua experiência com a Brave!

Em uma escala de 0 a 10, *qual a chance de você recomendar a Brave para um amigo?*

0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟

Sua resposta nos ajuda a melhorar ainda mais! 🙏

— Equipe Brave Equipment`,
  },
  {
    id: 'promocao',
    icon: Gift,
    cor: 'orange',
    titulo: 'Promoções e Novidades',
    subtitulo: 'Mantenha o cliente engajado com a marca',
    gatilho: 'Manual — disparar quando houver promoção/evento',
    diasAposCompra: null,
    descricao: 'Envie promoções exclusivas para clientes que já compraram, novidades da linha, dicas de treino e eventos. Clientes existentes têm 5x mais chance de comprar novamente.',
    templatePadrao: `Olá {nome}! 🎁

Você é um cliente especial da Brave e por isso está recebendo em primeira mão:

🔥 *[NOME DA PROMOÇÃO/NOVIDADE]*

[Detalhe da oferta ou notícia aqui]

👉 *Aproveite até [DATA]*: [LINK]

Qualquer dúvida me chame! 😊
— {consultor} | Brave Equipment`,
  },
];

const COR_MAP = {
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   text: 'text-blue-400',   icon: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-400' },
  yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  pink:   { bg: 'bg-pink-500/10',   border: 'border-pink-500/20',   text: 'text-pink-400',   icon: 'text-pink-400',   badge: 'bg-pink-500/20 text-pink-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400' },
  green:  { bg: 'bg-emerald-500/10',border: 'border-emerald-500/20',text: 'text-emerald-400',icon: 'text-emerald-400',badge: 'bg-emerald-500/20 text-emerald-400' },
  cyan:   { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   text: 'text-cyan-400',   icon: 'text-cyan-400',   badge: 'bg-cyan-500/20 text-cyan-400' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', icon: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-400' },
};

// ─── Componente de Status Badge ───────────────────────────────────────────────

function StatusBadge({ dias, estrategia }) {
  if (estrategia.diasAposCompra === null) return null;
  if (dias === null) return null;
  const diasRestantes = estrategia.diasAposCompra - dias;
  if (diasRestantes <= 0) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/20">
      Enviar agora
    </span>
  );
  if (diasRestantes <= 7) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">
      Em {diasRestantes}d
    </span>
  );
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dark-700 text-zinc-500">
      Em {diasRestantes}d
    </span>
  );
}

// ─── Modal de Template ────────────────────────────────────────────────────────

function ModalTemplate({ estrategia, onClose, configLinks }) {
  const cor = COR_MAP[estrategia.cor];
  const Icon = estrategia.icon;
  const [template, setTemplate] = useState(
    localStorage.getItem(`posv_template_${estrategia.id}`) || estrategia.templatePadrao
  );
  const saved = localStorage.getItem(`posv_template_${estrategia.id}`);

  function handleSave() {
    localStorage.setItem(`posv_template_${estrategia.id}`, template);
    onClose();
  }

  function handleReset() {
    setTemplate(estrategia.templatePadrao);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${cor.bg} border ${cor.border} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4 h-4 ${cor.icon}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Template — {estrategia.titulo}</h3>
              <p className="text-[10px] text-zinc-500">{estrategia.gatilho}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Variáveis disponíveis */}
          <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Variáveis disponíveis</p>
            <div className="flex flex-wrap gap-1.5">
              {['{nome}', '{consultor}', '{produto}', '{link_montagem}', '{link_videos}', '{link_manutencao}', '{link_google}'].map(v => (
                <span key={v} className="text-[10px] font-mono bg-dark-700 text-neon px-2 py-1 rounded border border-neon/20">
                  {v}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">As variáveis são substituídas automaticamente ao gerar o link do WhatsApp</p>
          </div>

          {/* Editor */}
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Mensagem</label>
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={12}
              className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-neon/40 transition-all placeholder:text-dark-500 leading-relaxed font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-700/40 flex items-center gap-2">
          <button onClick={handleReset} className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-white border border-dark-600 rounded-xl hover:bg-dark-700 transition-colors cursor-pointer">
            Restaurar padrão
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-dark-950 bg-neon hover:bg-neon/90 rounded-xl transition-colors cursor-pointer">
            <Check className="w-3.5 h-3.5" />
            Salvar Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Configurações de Links ─────────────────────────────────────────

function ModalConfig({ onClose }) {
  const [links, setLinks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('posv_links') || '{}'); }
    catch { return {}; }
  });
  const [abaAtiva, setAbaAtiva] = useState('geral');

  const camposGerais = [
    { id: 'link_google', label: 'Link Google Reviews', placeholder: 'https://g.page/...' },
  ];

  function handleSave() {
    localStorage.setItem('posv_links', JSON.stringify(links));
    onClose();
  }

  // Conta quantos equipamentos têm TODOS os 3 links configurados
  const totalCompletos = EQUIPAMENTOS_MONTAGEM.filter(
    e => links[e.linkKey] && links[e.linkVideosKey] && links[e.linkManutencaoKey]
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neon/10 border border-neon/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-neon" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Configurar Links</h3>
              <p className="text-[10px] text-zinc-500">Links usados nos templates de mensagem</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-dark-700/40 px-6">
          <button
            onClick={() => setAbaAtiva('geral')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              abaAtiva === 'geral' ? 'border-neon text-neon' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Links Gerais
          </button>
          <button
            onClick={() => setAbaAtiva('montagem')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === 'montagem' ? 'border-blue-400 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Wrench className="w-3 h-3" />
            Links por Equipamento
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
              totalCompletos === EQUIPAMENTOS_MONTAGEM.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-700 text-zinc-500'
            }`}>
              {totalCompletos}/{EQUIPAMENTOS_MONTAGEM.length}
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {abaAtiva === 'geral' ? (
            <>
              {camposGerais.map(c => (
                <div key={c.id}>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">{c.label}</label>
                  <input
                    type="url"
                    value={links[c.id] || ''}
                    onChange={e => setLinks(p => ({ ...p, [c.id]: e.target.value }))}
                    placeholder={c.placeholder}
                    className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-neon/40 transition-all placeholder:text-dark-500"
                  />
                </div>
              ))}
              <div className="bg-dark-800/60 border border-amber-500/20 rounded-xl p-3">
                <p className="text-[10px] text-amber-400/80 leading-relaxed">
                  💡 Configure os links por equipamento na aba ao lado (Montagem, Vídeos e Manutenção).
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-[10px] text-blue-300 leading-relaxed">
                  🔍 O sistema detecta o equipamento pelos itens do orçamento e insere o link correto em cada mensagem. Configure os 3 links de cada equipamento abaixo.
                </p>
              </div>
              {EQUIPAMENTOS_MONTAGEM.map(eq => {
                const configs = [
                  { key: eq.linkKey,          label: '🔧 Montagem',   placeholder: 'https://...' },
                  { key: eq.linkVideosKey,    label: '🎬 Vídeos de Uso', placeholder: 'https://youtube.com/...' },
                  { key: eq.linkManutencaoKey,label: '🛠️ Manutenção',  placeholder: 'https://...' },
                ];
                const totalEq = configs.filter(c => links[c.key]).length;
                return (
                  <div key={eq.id} className="bg-dark-800/40 border border-dark-700/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{eq.icon}</span>
                      <span className="text-sm font-bold text-white">{eq.label}</span>
                      <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        totalEq === 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-700 text-zinc-500'
                      }`}>{totalEq}/3</span>
                    </div>
                    {configs.map(c => (
                      <div key={c.key}>
                        <label className="text-[10px] font-semibold text-zinc-500 block mb-1">{c.label}</label>
                        <input
                          type="url"
                          value={links[c.key] || ''}
                          onChange={e => setLinks(p => ({ ...p, [c.key]: e.target.value }))}
                          placeholder={c.placeholder}
                          className="w-full bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400/40 transition-all placeholder:text-dark-500"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-dark-700/40 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-dark-950 bg-neon hover:bg-neon/90 rounded-xl transition-colors cursor-pointer">
            <Check className="w-3.5 h-3.5" />
            Salvar Links
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Selecionar Equipamento (fallback manual) ───────────────────────────

function ModalSelecionarEquipamento({ cliente, estrategia, onConfirm, onClose }) {
  const links = (() => {
    try { return JSON.parse(localStorage.getItem('posv_links') || '{}'); }
    catch { return {}; }
  })();
  const [selecionado, setSelecionado] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/40">
          <div>
            <h3 className="text-sm font-bold text-white">Selecionar Equipamento</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Qual equipamento o cliente comprou?</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-[10px] text-zinc-600 mb-3">Cliente: <span className="text-white font-semibold">{cliente.cliente}</span></p>
          {EQUIPAMENTOS_MONTAGEM.map(eq => {
            const temAlgumLink = !!(links[eq.linkKey] || links[eq.linkVideosKey] || links[eq.linkManutencaoKey]);
            const sel = selecionado === eq.id;
            const totalLinks = [eq.linkKey, eq.linkVideosKey, eq.linkManutencaoKey].filter(k => links[k]).length;
            return (
              <button
                key={eq.id}
                onClick={() => setSelecionado(eq.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                  sel
                    ? 'bg-blue-500/20 border-blue-500/50 text-white'
                    : 'bg-dark-800/60 border-dark-700/40 text-zinc-400 hover:border-dark-600 hover:text-white'
                }`}
              >
                <span className="text-lg">{eq.icon}</span>
                <span className="text-sm font-semibold flex-1">{eq.label}</span>
                {temAlgumLink
                  ? <span className="text-[9px] text-emerald-400 font-bold">{totalLinks}/3 links</span>
                  : <span className="text-[9px] text-zinc-600">Sem links</span>
                }
                {sel && <Check className="w-4 h-4 text-blue-400" />}
              </button>
            );
          })}

          {!EQUIPAMENTOS_MONTAGEM.some(e => links[e.linkKey] || links[e.linkVideosKey] || links[e.linkManutencaoKey]) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mt-2">
              <p className="text-[10px] text-amber-400">
                ⚠️ Nenhum link de montagem configurado. Acesse Configurações → Links para adicionar.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-dark-700/40 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={() => selecionado && onConfirm(EQUIPAMENTOS_MONTAGEM.find(e => e.id === selecionado))}
            disabled={!selecionado}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-dark-950 bg-neon hover:bg-neon/90 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PosVendaTab() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [modalTemplate, setModalTemplate] = useState(null);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalEquipamento, setModalEquipamento] = useState(null); // { cliente, estrategia, modo } onde modo = 'whatsapp' | 'copiar'
  const [toast, setToast] = useState('');
  const [activeSection, setActiveSection] = useState('clientes');
  const [busca, setBusca] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('todos');

  // Config links do localStorage
  const configLinks = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('posv_links') || '{}'); }
    catch { return {}; }
  }, [modalConfig]);

  // Ações persistidas no Supabase: { [orcId_estratId]: { id, executado_em, prevista_em } }
  const [acoesData, setAcoesData] = useState({});

  async function marcarEnviado(orcamentoId, estrategiaId) {
    const agora = new Date().toISOString();
    const key = `${orcamentoId}_${estrategiaId}`;
    const existing = acoesData[key];

    // Atualiza UI imediatamente
    setAcoesData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), executado_em: agora } }));

    try {
      if (existing?.id) {
        await supabase.from('posv_acoes')
          .update({ executado_em: agora, atualizado_em: agora })
          .eq('id', existing.id);
      } else {
        // Orçamento legado (anterior à feature): cria a linha
        const { data: inserted } = await supabase.from('posv_acoes').insert({
          orcamento_id: orcamentoId,
          estrategia_id: estrategiaId,
          executado_em: agora,
          prevista_em: agora,
        }).select('id').single();
        if (inserted) {
          setAcoesData(prev => ({ ...prev, [key]: { id: inserted.id, executado_em: agora, prevista_em: agora } }));
        }
      }
    } catch (e) {
      console.error('[PosVendaTab] erro ao salvar ação:', e);
    }
  }

  function isEnviado(orcamentoId, estrategiaId) {
    return !!acoesData[`${orcamentoId}_${estrategiaId}`]?.executado_em;
  }

  function dataEnvio(orcamentoId, estrategiaId) {
    return acoesData[`${orcamentoId}_${estrategiaId}`]?.executado_em;
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  // Edicao inline de telefone para pedidos Bling sem telefone
  const [editandoTelBling, setEditandoTelBling] = useState({}); // { [orcId]: string }

  async function salvarTelBling(orcId, tel) {
    if (!tel.trim()) return;
    const clean = tel.replace(/\D/g, '');
    // Buscar payload atual
    const { data: orc } = await supabase.from('orcamentos_salvos').select('payload').eq('id', orcId).single();
    if (!orc) return;
    await supabase.from('orcamentos_salvos').update({
      payload: { ...orc.payload, telefoneCliente: clean },
    }).eq('id', orcId);
    setEditandoTelBling(prev => { const n = { ...prev }; delete n[orcId]; return n; });
    fetchClientes();
    showToast('✅ Telefone salvo com sucesso!');
  }

  // ── Fetch clientes com compras aprovadas + posv_acoes do Supabase ──
  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orcamentos_salvos')
        .select('id, slug, cliente, consultor, criado_em, aprovado_em, payload, origem_lead, bling_pedido_id, bling_status_pedido, data_entrega, bling_status_verificado_em, bling_origem')
        .eq('payload->>status', 'Aprovado')
        .order('aprovado_em', { ascending: false });

      if (error) throw error;
      setClientes(data || []);

      // Carregar posv_acoes do Supabase para todos os orçamentos
      const ids = (data || []).map(o => o.id);
      if (ids.length) {
        const { data: acoes } = await supabase
          .from('posv_acoes')
          .select('id, orcamento_id, estrategia_id, executado_em, prevista_em')
          .in('orcamento_id', ids);

        const map = {};
        for (const row of (acoes || [])) {
          map[`${row.orcamento_id}_${row.estrategia_id}`] = {
            id: row.id,
            executado_em: row.executado_em,
            prevista_em: row.prevista_em,
          };
        }

        // Merge com localStorage para orçamentos anteriores à migration
        // (garante que ações já marcadas não desapareçam)
        try {
          const local = JSON.parse(localStorage.getItem('posv_acoes') || '{}');
          for (const [key, executado_em] of Object.entries(local)) {
            if (!map[key]) {
              map[key] = { id: null, executado_em, prevista_em: null };
            }
          }
        } catch (_) {}

        setAcoesData(map);
      }
    } catch (err) {
      console.error('Erro ao buscar clientes pós-venda:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Sincronizar status de entrega com Bling ──
  const syncBlingStatus = useCallback(async (orcamentoId) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-bling-status`;
      const body = orcamentoId ? JSON.stringify({ orcamento_id: orcamentoId }) : '{}';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body,
      });
      const result = await res.json();
      if (result.ok) {
        const msg = orcamentoId
          ? result.entregues > 0 ? '✅ Entrega confirmada!' : '⏳ Pedido ainda não entregue'
          : `✅ ${result.verificados} verificado(s) · ${result.entregues} entregue(s)`;
        setSyncResult(msg);
        showToast(msg);
        await fetchClientes();
      } else {
        setSyncResult(`❌ Erro: ${result.error}`);
        showToast(`❌ Erro: ${result.error}`);
      }
    } catch (e) {
      setSyncResult(`❌ ${e.message}`);
      showToast(`❌ ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }, [fetchClientes]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  // ── Substituir variáveis no template ──
  function processarTemplate(template, cliente, equipamentoOverride = null) {
    const produtos = (cliente.payload?.itens || []).map(i => i.nome).join(', ');
    const detectados = equipamentoOverride ? [equipamentoOverride] : detectarEquipamentos(cliente.payload?.itens || []);

    function resolverLink(linkKeyFn, fallback) {
      if (detectados.length === 1) {
        return configLinks[linkKeyFn(detectados[0])] || fallback;
      } else if (detectados.length > 1) {
        const lista = detectados
          .filter(e => configLinks[linkKeyFn(e)])
          .map(e => `${e.icon} ${e.label}: ${configLinks[linkKeyFn(e)]}`);
        return lista.length > 0 ? lista.join('\n') : fallback;
      }
      return fallback;
    }

    const linkMontagem  = resolverLink(e => e.linkKey,           '[link de montagem]');
    const linkVideos    = resolverLink(e => e.linkVideosKey,     '[link de vídeos]');
    const linkManutencao= resolverLink(e => e.linkManutencaoKey, '[link de manutenção]');

    return template
      .replace(/\{nome\}/g, cliente.cliente || 'Cliente')
      .replace(/\{consultor\}/g, cliente.consultor || 'Equipe Brave')
      .replace(/\{produto\}/g, produtos || 'seus equipamentos')
      .replace(/\{link_montagem\}/g, linkMontagem)
      .replace(/\{link_videos\}/g, linkVideos)
      .replace(/\{link_manutencao\}/g, linkManutencao)
      .replace(/\{link_google\}/g, configLinks.link_google || '[link do Google]');
  }

  // ── Lógica de dispatch: detecta ou abre seletor ──
  // Estratégias que dependem de equipamento específico
  const ESTRATEGIAS_POR_EQUIPAMENTO = ['montagem'];

  function resolverEquipamentoEExecutar(cliente, estrategia, modo) {
    if (!ESTRATEGIAS_POR_EQUIPAMENTO.includes(estrategia.id)) {
      // Não depende de equipamento: executa direto
      modo === 'whatsapp'
        ? _dispararWhatsApp(cliente, estrategia, null)
        : _copiarMensagem(cliente, estrategia, null);
      return;
    }

    const itens = cliente.payload?.itens || [];
    const detectados = detectarEquipamentos(itens);

    if (detectados.length === 1) {
      modo === 'whatsapp'
        ? _dispararWhatsApp(cliente, estrategia, detectados[0])
        : _copiarMensagem(cliente, estrategia, detectados[0]);
    } else {
      // 0 ou múltiplos: abre seletor manual
      setModalEquipamento({ cliente, estrategia, modo });
    }
  }

  function _dispararWhatsApp(cliente, estrategia, equipamento) {
    const templateSalvo = localStorage.getItem(`posv_template_${estrategia.id}`) || estrategia.templatePadrao;
    const msg = processarTemplate(templateSalvo, cliente, equipamento);
    const tel = cliente.payload?.telefoneCliente;
    const link = whatsappLink(tel, msg);
    window.open(link, '_blank');
    marcarEnviado(cliente.id, estrategia.id);
    showToast(`✓ WhatsApp aberto para ${cliente.cliente}`);
  }

  function _copiarMensagem(cliente, estrategia, equipamento) {
    const templateSalvo = localStorage.getItem(`posv_template_${estrategia.id}`) || estrategia.templatePadrao;
    const msg = processarTemplate(templateSalvo, cliente, equipamento);
    navigator.clipboard.writeText(msg).then(() => {
      marcarEnviado(cliente.id, estrategia.id);
      showToast('✓ Mensagem copiada para a área de transferência');
    });
  }

  function handleDispararWhatsApp(cliente, estrategia) {
    resolverEquipamentoEExecutar(cliente, estrategia, 'whatsapp');
  }

  function handleCopiarMensagem(cliente, estrategia) {
    resolverEquipamentoEExecutar(cliente, estrategia, 'copiar');
  }

  // ── Métricas ──
  const metricas = useMemo(() => {
    const total = clientes.length;
    let totalAcoes = 0;
    let acoesPendentes = 0;

    clientes.forEach(c => {
      const dias = diasDesde(c.aprovado_em || c.criado_em);
      ESTRATEGIAS.forEach(e => {
        if (e.diasAposCompra !== null && dias >= e.diasAposCompra) {
          if (isEnviado(c.id, e.id)) totalAcoes++;
          else acoesPendentes++;
        }
      });
    });

    return { total, totalAcoes, acoesPendentes };
  }, [clientes, acoesData]);

  // ── Filtro de clientes ──
  const clientesFiltrados = useMemo(() => {
    let lista = clientes;
    if (busca.trim()) {
      const b = busca.toLowerCase();
      lista = lista.filter(c =>
        c.cliente?.toLowerCase().includes(b) ||
        c.consultor?.toLowerCase().includes(b) ||
        c.payload?.telefoneCliente?.includes(b)
      );
    }
    if (filtroAcao !== 'todos') {
      lista = lista.filter(c => {
        const dias = diasDesde(c.aprovado_em || c.criado_em);
        const e = ESTRATEGIAS.find(s => s.id === filtroAcao);
        if (!e || e.diasAposCompra === null) return true;
        return dias >= e.diasAposCompra;
      });
    }
    return lista;
  }, [clientes, busca, filtroAcao]);

  // ── Próximas ações (próximos 7 dias) ──
  const proximasAcoes = useMemo(() => {
    const acoes = [];
    clientes.forEach((c) => {
      const dias = diasDesde(c.aprovado_em || c.criado_em);
      if (dias === null) return;
      ESTRATEGIAS.forEach(e => {
        // Ações baseadas em dias pós-compra
        if (e.diasAposCompra !== null) {
          const diasRestantes = e.diasAposCompra - dias;
          if (diasRestantes >= 0 && diasRestantes <= 7 && !isEnviado(c.id, e.id)) {
            acoes.push({ cliente: c, estrategia: e, diasRestantes });
          }
        }
        // Ações baseadas em entrega (avaliacao, nps) — aparecem quando entregue e não enviadas
        if (e.diasAposCompra === null && (e.id === 'avaliacao' || e.id === 'nps')) {
          if (c.data_entrega && !isEnviado(c.id, e.id)) {
            const diasDesdeEntrega = diasDesde(c.data_entrega);
            // NPS: mostrar na agenda após 7 dias da entrega
            if (e.id === 'nps' && diasDesdeEntrega !== null && diasDesdeEntrega >= 7 && diasDesdeEntrega <= 14) {
              acoes.push({ cliente: c, estrategia: e, diasRestantes: 0, motivo: 'Entrega confirmada' });
            }
            // Avaliação: mostrar imediatamente após entrega
            if (e.id === 'avaliacao' && diasDesdeEntrega !== null && diasDesdeEntrega <= 10) {
              acoes.push({ cliente: c, estrategia: e, diasRestantes: 0, motivo: 'Entrega confirmada' });
            }
          }
        }
      });
    });
    return acoes.sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 15);
  }, [clientes, acoesData]);

  const SECTIONS = [
    { id: 'clientes',    label: 'Clientes',   icon: Users },
    { id: 'agenda',      label: 'Agenda',      icon: Bell },
    { id: 'estrategias', label: 'Estratégias', icon: Zap },
    { id: 'config',      label: 'Links',       icon: Settings },
  ];

  return (
    <div className="space-y-6 max-w-6xl pb-12">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-in-right">
          <div className="flex items-center gap-3 bg-dark-700 px-5 py-3 rounded-xl shadow-lg border border-neon/30">
            <CheckCircle2 className="w-4 h-4 text-neon" />
            <span className="text-sm font-medium text-white">{toast}</span>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalTemplate && (
        <ModalTemplate
          estrategia={modalTemplate}
          onClose={() => setModalTemplate(null)}
          configLinks={configLinks}
        />
      )}
      {modalConfig && <ModalConfig onClose={() => setModalConfig(false)} />}
      {modalEquipamento && (
        <ModalSelecionarEquipamento
          cliente={modalEquipamento.cliente}
          estrategia={modalEquipamento.estrategia}
          onClose={() => setModalEquipamento(null)}
          onConfirm={(equipamento) => {
            setModalEquipamento(null);
            if (modalEquipamento.modo === 'whatsapp') {
              _dispararWhatsApp(modalEquipamento.cliente, modalEquipamento.estrategia, equipamento);
            } else {
              _copiarMensagem(modalEquipamento.cliente, modalEquipamento.estrategia, equipamento);
            }
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-400" />
            Pós-Venda & Fidelização
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Estratégias para manter clientes comprando sempre com a Brave</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalConfig(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-400 border border-dark-600 rounded-xl hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Links
          </button>
          <button
            onClick={() => syncBlingStatus()}
            disabled={syncing}
            title="Verificar status de entrega no Bling para todos os pedidos pendentes"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-400 border border-blue-500/30 bg-blue-500/10 rounded-xl hover:bg-blue-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
            {syncing ? 'Verificando...' : 'Sync Entregas'}
          </button>
          <button onClick={fetchClientes} className="p-2 rounded-xl bg-dark-800 border border-dark-700 text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Info Box ── */}
      <div className="bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-pink-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white mb-1">Objetivo & Como Usar</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Este painel mostra todos os clientes com compras aprovadas e sugere ações de relacionamento baseadas no tempo desde a compra.
              Para cada cliente, você pode abrir o WhatsApp com a mensagem já preenchida ou copiar o texto.
              <strong className="text-pink-400"> Configure os links</strong> antes de usar (botão acima) e <strong className="text-pink-400">edite os templates</strong> de mensagem na aba Estratégias.
              As ações marcadas como enviadas ficam registradas no seu navegador.
            </p>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Clientes Pós-Compra', value: metricas.total,          color: 'text-pink-400',    icon: Users,        bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
          { label: 'Ações Pendentes',     value: metricas.acoesPendentes,  color: 'text-amber-400',   icon: Bell,         bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
          { label: 'Ações Enviadas',      value: metricas.totalAcoes,      color: 'text-emerald-400', icon: CheckCircle2, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Estratégias Ativas',  value: ESTRATEGIAS.length,       color: 'text-neon',        icon: Zap,          bg: 'bg-neon/10',        border: 'border-neon/20' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-tight">{s.label}</p>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs de navegação ── */}
      <div className="flex bg-dark-800/60 border border-dark-700/50 rounded-xl p-1 gap-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSection === s.id
                ? 'bg-dark-700 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <s.icon className="w-3.5 h-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ SEÇÃO: CLIENTES ══════════════════════ */}
      {activeSection === 'clientes' && (
        <div className="space-y-4">

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, consultor ou telefone..."
                className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl pl-4 pr-4 py-2.5 focus:outline-none focus:border-pink-500/40 placeholder:text-dark-500"
              />
            </div>
            <select
              value={filtroAcao}
              onChange={e => setFiltroAcao(e.target.value)}
              className="bg-dark-800 border border-dark-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-pink-500/40 cursor-pointer"
            >
              <option value="todos">Todos os clientes</option>
              {ESTRATEGIAS.filter(e => e.diasAposCompra !== null).map(e => (
                <option key={e.id} value={e.id}>Com ação de {e.titulo}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="text-center py-20 bg-dark-800/30 rounded-2xl border border-dark-700/30">
              <Heart className="w-10 h-10 text-dark-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Nenhum cliente com compra aprovada encontrado</p>
              <p className="text-xs text-dark-600 mt-1">Quando orçamentos forem aprovados, aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clientesFiltrados.map(c => {
                const dias = diasDesde(c.aprovado_em || c.criado_em);
                const tel = c.payload?.telefoneCliente;
                const produtos = (c.payload?.itens || []).map(i => i.nome).join(', ');
                const valor = (c.payload?.itens || []).reduce((acc, i) => acc + i.preco * i.quantidade, 0) + (c.payload?.frete || 0);
                const expanded = expandedId === c.id;

                // Estratégias pendentes para esse cliente
                const pendentes = ESTRATEGIAS.filter(e =>
                  e.diasAposCompra !== null &&
                  dias >= e.diasAposCompra &&
                  !isEnviado(c.id, e.id)
                );

                return (
                  <div key={c.id} className="bg-dark-800/50 border border-dark-700/40 rounded-2xl overflow-hidden">
                    {/* Linha do cliente */}
                    <div
                      className="p-5 flex items-center gap-4 cursor-pointer hover:bg-dark-700/20 transition-colors"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/30 to-purple-500/30 border border-pink-500/20 flex items-center justify-center text-sm font-black text-pink-400 shrink-0">
                        {(c.cliente || '?').charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{c.cliente}</p>
                          {pendentes.length > 0 && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-dark-950">
                              {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {/* Badge de entrega do Bling */}
                          {c.data_entrega ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                              <Truck className="w-2.5 h-2.5" /> Entregue {fmtData(c.data_entrega)}
                            </span>
                          ) : c.bling_pedido_id ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Truck className="w-2.5 h-2.5" /> #{c.bling_pedido_id}
                              {c.bling_status_pedido && ` · ${c.bling_status_pedido}`}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-zinc-500">{c.consultor}</span>
                          {tel
                            ? <span className="text-[10px] text-zinc-600">{fmtTel(tel)}</span>
                            : c.bling_origem && (
                              editandoTelBling[c.id] !== undefined ? (
                                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Ex: 11999999999"
                                    value={editandoTelBling[c.id]}
                                    onChange={e => setEditandoTelBling(prev => ({ ...prev, [c.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && salvarTelBling(c.id, editandoTelBling[c.id])}
                                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-300 w-36 outline-none"
                                  />
                                  <button onClick={e => { e.stopPropagation(); salvarTelBling(c.id, editandoTelBling[c.id]); }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer">Salvar</button>
                                  <button onClick={e => { e.stopPropagation(); setEditandoTelBling(prev => { const n={...prev}; delete n[c.id]; return n; }); }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 cursor-pointer">X</button>
                                </span>
                              ) : (
                                <button onClick={e => { e.stopPropagation(); setEditandoTelBling(prev => ({ ...prev, [c.id]: '' })); }}
                                  className="text-[10px] text-amber-500 hover:text-amber-400 underline cursor-pointer">
                                  + Adicionar telefone
                                </button>
                              )
                            )}
                          <span className="text-[10px] text-zinc-600">
                            Compra aprovada: {fmtData(c.aprovado_em || c.criado_em)}
                            {dias !== null && ` (há ${dias}d)`}
                          </span>
                          {c.bling_status_verificado_em && (
                            <span className="text-[10px] text-zinc-700">
                              Sync: {fmtData(c.bling_status_verificado_em)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neon/70 mt-0.5 truncate">{produtos}</p>
                      </div>

                      {/* Valor + expand */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-neon">{formatCurrency(valor)}</p>
                        <div className="flex justify-end mt-1">
                          {expanded
                            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
                            : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                        </div>
                      </div>
                    </div>

                    {/* Ações expandidas */}
                    {expanded && (
                      <div className="border-t border-dark-700/40 bg-dark-900/40 p-5 space-y-3">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-4">
                          Ações de Pós-Venda
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {ESTRATEGIAS.map(e => {
                            const cor = COR_MAP[e.cor];
                            const Icon = e.icon;
                            const enviado = isEnviado(c.id, e.id);
                            const dataE = dataEnvio(c.id, e.id);
                            const diasRestantes = e.diasAposCompra !== null ? e.diasAposCompra - dias : null;
                            // Ações baseadas em dias pós-compra
                            let disponivel = e.diasAposCompra === null || (dias !== null && dias >= e.diasAposCompra);
                            // Avaliação Google: só fica disponível após entrega confirmada pelo Bling
                            if (e.id === 'avaliacao') disponivel = !!c.data_entrega;
                            // NPS: disponível 7 dias após entrega
                            if (e.id === 'nps') {
                              const diasEntrega = c.data_entrega ? diasDesde(c.data_entrega) : null;
                              disponivel = diasEntrega !== null && diasEntrega >= 7;
                            }
                            // Motivo de bloqueio para mostrar ao usuário
                            const motivoBloqueio =
                              e.id === 'avaliacao' && !c.data_entrega ? 'Aguarda entrega confirmada' :
                              e.id === 'nps' && !c.data_entrega ? 'Aguarda entrega confirmada' :
                              e.id === 'nps' && c.data_entrega && diasDesde(c.data_entrega) < 7 ? `Disponível em ${7 - diasDesde(c.data_entrega)}d` :
                              null;

                            return (
                              <div key={e.id} className={`rounded-xl border p-3 ${enviado ? 'bg-emerald-500/5 border-emerald-500/20' : cor.bg + ' ' + cor.border}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon className={`w-3.5 h-3.5 ${enviado ? 'text-emerald-400' : cor.icon}`} />
                                  <span className={`text-xs font-bold ${enviado ? 'text-emerald-300' : cor.text}`}>
                                    {e.titulo}
                                  </span>
                                  {enviado && (
                                    <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-0.5">
                                      <Check className="w-3 h-3" />
                                      Enviado
                                    </span>
                                  )}
                                  {!enviado && e.diasAposCompra !== null && diasRestantes > 0 && (
                                    <span className="ml-auto text-[10px] text-zinc-500">
                                      Em {diasRestantes}d
                                    </span>
                                  )}
                                  {!enviado && disponivel && e.diasAposCompra !== null && (
                                    <span className="ml-auto text-[10px] font-bold text-amber-400">Agora!</span>
                                  )}
                                </div>

                                {dataE && (
                                  <p className="text-[10px] text-zinc-600 mb-2">Enviado em {fmtData(dataE)}</p>
                                )}
                                {motivoBloqueio && !enviado && (
                                  <p className="text-[10px] text-amber-400/80 mb-2 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" /> {motivoBloqueio}
                                  </p>
                                )}

                                {/* Botões */}
                                {tel ? (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleDispararWhatsApp(c, e)}
                                      disabled={!disponivel && !enviado}
                                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                        enviado
                                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                          : disponivel
                                            ? 'bg-neon text-dark-950 hover:bg-neon/90'
                                            : 'bg-dark-700 text-zinc-500'
                                      }`}
                                    >
                                      <Phone className="w-3 h-3" />
                                      {enviado ? 'Reenviar' : 'WhatsApp'}
                                    </button>
                                    <button
                                      onClick={() => handleCopiarMensagem(c, e)}
                                      className="p-1.5 rounded-lg bg-dark-700 text-zinc-400 hover:text-white hover:bg-dark-600 transition-colors cursor-pointer"
                                      title="Copiar mensagem"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-zinc-600 italic">Sem telefone cadastrado</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ SEÇÃO: AGENDA ══════════════════════ */}
      {activeSection === 'agenda' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white">Agenda — Próximas Ações</h2>
              <p className="text-xs text-zinc-500">Ações que devem ser realizadas nos próximos 7 dias</p>
            </div>
          </div>

          {proximasAcoes.length === 0 ? (
            <div className="text-center py-16 bg-dark-800/30 rounded-2xl border border-dark-700/30">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Nenhuma ação programada para os próximos 7 dias</p>
              <p className="text-xs text-dark-600 mt-1">Você está em dia com o pós-venda! 🎉</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proximasAcoes.map((item, idx) => {
                const { cliente: c, estrategia: e, diasRestantes } = item;
                const cor = COR_MAP[e.cor];
                const Icon = e.icon;
                const tel = c.payload?.telefoneCliente;

                return (
                  <div key={idx} className={`flex items-center gap-4 p-4 ${cor.bg} border ${cor.border} rounded-xl`}>
                    <div className={`w-10 h-10 rounded-xl ${cor.bg} border ${cor.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${cor.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cor.badge}`}>
                          {diasRestantes === 0 ? 'HOJE' : `Em ${diasRestantes}d`}
                        </span>
                        <p className="text-sm font-bold text-white truncate">{c.cliente}</p>
                      </div>
                      <p className={`text-xs font-semibold ${cor.text} mt-0.5`}>{e.titulo}</p>
                      {tel && <p className="text-[10px] text-zinc-500">{fmtTel(tel)}</p>}
                    </div>
                    {tel && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleDispararWhatsApp(c, e)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold bg-neon text-dark-950 rounded-lg hover:bg-neon/90 transition-colors cursor-pointer"
                        >
                          <Phone className="w-3 h-3" />
                          WhatsApp
                        </button>
                        <button
                          onClick={() => handleCopiarMensagem(c, e)}
                          className="p-1.5 rounded-lg bg-dark-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ SEÇÃO: ESTRATÉGIAS ══════════════════════ */}
      {activeSection === 'estrategias' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">Estratégias de Fidelização</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Configure os templates de mensagem para cada estratégia</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ESTRATEGIAS.map(e => {
              const cor = COR_MAP[e.cor];
              const Icon = e.icon;
              const temTemplate = !!localStorage.getItem(`posv_template_${e.id}`);

              return (
                <div key={e.id} className={`${cor.bg} border ${cor.border} rounded-2xl p-5 space-y-4`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl ${cor.bg} border ${cor.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${cor.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm font-bold ${cor.text}`}>{e.titulo}</h3>
                        {temTemplate && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            Personalizado
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{e.subtitulo}</p>
                    </div>
                  </div>

                  <div className={`text-xs text-zinc-400 leading-relaxed bg-dark-900/40 border border-dark-700/40 rounded-xl px-4 py-3`}>
                    {e.descricao}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <Clock className="w-3 h-3" />
                    <span>{e.gatilho}</span>
                  </div>

                  <button
                    onClick={() => setModalTemplate(e)}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold ${cor.text} border ${cor.border} rounded-xl hover:bg-white/5 transition-colors cursor-pointer`}
                  >
                    <Edit3 className="w-3 h-3" />
                    Editar Template
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════ SEÇÃO: CONFIG ══════════════════════ */}
      {activeSection === 'config' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">Configuração de Links</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Links inseridos automaticamente nas mensagens via variáveis</p>
          </div>

          {(() => {
            const links = (() => {
              try { return JSON.parse(localStorage.getItem('posv_links') || '{}'); }
              catch { return {}; }
            })();

            const campos = [
              { id: 'link_montagem',   label: 'Guia de Montagem',   icon: Package, desc: 'PDF ou página com instruções de montagem dos equipamentos', variavel: '{link_montagem}' },
              { id: 'link_videos',     label: 'Vídeos de Uso',      icon: ExternalLink, desc: 'Canal YouTube ou playlist com vídeos de uso e exercícios', variavel: '{link_videos}' },
              { id: 'link_manutencao', label: 'Manutenção',         icon: Settings, desc: 'Guia de manutenção preventiva dos equipamentos', variavel: '{link_manutencao}' },
              { id: 'link_google',     label: 'Google Reviews',     icon: Star, desc: 'Link direto para sua página de avaliações no Google Minha Empresa', variavel: '{link_google}' },
            ];

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {campos.map(c => {
                  const Icon = c.icon;
                  const configurado = !!links[c.id];
                  return (
                    <div key={c.id} className={`rounded-2xl border p-5 space-y-3 ${configurado ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-dark-800/60 border-dark-700/50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${configurado ? 'bg-emerald-500/10' : 'bg-dark-700'}`}>
                          <Icon className={`w-4 h-4 ${configurado ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{c.label}</p>
                          <code className="text-[10px] text-neon/70 font-mono">{c.variavel}</code>
                        </div>
                        {configurado && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
                      </div>
                      <p className="text-xs text-zinc-500">{c.desc}</p>
                      {links[c.id] ? (
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-neon/70 truncate font-mono flex-1">{links[c.id]}</p>
                          <a href={links[c.id]} target="_blank" rel="noopener noreferrer" className="p-1 text-zinc-500 hover:text-white">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-600 italic">Não configurado</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <button
            onClick={() => setModalConfig(true)}
            className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-dark-950 bg-neon hover:bg-neon/90 rounded-xl transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Editar Links
          </button>
        </div>
      )}

    </div>
  );
}
