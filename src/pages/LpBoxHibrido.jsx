import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, ChevronRight, MessageCircle, Mail, Loader2, Users } from 'lucide-react';

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

const fmt = (v) => v > 0
  ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : 'Consultar';

const DEFAULT_CONFIG = {
  wa_number: '554199999999',
  wa_msg_geral: 'Olá! Tenho interesse no Box Híbrido Full da Brave. Pode me enviar uma cotação?',
  hero: {
    breadcrumb: 'Corrida Híbrida › Box Completo',
    headline: 'BOX HÍBRIDO FULL',
    desc: 'A primeira marca a investir nessa modalidade desde 2024. Montamos o box híbrido ideal para o seu espaço, com os melhores equipamentos do mercado.',
  },
  tiers: [
    { alunos: 10, preco_avista: 73945.71, parcelas_valor: 8216.19, parcelas_num: 10 },
    { alunos: 15, preco_avista: 0, parcelas_valor: 0, parcelas_num: 10 },
    { alunos: 20, preco_avista: 0, parcelas_valor: 0, parcelas_num: 10 },
    { alunos: 25, preco_avista: 0, parcelas_valor: 0, parcelas_num: 10 },
    { alunos: 30, preco_avista: 0, parcelas_valor: 0, parcelas_num: 10 },
  ],
  badges: [
    { emoji: '🚚', texto: 'Entrega em 25-35 dias' },
    { emoji: '🛡️', texto: 'Garantia Suporte BRAVE' },
    { emoji: '🏆', texto: 'Qualidade Referência de Mercado' },
  ],
  testimonial: {
    texto: 'Começamos essa trajetória juntos em 2024 com o primeiro evento de corrida híbrida do Brasil. Construir uma marca de treinamento híbrido com a Brave é fácil e rápido.',
    autor: 'Gui Weisshaupt e Giselle Santos',
    empresa: 'Sócios do HTC Brasil',
  },
  parceiros: ['HTC Brasil', 'O3', 'BRUK'],
  showcase: [
    { nome: 'Sled Tech 15 Metros', emoji: '🛷' },
    { nome: 'Turf',                emoji: '🏟️' },
    { nome: 'Kettlebells Oficiais', emoji: '🏋️' },
    { nome: 'Bags',                 emoji: '🎒' },
  ],
};

