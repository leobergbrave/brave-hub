import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, MessageCircle, Mail, Loader2, Trophy, Package, Shield, Zap, DollarSign, Truck } from 'lucide-react';

const IconInstagram = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const IconFacebook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

function convertImgUrl(url) {
  if (!url) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
  return url;
}

const PILARES = [
  { Icon: Zap,        titulo: 'Fundição Própria',    desc: 'Produzimos nossas próprias fundições. Kettlebells e dumbbells com o melhor custo-benefício do mercado.' },
  { Icon: Package,    titulo: 'Linha Completa',      desc: 'Do rig às anilhas de competição: um único fornecedor para equipar todo o seu box de CrossFit.' },
  { Icon: Shield,     titulo: 'Projetos Sob Medida', desc: 'Racks e rigs desenvolvidos e projetados para o seu espaço, otimizando cada metro do seu box.' },
  { Icon: Trophy,     titulo: 'Padrão Competição',   desc: 'Barras e anilhas em pleno acordo com a IWF — os mesmos materiais usados em provas certificadas.' },
];

const DEFAULT_CONFIG = {
  wa_number:    '5514981451119',
  wa_msg_geral: 'Olá! Quero montar meu box de CrossFit com a Brave. Pode me enviar uma cotação completa?',
  hero: {
    badge:      'Fabricante Oficial · Linha Completa',
    headline_1: 'Equipe seu Box',
    headline_2: 'de CrossFit',
    desc:       'Do rig às anilhas, do levantamento olímpico ao conditioning. A Brave é fabricante com fundição própria e entrega o seu box de CrossFit completo, com qualidade de competição e o melhor custo-benefício do mercado.',
  },
  categorias: [
    {
      nome: 'Barras Olímpicas', emoji: '🏋️', tagline: 'EVOBLACK & EVOCHROME · The new barbell',
      produtos: [
        { nome: 'Barra EvoBlack 8.0', emoji: '⬛', badge: 'Padrão IWF', badgeCls: 'bg-neon text-dark-950',
          desc: 'Tratamento Chrome Black e recartilho para LPO no CrossFit.',
          features: ['8 sistemas de rolamento agulha', 'Aço testado até 210.000 psi', '1 ano de garantia integral'],
          avista: 'A partir de R$ 999', prazo: '10x a partir de R$ 1.199', nota: 'Masculina 20kg · Feminina 15kg · Junior 10kg' },
        { nome: 'Barra EvoChrome 8.0', emoji: '⚪', badge: 'Upgrade', badgeCls: 'bg-blue-600 text-white',
          desc: 'Um upgrade de resistência e durabilidade para treinos intensos.',
          features: ['Rolamento agulha de alta performance', 'Tratamento exclusivo em Chrome', 'Dimensões em acordo com a IWF'],
          avista: 'A partir de R$ 999', prazo: '10x a partir de R$ 1.199', nota: 'Modelos 10 · 15 · 20 kg' },
      ],
    },
    {
      nome: 'Anilhas', emoji: '⭕', tagline: 'BUMPER · COMPETITION · HI-TEMP · FRACIONADAS',
      produtos: [
        { nome: 'Bumper Black 2.0', emoji: '⚫', badge: 'Mais vendida', badgeCls: 'bg-neon text-dark-950',
          desc: 'Quique reduzido e design com logo em alto relevo.',
          features: ['Dureza aferida com medidor', 'Alto nível de acabamento'],
          avista: 'A partir de R$ 135', prazo: '10x a partir de R$ 145', nota: 'Disponível de 5 a 25 kg' },
        { nome: 'Bumper Collor 2.0', emoji: '🔴', badge: 'Cores', badgeCls: 'bg-orange-500 text-white',
          desc: 'Diferencie seu box com cores vibrantes de impacto.',
          features: ['Borracha premium · centro em inox', 'Garantia de 2 anos contra quebra'],
          avista: 'A partir de R$ 219', prazo: '10x a partir de R$ 249', nota: 'Disponível de 5 a 25 kg' },
        { nome: 'Competition Oficial', emoji: '🏅', badge: 'Competição', badgeCls: 'bg-blue-600 text-white',
          desc: 'Performance elevada ao extremo, no pantone olímpico.',
          features: ['Em pleno acordo com a IWF', 'Shore Rate equilibrado (75-85)', 'Garantia de 3 anos'],
          avista: 'A partir de R$ 809,60', prazo: '10x a partir de R$ 920', nota: 'Disponível de 10 a 25 kg' },
        { nome: 'Anilhas Hi-Temp Evolution', emoji: '⚫', badge: 'Custo-benefício', badgeCls: 'bg-purple-500 text-white',
          desc: 'Custo-benefício aliado à durabilidade.',
          features: ['Centro usinado em CNC revestido em zinco', 'Redução de ruído', '1 ano de garantia'],
          avista: 'A partir de R$ 130', prazo: '10x a partir de R$ 140', nota: 'Disponível de 5 a 20 kg' },
        { nome: 'Anilhas Fracionadas', emoji: '🟢', badge: 'Ajuste fino', badgeCls: 'bg-neon text-dark-950',
          desc: 'Injetadas e olímpicas para o ajuste fino da barra.',
          features: ['Alto nível de calibragem', 'Cores olímpicas'],
          avista: 'A partir de R$ 25', prazo: '10x a partir de R$ 30', nota: 'Modelos 1 · 2 · 2,5 kg' },
      ],
    },
    {
      nome: 'Fundições · Kettlebells & Dumbbells', emoji: '🔩', tagline: 'FUNDIÇÃO PRÓPRIA · O melhor custo-benefício',
      produtos: [
        { nome: 'Kettlebell Iron', emoji: '🔔', badge: 'Fundição própria', badgeCls: 'bg-neon text-dark-950',
          desc: 'Produto ecológico da nossa própria fundição.',
          features: ['Produzido a partir de ferro de sucata', 'Fundição própria à sua disposição'],
          avista: 'R$ 14 / kg', prazo: '10x R$ 16 / kg', nota: 'Disponível de 4 a 40 kg' },
        { nome: 'Kettlebell Evo Brave', emoji: '🔔', badge: 'Importado', badgeCls: 'bg-blue-600 text-white',
          desc: 'O mais alto nível em acabamento e ergonomia.',
          features: ['Produto importado', 'Corpo único em coldbox'],
          avista: 'R$ 27 / kg', prazo: '10x R$ 30 / kg', nota: 'Disponível de 6 a 32 kg' },
        { nome: 'Dumbbell Iron', emoji: '🏋️', badge: 'Fundição própria', badgeCls: 'bg-neon text-dark-950',
          desc: 'A ferramenta de treino mais fundamental do seu box.',
          features: ['Produto ecológico de fundição própria', 'Ótimo custo-benefício'],
          avista: 'R$ 14 / kg', prazo: '10x R$ 16 / kg', nota: 'Disponível de 1 a 32 kg' },
        { nome: 'Dumbbell Evo Vulcanizado', emoji: '🏋️', badge: 'Premium', badgeCls: 'bg-purple-500 text-white',
          desc: 'Resistência e design em corpo único revestido.',
          features: ['Importado · borracha virgem', 'Alto nível em acabamento e ergonomia'],
          avista: 'R$ 24 / kg', prazo: '10x R$ 26 / kg', nota: 'Disponível de 5 a 45 kg' },
      ],
    },
    {
      nome: 'Racks & Rigs', emoji: '🏗️', tagline: 'ESTRUTURAS PROJETADAS PARA O SEU ESPAÇO',
      produtos: [
        { nome: 'Squat Stand', emoji: '🟩', badge: 'Essencial', badgeCls: 'bg-neon text-dark-950',
          desc: 'O suporte que não pode faltar no seu espaço.',
          features: ['Estrutura robusta e estável', 'Base com apoio em madeira'],
          avista: 'R$ 1.750', prazo: '10x R$ 1.899' },
        { nome: 'Wall Racks', emoji: '🧱', badge: '5 tamanhos', badgeCls: 'bg-blue-600 text-white',
          desc: 'Estrutura fixada à parede, altura padrão de 2,75m.',
          features: ['Metalon 60x60 de 2,65mm', 'Pintura eletrostática epóxi', 'Pares de Jhooks para agachamento'],
          avista: 'A partir de R$ 1.799', nota: 'De 1,10m a 11,95m de comprimento' },
        { nome: 'Elite Racks', emoji: '🏗️', badge: 'Customizável', badgeCls: 'bg-orange-500 text-white',
          desc: 'Colunas de 3 a 4,5m com acessórios variados.',
          features: ['Braços para argolas e cordas', 'Maior distância da parede', 'Customize conforme a necessidade'],
          avista: 'A partir de R$ 2.990', nota: 'De 1,10m a 11,95m de comprimento' },
        { nome: 'Rigs Brave', emoji: '⛓️', badge: 'Sob medida', badgeCls: 'bg-purple-500 text-white',
          desc: 'Estruturas de competição, sem furar paredes.',
          features: ['Projeto minucioso resistente ao pêndulo', 'Metalon 60x60 de 2,65mm', 'Cotação personalizada'],
          avista: 'Valores sob consulta', avista_tag: '', nota: 'Projeto desenvolvido para o seu box' },
      ],
    },
    {
      nome: 'Organizadores', emoji: '📦', tagline: 'UM BOX ORGANIZADO GERA MAIS CREDIBILIDADE',
      produtos: [
        { nome: 'Estante para Halteres / KB', emoji: '🗄️', badge: 'Até 350kg', badgeCls: 'bg-neon text-dark-950',
          desc: 'Acomoda halteres, kettlebells e dumbbells com segurança.',
          features: ['Prateleiras com chapas de madeira', 'Evita ruídos e riscos ao guardar'],
          avista: 'R$ 2.100', prazo: '10x R$ 2.399' },
        { nome: 'Estante para Medicine Balls', emoji: '🗄️', badge: 'Até 20 un', badgeCls: 'bg-blue-600 text-white',
          desc: '4 prateleiras com travessa dupla para med balls.',
          features: ['Comporta até 20 unidades', 'Estrutura reforçada'],
          avista: 'R$ 1.799', prazo: '10x R$ 1.999' },
        { nome: 'Expositores de Anilhas', emoji: '📍', badge: 'Vertical / Torre', badgeCls: 'bg-orange-500 text-white',
          desc: 'Vertical Fixo e Torre T Fixo para as anilhas.',
          avista: 'A partir de R$ 549', nota: 'Vertical Fixo · Torre T Fixo' },
        { nome: 'Suportes de Barras', emoji: '📎', badge: 'Vários modelos', badgeCls: 'bg-purple-500 text-white',
          desc: 'Vertical, horizontal e fogueteiro (parede).',
          avista: 'A partir de R$ 169', nota: 'De 5 a 12 barras · Speed ropes / bands' },
      ],
    },
    {
      nome: 'Acessórios', emoji: '🎯', tagline: 'TUDO PARA DEIXAR SEU BOX AINDA MAIS COMPLETO',
      produtos: [
        { nome: 'Caixa de Salto (Jump Box)', emoji: '📦', badge: 'Oficial', badgeCls: 'bg-neon text-dark-950',
          desc: 'Madeira de compensado, medidas oficiais 75x60x50cm.',
          features: ['Versão oficial e iniciante', 'Custo-benefício e fácil transporte'],
          avista: 'R$ 429', prazo: '10x R$ 479', nota: 'Oficial e iniciante' },
        { nome: 'Argolas Olímpicas de Madeira', emoji: '⭕', badge: 'Par + fitas', badgeCls: 'bg-orange-500 text-white',
          desc: 'Superfície lisa e resistente ao peso de qualquer atleta.',
          features: ['Kit com par de fitas de 30mm (5m)', 'Alto nível de acabamento'],
          avista: 'R$ 349', prazo: '10x R$ 399' },
        { nome: 'Medicine Balls', emoji: '🏐', badge: '8 a 30 lb', badgeCls: 'bg-blue-600 text-white',
          desc: 'Couro sintético com enchimento de tecnologia expansiva.',
          features: ['Dimensão compacta ~36x36cm', 'Versões collor e infantil'],
          avista: 'R$ 349', prazo: '10x R$ 399', nota: 'Também produzimos por quilo' },
        { nome: 'Piso de Borracha', emoji: '⬛', badge: 'Alta absorção', badgeCls: 'bg-neon text-dark-950',
          desc: '100x100 · 15mm, com absorção máxima de impacto.',
          features: ['Alto nível de aglomerante', 'Acabamento fino e controle de qualidade'],
          avista: 'R$ 99,90', prazo: '10x R$ 105', nota: 'Preço por placa · outras cores/espessuras sob consulta' },
        { nome: 'Sled Push and Pull', emoji: '🛷', badge: '2 em 1', badgeCls: 'bg-orange-500 text-white',
          desc: 'Trenó para empurrar e puxar, base 34mm.',
          avista: 'R$ 1.249', prazo: '10x R$ 1.499' },
        { nome: 'Jerk Blocks', emoji: '🟫', badge: 'LPO', badgeCls: 'bg-purple-500 text-white',
          desc: 'Blocos de madeira para o levantamento olímpico.',
          avista: 'R$ 3.190', prazo: '10x R$ 3.490' },
        { nome: 'GHD Fixo', emoji: '🪑', badge: 'Competição', badgeCls: 'bg-blue-600 text-white',
          desc: 'Essencial para o treino de alta performance.',
          features: ['Presente até em competições', 'Também disponível na versão modular'],
          avista: 'R$ 2.499', prazo: '10x R$ 2.799' },
        { nome: 'Sacos de Treino', emoji: '🎒', badge: 'Functional', badgeCls: 'bg-orange-500 text-white',
          desc: 'Power Bag, Strong Bag e Bulgarian Bag (treino HYROX).',
          features: ['Vários pesos disponíveis', 'Resistentes e com ótimo custo-benefício'],
          avista: 'A partir de R$ 269', nota: 'Power · Strong · Bulgarian' },
        { nome: 'Cordas de Treino', emoji: '🪢', badge: 'Escalada / Naval', badgeCls: 'bg-neon text-dark-950',
          desc: 'Corda de sisal para escalada e corda naval.',
          avista: 'A partir de R$ 349', nota: 'Sisal 38mm · Naval 34mm' },
      ],
      rodape: 'E ainda: paralletes, pegboard, bancos (reto e inclinável), abmat, colchonetes, speed ropes, super bands, presilhas Lock Pro e mais.',
    },
  ],
};

