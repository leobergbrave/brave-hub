import { useState, useCallback } from 'react';
import {
  Shield, CalendarDays, Clock, UserRound, Package, Weight,
  Truck, CheckCircle2, MessageCircle, Sparkles, ChevronRight,
  Star, Award, BadgeCheck
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   VITRINE DO CLIENTE — Orçamento Final
   ═══════════════════════════════════════════════ */

// ── Mock Data ──
const ORCAMENTO = {
  cliente: 'CrossFit Olympus',
  consultor: 'Rafael Mendes',
  data: new Date().toLocaleDateString('pt-BR'),
  validade: '7 dias',
  itens: [
    {
      id: 5,
      nome: 'BikeErg Concept 2',
      quantidade: 2,
      preco: 18900.0,
      peso: 30,
    },
    {
      id: 1,
      nome: 'Med Ball 09 kg Fitness Race',
      quantidade: 5,
      preco: 340.0,
      peso: 9,
    },
  ],
};

const pesoTotal = ORCAMENTO.itens.reduce(
  (acc, i) => acc + i.peso * i.quantidade,
  0
);
const subtotal = ORCAMENTO.itens.reduce(
  (acc, i) => acc + i.preco * i.quantidade,
  0
);
const frete = 147.0;
const total = subtotal + frete;

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function OrcamentoPage() {
  const [aprovado, setAprovado] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [pulseBtn, setPulseBtn] = useState(false);

  const handleAprovar = useCallback(() => {
    if (aprovado) return;
    setPulseBtn(true);
    setTimeout(() => {
      setAprovado(true);
      setShowToast(true);
      setPulseBtn(false);
      setTimeout(() => setShowToast(false), 5000);
    }, 600);
  }, [aprovado]);

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* ── Ambient ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-neon/[0.025] blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-orange-accent/[0.03] blur-[120px]" />
        <div className="absolute top-[60%] left-[-5%] w-[350px] h-[350px] rounded-full bg-purple-500/[0.025] blur-[100px]" />
      </div>

      {/* ── Toast de Aprovação ── */}
      {showToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-slide-in-right w-[90%] max-w-lg">
          <div className="flex items-start gap-3 bg-dark-700 border border-neon/40 px-5 py-4 rounded-2xl shadow-2xl shadow-neon/15">
            <div className="w-10 h-10 rounded-full bg-neon/15 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-5 h-5 text-neon" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Projeto Aprovado! 🎉</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Seu consultor foi notificado e entrará em contato para o pagamento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          1. HEADER
          ══════════════════════════════════════════ */}
      <header className="relative z-10 pt-10 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          {/* Logo */}
          <div className="inline-flex items-center justify-center gap-1 mb-6">
            <span className="text-3xl font-black tracking-[-0.04em] text-white">
              BR<span className="text-neon">A</span>VE
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Seu Orçamento <span className="text-neon">Exclusivo</span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 font-medium">
            Preparado com alta performance para{' '}
            <span className="text-white font-semibold">{ORCAMENTO.cliente}</span>
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Badge icon={CalendarDays} label="Data" value={ORCAMENTO.data} />
            <Badge icon={Clock} label="Validade" value={ORCAMENTO.validade} />
            <Badge icon={UserRound} label="Consultor" value={ORCAMENTO.consultor} />
          </div>
        </div>
      </header>

      {/* Divider */}
      <div className="max-w-3xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-dark-600 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════
          2. LISTA DE EQUIPAMENTOS
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Package className="w-5 h-5 text-neon" />
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">
            Equipamentos do Projeto
          </h2>
        </div>

        <div className="space-y-4">
          {ORCAMENTO.itens.map((item, idx) => (
            <div
              key={item.id}
              className="group bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-5 flex items-center gap-5 hover:border-dark-600 transition-all animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              {/* Image Placeholder */}
              <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-dark-700/80 border border-dark-600/50 flex items-center justify-center overflow-hidden">
                <div className="text-center">
                  <Package className="w-6 h-6 text-dark-500 mx-auto" />
                  <p className="text-[8px] text-dark-500 mt-1 font-medium">FOTO</p>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-base sm:text-lg font-bold text-white truncate">
                  {item.nome}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                  <span className="text-xs text-zinc-500">
                    Qtd: <span className="text-zinc-300 font-semibold">{item.quantidade}</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    Unit: <span className="text-zinc-300 font-semibold">{fmt(item.preco)}</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    Peso: <span className="text-zinc-300 font-semibold">{item.peso * item.quantidade} kg</span>
                  </span>
                </div>
              </div>

              {/* Subtotal */}
              <div className="text-right shrink-0">
                <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-0.5">
                  Subtotal
                </p>
                <p className="text-lg sm:text-xl font-black text-neon">
                  {fmt(item.preco * item.quantidade)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          3. RESUMO FINANCEIRO
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-6">
        <div className="bg-dark-800/80 backdrop-blur-md border border-dark-700/60 rounded-2xl p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          {/* Mini header */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-neon/10 flex items-center justify-center">
              <Award className="w-4 h-4 text-neon" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Resumo do Investimento
            </h3>
          </div>

          {/* Rows */}
          <div className="space-y-4">
            <SummaryRow
              icon={<Weight className="w-4 h-4" />}
              label="Peso Total da Carga"
              value={`${pesoTotal} kg`}
            />
            <SummaryRow
              icon={<Package className="w-4 h-4" />}
              label="Subtotal dos Equipamentos"
              value={fmt(subtotal)}
            />
            <SummaryRow
              icon={<Truck className="w-4 h-4" />}
              label="Frete Aplicado"
              value={fmt(frete)}
              valueClass="text-orange-accent"
            />
          </div>

          {/* Divider */}
          <div className="my-6 h-px bg-gradient-to-r from-transparent via-dark-500/50 to-transparent" />

          {/* Total */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1">
                Valor Total do Investimento
              </p>
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5 text-neon" />
                <span className="text-xs text-neon font-medium">Orçamento Garantido</span>
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-neon tracking-tight">
              {fmt(total)}
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. CTAs — ÁREA DE AÇÃO
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-12 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
        {/* Escassez */}
        <div className="flex items-start gap-2.5 bg-orange-accent/5 border border-orange-accent/20 rounded-xl px-5 py-3.5 mb-5">
          <Shield className="w-4 h-4 text-orange-accent shrink-0 mt-0.5" />
          <p className="text-xs text-orange-accent/90 leading-relaxed font-medium">
            <span className="font-bold">Atenção:</span> A aprovação garante a reserva do estoque e 
            congela os valores de tabela.
          </p>
        </div>

        {/* Botão Aprovar */}
        <button
          id="btn-aprovar"
          onClick={handleAprovar}
          disabled={aprovado}
          className={`w-full flex items-center justify-center gap-3 text-lg font-black py-5 rounded-2xl transition-all duration-300 cursor-pointer ${
            aprovado
              ? 'bg-neon/20 text-neon border-2 border-neon/30'
              : 'bg-gradient-to-r from-neon-dim to-neon text-dark-950 hover:shadow-2xl hover:shadow-neon/30 hover:scale-[1.02] active:scale-[0.98]'
          } ${pulseBtn ? 'animate-pulse-neon scale-[1.03]' : ''}`}
        >
          {aprovado ? (
            <>
              <CheckCircle2 className="w-6 h-6" />
              Projeto Aprovado
            </>
          ) : (
            <>
              <Sparkles className="w-6 h-6" />
              Aprovar Projeto
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>

        {/* Link consultor */}
        <div className="text-center mt-4">
          <button className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-4 decoration-dark-500 hover:decoration-zinc-400 cursor-pointer inline-flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            Quero alterar itens com meu consultor
          </button>
        </div>
      </section>

      {/* ── Selo de confiança ── */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 pb-8">
        <div className="flex flex-wrap items-center justify-center gap-6 py-6 border-t border-dark-700/30">
          <TrustBadge icon={Shield} label="Pagamento Seguro" />
          <TrustBadge icon={Truck} label="Entrega Rastreada" />
          <TrustBadge icon={Star} label="Equipamentos Premium" />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-dark-700/20">
        <div className="max-w-3xl mx-auto px-6 py-5 text-center">
          <p className="text-[11px] text-dark-500">
            © 2026 Brave — Equipamentos de Alta Performance
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function Badge({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 bg-dark-800/70 border border-dark-700/50 rounded-full px-4 py-2">
      <Icon className="w-3.5 h-3.5 text-neon/60" />
      <span className="text-[11px] text-zinc-500 font-medium">{label}:</span>
      <span className="text-[11px] text-white font-semibold">{value}</span>
    </div>
  );
}

function SummaryRow({ icon, label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-zinc-400">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function TrustBadge({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-dark-500" />
      <span className="text-[11px] text-dark-500 font-medium">{label}</span>
    </div>
  );
}