export default function LpBoxHibrido() {
  const [cfg, setCfg]           = useState(DEFAULT_CONFIG);
  const [loading, setLoading]   = useState(true);
  const [tierIdx, setTierIdx]   = useState(0);

  useEffect(() => {
    supabase
      .from('landing_pages_config')
      .select('*')
      .eq('id', 'box-hibrido-full')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCfg({
            wa_number:    data.wa_number   || DEFAULT_CONFIG.wa_number,
            wa_msg_geral: data.config?.wa_msg_geral || DEFAULT_CONFIG.wa_msg_geral,
            hero:         { ...DEFAULT_CONFIG.hero,        ...(data.config?.hero        || {}) },
            tiers:        data.config?.tiers?.length       ? data.config.tiers         : DEFAULT_CONFIG.tiers,
            badges:       data.config?.badges?.length      ? data.config.badges        : DEFAULT_CONFIG.badges,
            testimonial:  { ...DEFAULT_CONFIG.testimonial, ...(data.config?.testimonial || {}) },
            parceiros:    data.config?.parceiros?.length   ? data.config.parceiros     : DEFAULT_CONFIG.parceiros,
            showcase:     data.config?.showcase?.length    ? data.config.showcase      : DEFAULT_CONFIG.showcase,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  );

  const wa = (msg) => `https://wa.me/${cfg.wa_number}?text=${encodeURIComponent(msg)}`;
  const tier = cfg.tiers[tierIdx] || cfg.tiers[0];
  const msgTier = `Olá! Tenho interesse no Box Híbrido Full para ${tier.alunos} alunos. Pode me enviar uma cotação?`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white antialiased">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <img src="/logo.png" alt="Brave Fitness" className="h-9 object-contain" />
            <p className="text-[10px] text-zinc-600 mt-0.5 tracking-wider">{cfg.hero.breadcrumb}</p>
          </div>
          <a
            href={wa(cfg.wa_msg_geral)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
          >
            Solicitar Cotação
          </a>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 px-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-orange-500/6 blur-[140px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-5 leading-none">
            {cfg.hero.headline}
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-12 leading-relaxed">
            {cfg.hero.desc}
          </p>

          {/* ── SELETOR DE ALUNOS ── */}
          <div className="inline-flex flex-col items-center gap-4 bg-white/3 border border-white/8 rounded-3xl p-6 mb-8">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-bold uppercase tracking-widest">
              <Users className="w-3.5 h-3.5" />
              Quantos alunos no seu box?
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {cfg.tiers.map((t, i) => (
                <button
                  key={t.alunos}
                  onClick={() => setTierIdx(i)}
                  className={`w-14 h-14 rounded-2xl font-black text-sm transition-all ${
                    tierIdx === i
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/8'
                  }`}
                >
                  {t.alunos}
                </button>
              ))}
            </div>

            {/* PREÇOS */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-2 border-t border-white/8 w-full justify-center">
              <div className="text-center">
                <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">À vista</p>
                <p className="text-3xl font-black text-emerald-400">{fmt(tier.preco_avista)}</p>
              </div>
              {tier.parcelas_valor > 0 && (
                <>
                  <div className="text-zinc-700 text-xl font-light hidden sm:block">ou</div>
                  <div className="text-center">
                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">Parcelado</p>
                    <p className="text-xl font-black text-white">
                      {tier.parcelas_num}x de <span className="text-orange-400">{fmt(tier.parcelas_valor)}</span>
                    </p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">no cartão de crédito</p>
                  </div>
                </>
              )}
              {tier.preco_avista === 0 && (
                <div className="text-center">
                  <p className="text-zinc-500 text-sm">Fale conosco para cotação personalizada</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={wa(msgTier)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-black text-lg px-9 py-4 rounded-2xl transition-colors shadow-2xl shadow-orange-500/25"
            >
              <MessageCircle className="w-5 h-5" />
              Adquira Seu Box Completo
            </a>
          </div>
        </div>
      </section>

      {/* ── BADGES ──────────────────────────────────────────── */}
      <section className="py-10 px-5 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
          {cfg.badges.map((b, i) => (
            <div key={i} className="flex items-center gap-4 bg-white/3 border border-white/6 rounded-2xl px-5 py-4">
              <span className="text-3xl shrink-0">{b.emoji}</span>
              <p className="text-white font-bold text-sm leading-snug">{b.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SHOWCASE ────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-orange-400 text-[11px] font-black tracking-[0.2em] uppercase border border-orange-400/30 bg-orange-400/8 px-4 py-1.5 rounded-full mb-4">
              Conheça Nossos Equipamentos
            </span>
            <h2 className="text-4xl font-black text-white">
              Consulte Todos os Produtos do<br />
              <span className="text-orange-400">BOX HÍBRIDO FULL {tier.alunos} ALUNOS</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {cfg.showcase.map((item, i) => {
              const msgItem = `Olá! Quero saber mais sobre o ${item.nome} da Brave para meu box.`;
              return (
                <div key={i} className="bg-[#111] border border-white/6 rounded-2xl overflow-hidden hover:border-orange-500/30 transition-all group flex flex-col">
                  <div className="h-40 bg-gradient-to-br from-white/3 to-transparent flex items-center justify-center border-b border-white/5">
                    <span className="text-5xl opacity-60 group-hover:opacity-90 transition-opacity">{item.emoji}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="text-white font-bold text-sm mb-3 flex-1">{item.nome}</p>
                    <a
                      href={wa(msgItem)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-orange-400 hover:text-orange-300 font-bold transition-colors flex items-center gap-1"
                    >
                      Saiba Mais <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTO ──────────────────────────────────────── */}
      <section className="py-20 px-5 bg-white/[0.015]">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block text-zinc-500 text-[11px] font-black tracking-[0.2em] uppercase mb-8">
            Depoimento de Quem Usa BRAVE
          </span>
          <blockquote className="text-xl md:text-2xl text-white font-medium leading-relaxed mb-8 relative">
            <span className="text-orange-400 text-5xl leading-none absolute -top-4 -left-2 opacity-40">"</span>
            {cfg.testimonial.texto}
            <span className="text-orange-400 text-5xl leading-none opacity-40">"</span>
          </blockquote>
          <div>
            <p className="text-white font-bold">{cfg.testimonial.autor}</p>
            <p className="text-zinc-500 text-sm">{cfg.testimonial.empresa}</p>
          </div>
        </div>
      </section>

      {/* ── PARCEIROS ───────────────────────────────────────── */}
      <section className="py-16 px-5">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-zinc-600 text-[11px] font-black tracking-[0.2em] uppercase mb-8">
            Principais Nomes do Treinamento Híbrido no Brasil
          </p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {cfg.parceiros.map((p, i) => (
              <div key={i} className="px-6 py-3 bg-white/3 border border-white/8 rounded-xl">
                <p className="text-white font-black text-sm tracking-wide">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────── */}
      <section className="py-24 px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-orange-500/6 blur-[120px]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight">
            Pronto Para Ter os Melhores<br />
            <span className="text-orange-400">Equipamentos Híbrido</span><br />
            no Seu Box?
          </h2>
          <p className="text-gray-500 text-sm mb-10">
            Um especialista BRAVE entra em contato pelo WhatsApp com uma proposta exclusiva para o seu projeto.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={wa(msgTier)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xl px-10 py-5 rounded-2xl transition-colors shadow-2xl shadow-emerald-500/20"
            >
              <MessageCircle className="w-6 h-6" />
              Adquira Seu Box Completo
            </a>
            <a
              href={wa(cfg.wa_msg_geral)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/10 hover:border-white/20 text-white font-bold text-base px-8 py-5 rounded-2xl transition-all"
            >
              Solicitar Cotação
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div>
              <img src="/logo.png" alt="Brave Fitness" className="h-8 object-contain mb-3" />
              <p className="text-gray-600 text-sm">CNPJ: 33.167.844/0001-80</p>
              <a href="mailto:comercial@bravefitness.com.br" className="text-gray-600 text-sm hover:text-gray-400 transition-colors flex items-center gap-1.5 mt-1">
                <Mail className="w-3.5 h-3.5" />
                comercial@bravefitness.com.br
              </a>
            </div>
            <div className="flex items-center gap-3">
              {[
                { href: 'https://instagram.com/bravefitness', Icon: IconInstagram },
                { href: 'https://facebook.com/bravefitness', Icon: IconFacebook },
                { href: 'https://youtube.com/@bravefitness',  Icon: IconYoutube   },
                { href: wa(cfg.wa_msg_geral),                  Icon: MessageCircle },
              ].map(({ href, Icon }, i) => (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full border border-white/8 flex items-center justify-center text-gray-600 hover:text-white hover:border-white/20 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-700 text-sm">© 2026 Brave Fitness. Todos os direitos reservados.</p>
            <a href={wa(cfg.wa_msg_geral)} target="_blank" rel="noopener noreferrer"
              className="text-sm font-bold text-orange-400 hover:text-orange-300 transition-colors">
              Solicitar Cotação →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