export default function LpCrossfit() {
  const [cfg, setCfg]         = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('landing_pages_config').select('*').eq('id', 'crossfit-box').maybeSingle()
      .then(({ data }) => {
        if (data) setCfg({
          wa_number:    data.wa_number    || DEFAULT_CONFIG.wa_number,
          wa_msg_geral: data.config?.wa_msg_geral || DEFAULT_CONFIG.wa_msg_geral,
          hero:         { ...DEFAULT_CONFIG.hero, ...(data.config?.hero || {}) },
          categorias:   data.config?.categorias?.length ? data.config.categorias : DEFAULT_CONFIG.categorias,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const wa = (msg) => `https://wa.me/${cfg.wa_number}?text=${encodeURIComponent(msg)}`;

  if (loading) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-neon animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-950 text-white antialiased">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-dark-950/95 backdrop-blur-sm border-b border-neon/20">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <img src="/logo-lp.png" alt="Brave Fitness" className="h-9 md:h-10 object-contain" />
          <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 bg-neon hover:bg-neon-dim text-dark-950 font-bold text-xs px-4 py-2 rounded-full transition-colors">
            <MessageCircle className="w-4 h-4" />
            Montar meu box
          </a>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="py-12 md:py-20 px-5 border-b border-dark-700 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 right-0 w-[500px] h-[500px] rounded-full bg-neon/5 blur-[120px]" />
        </div>
        <div className="max-w-5xl mx-auto relative">
          <div className="inline-flex items-center gap-2 text-neon text-[11px] font-bold tracking-[0.2em] uppercase border border-neon/30 bg-neon/5 px-4 py-1.5 rounded-full mb-6 md:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
            {cfg.hero.badge}
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black leading-none tracking-tight mb-6 md:mb-8 uppercase">
            {cfg.hero.headline_1}<br />
            <span className="text-neon">{cfg.hero.headline_2}</span>
          </h1>

          <p className="text-zinc-400 text-base md:text-lg max-w-2xl leading-relaxed mb-8 md:mb-10">
            {cfg.hero.desc}
          </p>

          <div className="mt-10 md:mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PILARES.map(({ Icon, titulo, desc }, i) => (
              <div key={i} className="bg-dark-800 border border-dark-700 rounded-2xl p-6">
                <div className="w-9 h-9 rounded-lg bg-neon/10 border border-neon/20 flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-neon" />
                </div>
                <h3 className="font-black text-xs uppercase tracking-wider text-white mb-2">{titulo}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIAS ──────────────────────────────────────── */}
      {cfg.categorias.map((cat, ci) => (
        <section key={ci} className={`py-12 md:py-16 px-5 border-b border-dark-700 ${ci % 2 === 1 ? 'bg-dark-900/40' : ''}`}>
          <div className="max-w-6xl mx-auto">
            <div className="mb-8 md:mb-10 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{cat.emoji}</span>
                  <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight">{cat.nome}</h2>
                </div>
                {cat.tagline && (
                  <p className="text-neon text-[11px] md:text-xs font-bold tracking-[0.15em] uppercase">{cat.tagline}</p>
                )}
              </div>
              <span className="text-zinc-700 text-xs font-black">{String(ci + 1).padStart(2, '0')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {cat.produtos.map((p, pi) => (
                <div key={pi} className="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden flex flex-col hover:border-neon/30 transition-all">
                  <div className="relative h-44 md:h-48 bg-dark-900 overflow-hidden flex items-center justify-center">
                    {p.badge && (
                      <span className={`absolute top-3 left-3 z-10 text-[11px] font-black px-3 py-1 rounded-full ${p.badgeCls || 'bg-neon text-dark-950'}`}>
                        {p.badge}
                      </span>
                    )}
                    {p.img_url ? (
                      <img src={convertImgUrl(p.img_url)} alt={p.nome} className="w-full h-full object-contain p-3" />
                    ) : (
                      <span className="text-6xl opacity-20">{p.emoji || '🏋️'}</span>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-black text-lg text-white mb-1 leading-tight">{p.nome}</h3>
                    {p.desc && <p className="text-neon text-sm font-semibold mb-3 leading-snug">{p.desc}</p>}
                    {p.features?.length > 0 && (
                      <ul className="space-y-1.5 mb-4">
                        {p.features.map((f, fi) => (
                          <li key={fi} className="flex items-start gap-2 text-[13px] text-zinc-400">
                            <Check className="w-3.5 h-3.5 text-neon mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    {(p.avista || p.prazo || p.nota) && (
                      <div className="mt-auto pt-4 border-t border-dark-700">
                        {p.avista && (
                          <div className="flex items-end gap-2 flex-wrap">
                            <span className="text-neon text-2xl md:text-[26px] font-black leading-none tracking-tight">{p.avista}</span>
                            {p.avista_tag !== '' && (
                              <span className="text-[10px] font-black uppercase tracking-widest bg-neon text-dark-950 px-2 py-0.5 rounded-full mb-0.5">
                                {p.avista_tag || 'à vista'}
                              </span>
                            )}
                          </div>
                        )}
                        {p.prazo && (
                          <p className="text-zinc-400 text-sm mt-2">
                            ou <span className="text-white font-black">{p.prazo}</span> <span className="text-zinc-600">sem juros</span>
                          </p>
                        )}
                        {p.nota && <p className="text-zinc-600 text-[11px] mt-1.5">{p.nota}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {cat.rodape && (
              <p className="text-zinc-500 text-sm mt-6 border-l-2 border-neon/40 pl-4">{cat.rodape}</p>
            )}
          </div>
        </section>
      ))}

      {/* ── CONDIÇÕES / COMO COMPRAR ────────────────────────── */}
      <section className="py-12 md:py-16 px-5 border-b border-dark-700 bg-dark-900/40">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { Icon: DollarSign, titulo: 'Formas de Pagamento', desc: 'Parcele em até 10x sem juros no cartão ou aproveite o desconto no pagamento à vista.' },
            { Icon: Truck,      titulo: 'Entrega Própria',     desc: 'Temos empresa própria para o envio do material, garantindo qualidade e segurança na entrega.' },
            { Icon: Shield,     titulo: 'Consultoria Brave',   desc: 'Nossos consultores te acompanham da cotação à montagem do seu box completo.' },
          ].map(({ Icon, titulo, desc }, i) => (
            <div key={i} className="bg-dark-800 border border-dark-700 rounded-2xl p-6">
              <div className="w-9 h-9 rounded-lg bg-neon/10 border border-neon/20 flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-neon" />
              </div>
              <h3 className="font-black text-xs uppercase tracking-wider text-white mb-2">{titulo}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────── */}
      <section className="py-14 md:py-24 px-5 border-t border-dark-700 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-neon/5 blur-[100px]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black uppercase text-white leading-tight mb-3">
            Aproveite para ter<br />
            <span className="text-neon">a Brave no seu box.</span>
          </h2>
          <p className="text-zinc-500 text-base md:text-lg mb-8 md:mb-10">
            Um especialista BRAVE monta o orçamento completo do seu box de CrossFit. Fale agora pelo WhatsApp.
          </p>
          <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-neon hover:bg-neon-dim text-dark-950 font-black text-base md:text-xl px-8 md:px-10 py-4 md:py-5 rounded-full transition-colors shadow-2xl shadow-neon/20 animate-pulse-neon">
            <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
            Montar Meu Box Completo
          </a>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-dark-700 py-12 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div>
              <img src="/logo-lp.png" alt="Brave Fitness" className="h-8 object-contain mb-3" />
              <p className="text-zinc-600 text-sm">CNPJ: 33.167.844/0001-80</p>
              <a href="mailto:contato@bravefitness.com.br"
                className="text-zinc-600 text-sm hover:text-zinc-400 flex items-center gap-1.5 mt-1 transition-colors">
                <Mail className="w-3.5 h-3.5" />
                contato@bravefitness.com.br
              </a>
            </div>
            <div className="flex items-center gap-3">
              {[
                { href: 'https://instagram.com/bravefitnessbr', Icon: IconInstagram },
                { href: 'https://facebook.com/bravefitness',    Icon: IconFacebook },
                { href: wa(cfg.wa_msg_geral),                    Icon: MessageCircle },
              ].map(({ href, Icon }, i) => (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full border border-dark-600 flex items-center justify-center text-zinc-600 hover:text-neon hover:border-neon/30 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-dark-700 text-center md:text-left">
            <p className="text-zinc-700 text-sm">© 2026 Brave Fitness. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
