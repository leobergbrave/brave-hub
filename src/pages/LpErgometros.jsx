import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, ChevronRight, MessageCircle, Instagram, Facebook, Youtube, Mail, Loader2 } from 'lucide-react';

// ── Defaults (fallback se Supabase não responder) ─────────────────────────────
const DEFAULT_CONFIG = {
  wa_number: '554199999999',
  wa_msg_geral: 'Olá! Vi os ergômetros da Brave e gostaria de solicitar uma cotação.',
  hero: {
    badge: 'Linha Ergômetros 2025',
    headline_1: 'Ergômetros Profissionais',
    headline_2: 'para o seu Box',
    desc: 'Equipamentos desenvolvidos para suportar os treinos mais intensos, projetados com tecnologia de ponta e o melhor custo-benefício do mercado.',
  },
  produtos: [
    { nome: 'Remo Indoor Brave', badge: '+300 Vendidas', badgeCls: 'bg-emerald-500', tagline: 'Força, resistência e resultados imediatos.', emoji: '🚣', alias: 'remo', features: ['Painel exclusivo com métricas confiáveis', 'Puxador anatômico no padrão C2', 'Partes em plástico resistentes', 'Rolamentos em tecnil'] },
    { nome: 'Esteira Curva Pro', badge: 'Pronta Entrega', badgeCls: 'bg-orange-500', tagline: 'O que era bom ficou ainda melhor.', emoji: '🏃', alias: 'estcv', features: ['Mais de 300 unidades vendidas', 'Projeto customizado sem alavanca de tensão', 'Durabilidade comprovada, mecânica resistente', 'Não faz uso de energia elétrica', 'Painel com todas as métricas de trabalho', 'Lotes semanais, consulte disponibilidade'] },
    { nome: 'Bike Erg Brave', badge: 'Pronta Entrega', badgeCls: 'bg-orange-500', tagline: 'Performance e endurance no padrão Concept.', emoji: '🚴', alias: 'bikeerg', features: ['Padrão similar ao Concept', 'Painel com sensor p1, trabalho em metragem confiável', 'Excelente para trabalho de endurance', 'Pronta entrega, condições exclusivas'] },
    { nome: 'Air Ski Brave', badge: 'Lançamento', badgeCls: 'bg-purple-500', tagline: 'Tensão calibrada, corda que não estoura.', emoji: '⛷️', alias: 'skierg', features: ['Puxador em borracha no padrão C2', 'Painel com sensor p1, trabalho em metragem confiável', 'Corda interna estendida — não estoura fácil', 'Tensão de puxada com calibragem Brave', 'Plataforma inclusa', 'Pronta entrega'] },
    { nome: 'Escada Ergométrica Brave', badge: 'Lançamento', badgeCls: 'bg-purple-500', tagline: 'Lançamento exclusivo com frete grátis.', emoji: '🪜', alias: 'escada', features: ['Lançamento exclusivo promocional', 'Painel multifuncional resistente', 'Equipamento silencioso', 'Pronta entrega', 'Garantia que funciona — Padrão Brave', 'Frete grátis para algumas regiões'] },
  ],
};

const PILARES = [
  { emoji: '⚡', titulo: 'Inovação, Qualidade e Durabilidade', desc: 'Ergômetros desenvolvidos para suportar os treinos mais intensos, projetados com tecnologia de ponta.' },
  { emoji: '🏆', titulo: 'O Melhor Suporte do Mercado', desc: 'Consultoria especializada para garantir os melhores equipamentos para o seu espaço. Especialistas em Box de CrossFit, Studios e Academias.' },
  { emoji: '💰', titulo: 'Custo-Benefício', desc: 'O melhor custo-benefício do mercado, com preços diferenciados e condições especiais de pagamento.' },
];

