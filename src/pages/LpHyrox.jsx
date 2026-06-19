import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, MessageCircle, Mail, Loader2, Trophy, TrendingUp, Shield } from 'lucide-react';

const fmtBRL = (v) => Number(v) > 0
  ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : null;

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
const IconYoutube = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
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

const ESTACOES = [
  { num: 1, nome: 'SkiErg',              dist: '1.000m',    brave: true  },
  { num: 2, nome: 'Sled Push',           dist: '50m',       brave: true  },
  { num: 3, nome: 'Sled Pull',           dist: '50m',       brave: true  },
  { num: 4, nome: 'Burpee Broad Jump',   dist: '80m',       brave: false },
  { num: 5, nome: 'Rowing',              dist: '1.000m',    brave: true  },
  { num: 6, nome: "Farmer's Carry",      dist: '200m',      brave: true  },
  { num: 7, nome: 'Sandbag Lunges',      dist: '100m',      brave: true  },
  { num: 8, nome: 'Wall Balls',          dist: '75/100 reps', brave: true },
];

const DEFAULT_CONFIG = {
  wa_number:    '554199999999',
  wa_msg_geral: 'Olá! Vi a linha HYROX da Brave e quero saber como montar o circuito no meu box.',
  hero: {
    badge:      'Equipamentos Oficiais HYROX · Brave Fitness',
    headline_1: 'Torne seu Box',
    headline_2: 'Referência HYROX',
    desc:       'O HYROX é o esporte de fitness de crescimento mais rápido do mundo. Tenha os equipamentos no padrão das competições oficiais e seja pioneiro na sua cidade.',
  },
  produtos: [
    {
      nome: 'Air Ski Brave',
      badge: 'Estação 1 · HYROX', badgeCls: 'bg-blue-600 text-white',
      tagline: '1.000m que definem a corrida.',
      emoji: '⛷️', alias: 'skierg', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Corda interna estendida — não estoura fácil',
        'Tensão calibrada padrão competição',
        'Painel com sensor p1, metragem confiável',
        'Plataforma inclusa',
        'Pronta entrega',
      ],
    },
    {
      nome: 'Remo Indoor Brave',
      badge: 'Estação 5 · HYROX', badgeCls: 'bg-blue-600 text-white',
      tagline: 'O remo que os atletas de elite escolhem.',
      emoji: '🚣', alias: 'remo', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Puxador anatômico no padrão C2',
        'Painel exclusivo com métricas confiáveis',
        'Rolamentos em tecnil de alta durabilidade',
        '+300 unidades vendidas',
      ],
    },
    {
      nome: 'Sled Brave',
      badge: 'Estações 2 e 3 · HYROX', badgeCls: 'bg-orange-500 text-white',
      tagline: 'Push e Pull. Força total no circuito.',
      emoji: '🛷', alias: 'sled', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Sled para empurrar e puxar (2 estações)',
        'Estrutura em aço reforçado',
        'Adaptável ao Turf',
        'Compatível com pesos adicionais',
        'Pronta entrega',
      ],
    },
    {
      nome: 'Wall Ball Brave',
      badge: 'Estação 8 · HYROX', badgeCls: 'bg-neon text-dark-950',
      tagline: '75 ou 100 reps. Brave aguenta tudo.',
      emoji: '🏐', alias: '', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Couro externo de alta durabilidade',
        'Peso interno uniforme e sem deslocamento',
        'Disponível em 6kg, 9kg e 10kg',
        'Costura reforçada para impacto repetido',
        'Pronta entrega',
      ],
    },
    {
      nome: 'Sandbag Brave',
      badge: 'Estação 7 · HYROX', badgeCls: 'bg-blue-600 text-white',
      tagline: '100 metros de lunges. Sem desculpas.',
      emoji: '🎒', alias: '', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Alças reforçadas para posição ativa',
        'Material resistente à abrasão',
        'Disponível em vários pesos',
        'Enchimento uniforme',
        'Pronta entrega',
      ],
    },
    {
      nome: 'Kettlebell Brave',
      badge: "Estação 6 · HYROX", badgeCls: 'bg-blue-600 text-white',
      tagline: "Farmer's Carry: 200m de determinação.",
      emoji: '🏋️', alias: '', img_url: '',
      preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
      features: [
        'Ferro fundido de alta qualidade',
        'Handle ergonômico para carregamento ativo',
        'Disponível do 8kg ao 32kg',
        'Pintura em pó resistente',
      ],
    },
  ],
};

