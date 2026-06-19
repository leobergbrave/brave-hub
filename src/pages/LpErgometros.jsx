import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, MessageCircle, Mail, Loader2, Zap, Bell, DollarSign, FileText } from 'lucide-react';

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

const DEFAULT_CONFIG = {
  wa_number:    '554199999999',
  wa_msg_geral: 'Olá! Vi os ergômetros da Brave e gostaria de solicitar uma cotação.',
  hero: {
    badge:      'Linha Ergômetros 2025',
    headline_1: 'Ergômetros Profissionais',
    headline_2: 'para o seu Box',
    desc:       'Equipamentos desenvolvidos para suportar os treinos mais intensos, projetados com tecnologia de ponta e o melhor custo-benefício do mercado.',
  },
  produtos: [
    { nome: 'Remo Indoor Brave',       badge: '+300 Vendidas',  badgeCls: 'bg-neon text-dark-950',    tagline: 'Força, resistência e resultados imediatos.',       emoji: '🚣', alias: 'remo',    img_url: '', features: ['Painel exclusivo com métricas confiáveis','Puxador anatômico no padrão C2','Partes em plástico resistentes','Rolamentos em tecnil'] },
    { nome: 'Esteira Curva Pro',        badge: 'Pronta Entrega', badgeCls: 'bg-orange-500 text-white', tagline: 'O que era bom ficou ainda melhor.',                 emoji: '🏃', alias: 'estcv',   img_url: '', features: ['Mais de 300 unidades vendidas','Projeto customizado sem alavanca de tensão','Durabilidade comprovada, mecânica resistente','Não faz uso de energia elétrica','Painel com todas as métricas de trabalho','Lotes semanais, consulte disponibilidade'] },
    { nome: 'Bike Erg Brave',           badge: 'Pronta Entrega', badgeCls: 'bg-orange-500 text-white', tagline: 'Performance e endurance no padrão Concept.',        emoji: '🚴', alias: 'bikeerg', img_url: '', features: ['Padrão similar ao Concept','Painel com sensor p1, trabalho em metragem confiável','Excelente para trabalho de endurance','Pronta entrega, condições exclusivas'] },
    { nome: 'Air Ski Brave',            badge: 'Lançamento',     badgeCls: 'bg-purple-500 text-white', tagline: 'Tensão calibrada, corda que não estoura.',         emoji: '⛷️', alias: 'skierg',  img_url: '', features: ['Puxador em borracha no padrão C2','Painel com sensor p1, trabalho em metragem confiável','Corda interna estendida — não estoura fácil','Tensão de puxada com calibragem Brave','Plataforma inclusa','Pronta entrega'] },
    { nome: 'Escada Ergométrica Brave', badge: 'Lançamento',     badgeCls: 'bg-purple-500 text-white', tagline: 'Lançamento exclusivo com frete grátis.',            emoji: '🪜', alias: 'escada',  img_url: '', features: ['Lançamento exclusivo promocional','Painel multifuncional resistente','Equipamento silencioso','Pronta entrega','Garantia que funciona — Padrão Brave','Frete grátis para algumas regiões'] },
  ],
};

const PILARES = [
  { Icon: Zap,        titulo: 'Inovação, Qualidade e Durabilidade', desc: 'Ergômetros desenvolvidos para suportar os treinos mais intensos, projetados com tecnologia de ponta.' },
  { Icon: Bell,       titulo: 'O Melhor Suporte do Mercado',        desc: 'Consultoria especializada para o seu espaço. Especialistas em Box de CrossFit, Studios e Academias.' },
  { Icon: DollarSign, titulo: 'Custo-Benefício',                    desc: 'O melhor custo-benefício do mercado, com preços diferenciados e condições especiais de pagamento.' },
];