export default function LpErgometros() {
  const [cfg, setCfg]       = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('landing_pages_config')
      .select('*')
      .eq('id', 'ergometros')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCfg({
            wa_number:   data.wa_number   || DEFAULT_CONFIG.wa_number,
            wa_msg_geral: data.config?.wa_msg_geral || DEFAULT_CONFIG.wa_msg_geral,
            hero:        { ...DEFAULT_CONFIG.hero,    ...(data.config?.hero    || {}) },
            produtos:    data.config?.produtos?.length ? data.config.produtos : DEFAULT_CONFIG.produtos,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const wa = (msg) => `https://wa.me/${cfg.wa_number}?text=${encodeURIComponent(msg)}`;

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white antialiased">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="Brave Fitness" className="h-9 object-contain" />
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
      <section className="relative overflow-hidden py-24 px-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-orange-500/8 blur-[140px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-block text-orange-400 text-[11px] font-black tracking-[0.2em] uppercase border border-orange-400/30 bg-orange-400/8 px-4 py-1.5 rounded-full mb-5">
            {cfg.hero.badge}
          </span>
          <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
            {cfg.hero.headline_1}<br />
            <span className="text-orange-400">{cfg.hero.headline_2}</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {cfg.hero.desc}
          </p>
          <a
            href={wa(cfg.wa_msg_geral)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-black text-lg px-9 py-4 rounded-2xl transition-colors shadow-2xl shadow-orange-500/25"
          >
            Solicitar Cotação
            <ChevronRight className="w-5 h-5" />
          </a>
        </div>

        {/* PILARES */}
        <div className="relative max-w-5xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          {PILARES.map((p, i) => (
            <div key={i} className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-orange-500/20 transition-colors">
              <div className="text-3xl mb-3">{p.emoji}</div>
              <h3 className="font-bold text-white text-sm mb-2 leading-snug">{p.titulo}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRODUTOS ────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-3">Nossa Linha Completa</h2>
            <p className="text-gray-500">Clique em "Solicitar Cotação" para receber uma proposta personalizada via WhatsApp.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cfg.produtos.map((produto, i) => {
              const msgProduto = `Olá! Tenho interesse no ${produto.nome} da Brave. Pode me enviar uma cotação?`;
              return (
                <div key={i} className="bg-[#111111] border border-white/6 rounded-2xl overflow-hidden flex flex-col hover:border-orange-500/30 transition-all group">
                  <div className="relative h-52 bg-gradient-to-br from-white/3 to-transparent flex items-center justify-center border-b border-white/5">
                    <span className={`absolute top-3 left-3 text-[11px] font-black text-white px-2.5 py-1 rounded-full ${produto.badgeCls || 'bg-orange-500'}`}>
                      {produto.badge}
                    </span>
                    <span className="text-6xl opacity-60 group-hover:opacity-90 transition-opacity">{produto.emoji}</span>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="font-black text-xl text-white mb-1">{produto.nome}</h3>
                    <p className="text-orange-400 text-sm font-medium mb-5">{produto.tagline}</p>
                    <ul className="space-y-2.5 flex-1 mb-6">
                      {(produto.features || []).map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm text-gray-400">
                          <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-2">
                      <a
                        href={wa(msgProduto)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Solicitar Cotação
                      </a>
                      {produto.alias && (
                        <a
                          href={`/?produtos=${produto.alias}`}
                          className="flex items-center justify-center w-full border border-white/8 hover:border-orange-500/40 text-gray-500 hover:text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
                        >
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
      <section className="py-24 px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-orange-500/6 blur-[120px]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <span className="inline-block text-orange-400 text-[11px] font-black tracking-[0.2em] uppercase mb-4">
            Equipamentos Profissionais
          </span>
          <h2 className="text-5xl md:text-6xl font-black text-white mb-4 leading-tight">
            Seu box merece<br />o melhor.
          </h2>
          <p className="text-gray-400 text-lg mb-3">Solicite sua cotação agora.</p>
          <p className="text-gray-600 text-sm mb-10">
            Um especialista BRAVE entra em contato pelo WhatsApp com uma proposta exclusiva para o seu projeto.
          </p>
          <a
            href={wa(cfg.wa_msg_geral)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xl px-10 py-5 rounded-2xl transition-colors shadow-2xl shadow-emerald-500/20"
          >
            <MessageCircle className="w-6 h-6" />
            Falar com um Especialista
          </a>
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
                { href: 'https://instagram.com/bravefitness', Icon: Instagram },
                { href: 'https://facebook.com/bravefitness', Icon: Facebook },
                { href: 'https://youtube.com/@bravefitness', Icon: Youtube },
                { href: wa(cfg.wa_msg_geral), Icon: MessageCircle },
              ].map(({ href, Icon }, i) => (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full border border-white/8 flex items-center justify-center text-gray-600 hover:text-white hover:border-white/20 transition-all">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-700 text-sm">© 2025 Brave Fitness. Todos os direitos reservados.</p>
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