const PILARES = [
  { Icon: Trophy,     titulo: 'Padrão Competição',        desc: 'Equipamentos no padrão das provas HYROX oficiais ao redor do mundo. Mesmos materiais usados nas competições certificadas.' },
  { Icon: TrendingUp, titulo: '+1 Milhão de Atletas',     desc: 'O HYROX é o esporte de fitness de crescimento mais rápido do mundo. Seja o pioneiro na sua cidade antes da concorrência.' },
  { Icon: Shield,     titulo: 'Consultoria Brave',        desc: 'Nossa equipe apoia a implementação da modalidade: montagem do circuito, materiais de divulgação e treinamento dos coaches.' },
];

export default function LpHyrox() {
  const [cfg, setCfg]         = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('landing_pages_config').select('*').eq('id', 'hyrox-oficial').maybeSingle()
      .then(({ data }) => {
        if (data) setCfg({
          wa_number:    data.wa_number    || DEFAULT_CONFIG.wa_number,
          wa_msg_geral: data.config?.wa_msg_geral || DEFAULT_CONFIG.wa_msg_geral,
          hero:         { ...DEFAULT_CONFIG.hero, ...(data.config?.hero || {}) },
          produtos:     data.config?.produtos?.length
            ? data.config.produtos.map((p, i) => ({ ...(DEFAULT_CONFIG.produtos[i] || {}), ...p }))
            : DEFAULT_CONFIG.produtos,
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
        <div className="max-w-6xl mx-auto px-5 py-4">
          <img src="/logo-lp.png" alt="Brave Fitness" className="h-10 object-contain" />
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="py-12 md:py-20 px-5 border-b border-dark-700">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 text-neon text-[11px] font-bold tracking-[0.2em] uppercase border border-neon/30 bg-neon/5 px-4 py-1.5 rounded-full mb-6 md:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-neon inline-block" />
            {cfg.hero.badge}
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black leading-none tracking-tight mb-6 md:mb-8 uppercase">
            {cfg.hero.headline_1}<br />
            <span className="text-neon">{cfg.hero.headline_2}</span>
          </h1>

          <p className="text-zinc-400 text-base md:text-lg max-w-xl leading-relaxed mb-8 md:mb-10">
            {cfg.hero.desc}
          </p>

          <div className="mt-10 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* ── 8 ESTAÇÕES ──────────────────────────────────────── */}
      <section className="py-10 md:py-14 px-5 border-b border-dark-700 bg-dark-900/40">
        <div className="max-w-5xl mx-auto">
          <p className="text-zinc-600 text-[11px] font-black tracking-[0.2em] uppercase mb-6 text-center">
            As 8 Estações do Circuito HYROX · + 1km de corrida entre cada estação
          </p>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
            {ESTACOES.map((e) => (
              <div
                key={e.num}
                className={`rounded-2xl p-3 flex flex-col items-center text-center transition-all ${
                  e.brave
                    ? 'bg-neon/10 border border-neon/30'
                    : 'bg-dark-800 border border-dark-700 opacity-50'
                }`}
              >
                <span className={`text-[10px] font-black mb-1 ${e.brave ? 'text-neon' : 'text-zinc-600'}`}>
                  #{e.num}
                </span>
                <p className={`text-[10px] font-bold leading-tight mb-1.5 ${e.brave ? 'text-white' : 'text-zinc-600'}`}>
                  {e.nome}
                </p>
                <span className={`text-[9px] ${e.brave ? 'text-zinc-400' : 'text-zinc-700'}`}>
                  {e.dist}
                </span>
                {e.brave && (
                  <div className="mt-1.5 w-4 h-4 rounded-full bg-neon/20 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-neon" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-zinc-700 text-xs mt-4">
            ✅ = Equipamento Brave disponível · #4 Burpee Broad Jump não requer equipamento
          </p>
        </div>
      </section>

      {/* ── PRODUTOS ────────────────────────────────────────── */}
      <section className="py-12 md:py-20 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 md:mb-12">
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight">
              8 Estações. <span className="text-neon">1 Fornecedor.</span>
            </h2>
            <p className="text-zinc-500 mt-3 text-sm md:text-base">
              Brave cobre 7 das 8 estações oficiais do HYROX. Entrega, suporte e qualidade garantida.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {cfg.produtos.map((produto, i) => (
              <div key={i} className="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden flex flex-col hover:border-neon/30 transition-all group">
                <div className="relative h-56 md:h-64 bg-dark-900 overflow-hidden flex items-center justify-center">
                  <span className={`absolute top-3 left-3 z-10 text-[11px] font-black px-3 py-1 rounded-full ${produto.badgeCls || 'bg-blue-600 text-white'}`}>
                    {produto.badge}
                  </span>
                  {produto.img_url ? (
                    <img src={convertImgUrl(produto.img_url)} alt={produto.nome}
                      className="w-full h-full object-contain p-3" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <span className="text-6xl opacity-20">{produto.emoji}</span>
                      <span className="text-[10px] text-zinc-600 font-medium tracking-widest uppercase">Foto em breve</span>
                    </div>
                  )}
                </div>
                <div className="p-5 md:p-6 flex flex-col flex-1">
                  <h3 className="font-black text-xl text-white mb-1">{produto.nome}</h3>
                  <p className="text-neon text-sm font-semibold mb-4">{produto.tagline}</p>
                  <ul className="space-y-2 mb-5">
                    {(produto.features || []).map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-zinc-400">
                        <Check className="w-4 h-4 text-neon mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* ── PREÇOS ── */}
                  {(fmtBRL(produto.preco_normal) || fmtBRL(produto.preco_avista) || produto.parcelas_num > 0) && (
                    <div className="mt-auto pt-4 border-t border-dark-700">
                      {fmtBRL(produto.preco_normal) && (
                        <p className="text-zinc-600 text-xs mb-2">
                          De <span className="line-through">{fmtBRL(produto.preco_normal)}</span>
                        </p>
                      )}
                      {fmtBRL(produto.preco_avista) && (
                        <div className="flex items-end gap-2 flex-wrap">
                          <span className="text-neon text-3xl font-black leading-none tracking-tight">
                            {fmtBRL(produto.preco_avista)}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest bg-neon text-dark-950 px-2 py-0.5 rounded-full mb-0.5">
                            À vista
                          </span>
                        </div>
                      )}
                      {produto.parcelas_num > 0 && fmtBRL(produto.parcelas_valor) && (
                        <>
                          <div className="border-t border-dark-700/60 my-3" />
                          <p className="text-zinc-400 text-sm">
                            ou <span className="text-white font-black">{produto.parcelas_num}x</span> de{' '}
                            <span className="text-neon font-black">{fmtBRL(produto.parcelas_valor)}</span>
                          </p>
                          <p className="text-zinc-600 text-[11px] mt-0.5">no cartão de crédito</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────── */}
      <section className="py-14 md:py-24 px-5 border-t border-dark-700 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-neon/4 blur-[100px]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black uppercase text-white leading-tight mb-3">
            Seu Box pronto<br />
            <span className="text-neon">para o HYROX.</span>
          </h2>
          <p className="text-zinc-500 text-base md:text-lg mb-8 md:mb-10">
            Um especialista BRAVE monta seu circuito completo. Fale agora pelo WhatsApp.
          </p>
          <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-neon hover:bg-neon-dim text-dark-950 font-black text-base md:text-xl px-8 md:px-10 py-4 md:py-5 rounded-full transition-colors shadow-2xl shadow-neon/20 animate-pulse-neon">
            <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
            Montar Meu Circuito HYROX
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
              <a href="mailto:comercial@bravefitness.com.br"
                className="text-zinc-600 text-sm hover:text-zinc-400 flex items-center gap-1.5 mt-1 transition-colors">
                <Mail className="w-3.5 h-3.5" />
                comercial@bravefitness.com.br
              </a>
            </div>
            <div className="flex items-center gap-3">
              {[
                { href: 'https://instagram.com/bravefitness', Icon: IconInstagram },
                { href: 'https://facebook.com/bravefitness',  Icon: IconFacebook },
                { href: 'https://youtube.com/@bravefitness',  Icon: IconYoutube },
                { href: wa(cfg.wa_msg_geral),                  Icon: MessageCircle },
              ].map(({ href, Icon }, i) => (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full border border-dark-600 flex items-center justify-center text-zinc-600 hover:text-neon hover:border-neon/30 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-dark-700 text-center md:text-left">
            <p className="text-zinc-700 text-sm">© 2025 Brave Fitness. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