export default function LpErgometros() {
  const [cfg, setCfg]         = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('landing_pages_config').select('*').eq('id', 'ergometros').maybeSingle()
      .then(({ data }) => {
        if (data) setCfg({
          wa_number:    data.wa_number    || DEFAULT_CONFIG.wa_number,
          wa_msg_geral: data.config?.wa_msg_geral || DEFAULT_CONFIG.wa_msg_geral,
          hero:         { ...DEFAULT_CONFIG.hero, ...(data.config?.hero || {}) },
          produtos:     data.config?.produtos?.length ? data.config.produtos : DEFAULT_CONFIG.produtos,
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
          <img src="/logo-lp.png" alt="Brave Fitness" className="h-10 object-contain" />
          <a
            href={wa(cfg.wa_msg_geral)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-neon hover:bg-neon-dim text-dark-950 font-black text-sm px-5 py-2.5 rounded-full transition-colors shadow-lg shadow-neon/20"
          >
            <FileText className="w-4 h-4" />
            Solicitar Cotação
          </a>
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

          <a
            href={wa(cfg.wa_msg_geral)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-neon hover:bg-neon-dim text-dark-950 font-black text-sm md:text-base px-7 py-3.5 md:px-8 md:py-4 rounded-full transition-colors shadow-xl shadow-neon/25"
          >
            <FileText className="w-4 h-4 md:w-5 md:h-5" />
            Solicitar Cotação
          </a>

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

      {/* ── PRODUTOS ────────────────────────────────────────── */}
      <section className="py-12 md:py-20 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 md:mb-12">
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight">
              Nossa Linha <span className="text-neon">Completa</span>
            </h2>
            <p className="text-zinc-500 mt-3 text-sm md:text-base">Clique em "Solicitar Cotação" para receber uma proposta personalizada.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {cfg.produtos.map((produto, i) => {
              const msgProduto = `Olá! Tenho interesse no ${produto.nome} da Brave. Pode me enviar uma cotação?`;
              return (
                <div key={i} className="bg-dark-800 border border-dark-700 rounded-2xl overflow-hidden flex flex-col hover:border-neon/30 transition-all group">
                  <div className="relative h-56 md:h-64 bg-dark-900 overflow-hidden flex items-center justify-center">
                    <span className={`absolute top-3 left-3 z-10 text-[11px] font-black px-3 py-1 rounded-full ${produto.badgeCls || 'bg-neon text-dark-950'}`}>
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
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="font-black text-xl text-white mb-1">{produto.nome}</h3>
                    <p className="text-neon text-sm font-semibold mb-5">{produto.tagline}</p>
                    <ul className="space-y-2 flex-1 mb-6">
                      {(produto.features || []).map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm text-zinc-400">
                          <Check className="w-4 h-4 text-neon mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-2">
                      <a href={wa(msgProduto)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-neon hover:bg-neon-dim text-dark-950 font-black py-3 rounded-xl transition-colors">
                        <MessageCircle className="w-4 h-4" />
                        Solicitar Cotação
                      </a>
                      {produto.alias && (
                        <a href={`/?produtos=${produto.alias}`}
                          className="flex items-center justify-center w-full border border-dark-600 hover:border-neon/30 text-zinc-500 hover:text-neon font-semibold py-2.5 rounded-xl transition-all text-sm">
                          Gerar Orçamento Detalhado
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
            Seu box merece<br />o melhor.
          </h2>
          <p className="text-zinc-500 text-base md:text-lg mb-8 md:mb-10">
            Um especialista BRAVE entra em contato pelo WhatsApp com uma proposta exclusiva.
          </p>
          <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-neon hover:bg-neon-dim text-dark-950 font-black text-base md:text-xl px-8 md:px-10 py-4 md:py-5 rounded-full transition-colors shadow-2xl shadow-neon/20 animate-pulse-neon">
            <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
            Falar com um Especialista
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
                { href: wa(cfg.wa_msg_geral),                   Icon: MessageCircle },
              ].map(({ href, Icon }, i) => (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full border border-dark-600 flex items-center justify-center text-zinc-600 hover:text-neon hover:border-neon/30 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-dark-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-zinc-700 text-sm">© 2025 Brave Fitness. Todos os direitos reservados.</p>
            <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
              className="text-sm font-bold text-neon hover:text-neon-dim transition-colors">
              Solicitar Cotação →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
