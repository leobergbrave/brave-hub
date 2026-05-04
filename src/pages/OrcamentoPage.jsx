import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Shield, CalendarDays, Clock, UserRound, Package, Weight,
  Truck, CheckCircle2, MessageCircle, Sparkles, ChevronRight,
  Star, Award, BadgeCheck, Loader2, X, FolderOpen, CreditCard, Banknote
} from 'lucide-react';
import { fetchProdutos, fetchRegrasFrete, calcularFreteComRegra, parseMediaUrl } from '../data';
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════
   VITRINE DO CLIENTE — Orçamento Final
   ═══════════════════════════════════════════════ */

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function OrcamentoPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [expandedImage, setExpandedImage] = useState(null);

  const [produtosDb, setProdutosDb] = useState([]);
  const [regrasFreteDb, setRegrasFreteDb] = useState([]);
  const [orcamentoSalvo, setOrcamentoSalvo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [prods, regras] = await Promise.all([fetchProdutos(), fetchRegrasFrete()]);
        setProdutosDb(prods);
        setRegrasFreteDb(regras);

        if (slug) {
          const { data } = await supabase.from('orcamentos_salvos').select('*').eq('slug', slug).single();
          if (data) setOrcamentoSalvo(data);
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug]);

  // Dynamic title & OG meta for WhatsApp preview
  useEffect(() => {
    if (orcamentoSalvo) {
      const clientName = orcamentoSalvo.cliente || 'Cliente';
      document.title = `BRAVE - ${clientName.toUpperCase()}`;
      
      // Update or create OG meta tags
      const setMeta = (property, content) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };
      setMeta('og:title', `BRAVE - ${clientName.toUpperCase()}`);
      setMeta('og:description', `Orçamento exclusivo de equipamentos de alta performance`);
      setMeta('og:type', 'website');
    }
    return () => { document.title = 'Brave Hub — Gerador de Orçamentos'; };
  }, [orcamentoSalvo]);

  const orcamento = useMemo(() => {
    try {
      if (!produtosDb.length) return null;

      let itensRaw = [];
      let ufParam = '';
      let zonaParam = '';
      let clienteParam = 'Cliente Brave';
      let consultorParam = 'Consultor Oficial';
      let dataCriacao = new Date().toLocaleDateString('pt-BR');

      if (orcamentoSalvo) {
        itensRaw = orcamentoSalvo.payload.itens;
        ufParam = orcamentoSalvo.payload.estado;
        zonaParam = orcamentoSalvo.payload.zona;
        clienteParam = orcamentoSalvo.cliente;
        consultorParam = orcamentoSalvo.consultor;
        dataCriacao = new Date(orcamentoSalvo.criado_em).toLocaleDateString('pt-BR');
      } else {
        const itensParam = searchParams.get('itens');
        if (!itensParam) return null;
        itensRaw = JSON.parse(itensParam);
        ufParam = searchParams.get('uf');
        zonaParam = searchParams.get('zona');
        clienteParam = searchParams.get('c') || 'Cliente Brave';
        consultorParam = searchParams.get('v') || 'Consultor Oficial';
      }

      if (!itensRaw || !itensRaw.length) return null;

      const itensCompletos = itensRaw.map(itemRaw => {
        const prod = produtosDb.find(p => p.id === itemRaw.id);
        if (!prod) return null;
        
        const precoVenda = itemRaw.p !== undefined ? itemRaw.p : (itemRaw.preco !== undefined ? itemRaw.preco : prod.preco);
        const quantidade = itemRaw.q !== undefined ? itemRaw.q : itemRaw.quantidade;
        const precoOriginal = prod.preco;
        const descontoUnitario = precoOriginal > precoVenda ? precoOriginal - precoVenda : 0;
        
        // Fixed prices: from payload first, then from product DB
        const precoAvista = itemRaw.preco_avista || prod.preco_avista || null;
        const precoPrazo = itemRaw.preco_prazo || prod.preco_prazo || null;
        
        return {
          id: prod.id,
          nome: prod.nome,
          url_imagem: prod.url_imagem,
          quantidade: quantidade,
          precoOriginal: precoOriginal,
          preco: precoVenda,
          preco_avista: precoAvista,
          preco_prazo: precoPrazo,
          descontoUnitario: descontoUnitario,
          peso: prod.peso_kg || 0
        };
      }).filter(Boolean);

      const pesoTotal = itensCompletos.reduce((acc, i) => acc + i.peso * i.quantidade, 0);
      const subtotal = itensCompletos.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
      const descontoTotal = itensCompletos.reduce((acc, i) => acc + i.descontoUnitario * i.quantidade, 0);

      const regraFrete = regrasFreteDb.find(r => r.estado === ufParam && r.zona === zonaParam);
      const frete = calcularFreteComRegra(pesoTotal, regraFrete);
      const total = subtotal + frete;

      // Payment conditions
      const condicoes = orcamentoSalvo?.payload?.condicoes || {};
      const descAvista = condicoes.descontoAvista || 0;
      const descCartao = condicoes.descontoCartao || 0;
      const parcelas = condicoes.parcelas || 12;

      // Hybrid calculation: fixed price per product when available, % fallback
      const subtotalAvista = itensCompletos.reduce((acc, i) => {
        if (i.preco_avista) return acc + i.preco_avista * i.quantidade;
        return acc + i.preco * (1 - descAvista / 100) * i.quantidade;
      }, 0);
      const totalAvista = subtotalAvista + frete;

      const subtotalCartao = itensCompletos.reduce((acc, i) => {
        if (i.preco_prazo) return acc + i.preco_prazo * i.quantidade;
        return acc + i.preco * (1 - descCartao / 100) * i.quantidade;
      }, 0);
      const totalCartao = subtotalCartao + frete;
      const parcelaValor = totalCartao / parcelas;

      // Check if any product has fixed pricing
      const temPrecoFixo = itensCompletos.some(i => i.preco_avista || i.preco_prazo);

      return {
        cliente: clienteParam,
        consultor: consultorParam,
        data: dataCriacao,
        validade: '7 dias',
        itens: itensCompletos,
        pesoTotal,
        subtotal,
        descontoTotal,
        frete,
        total,
        descAvista,
        descCartao,
        parcelas,
        totalAvista,
        totalCartao,
        parcelaValor,
        temPrecoFixo
      };
    } catch (e) {
      console.error('Erro ao processar orçamento:', e);
      return null;
    }
  }, [searchParams, produtosDb, regrasFreteDb, orcamentoSalvo]);

  const handleNegociarProjeto = useCallback(() => {
    if (!orcamento) return;
    const texto = `Olá ${orcamento.consultor}! Analisei o orçamento no valor de ${fmt(orcamento.totalAvista)} à vista / ${fmt(orcamento.totalCartao)} parcelado. Podemos conversar sobre o projeto?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }, [orcamento]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon animate-spin mb-4" />
        <p className="text-zinc-400 font-medium">Carregando seu orçamento exclusivo...</p>
      </div>
    );
  }

  if (!orcamento) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center text-center px-6">
        <p className="text-white font-bold text-xl mb-2">Orçamento não encontrado</p>
        <p className="text-zinc-500 text-sm">O link pode estar quebrado ou incompleto.</p>
      </div>
    );
  }

  const descAvista = orcamento?.descAvista || 0;
  const descCartao = orcamento?.descCartao || 0;
  const totalModo = modoPagamento === 'avista' ? orcamento.totalAvista : orcamento.totalCartao;

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
            <img src="/logo-orcamento.png" alt="Brave Hub Logo" className="h-14 object-contain" />
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3 uppercase">
            Orçamento Exclusivo <span className="text-neon">{orcamento.cliente}</span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 font-medium">
            Equipamentos de alta performance
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Badge icon={CalendarDays} label="Data" value={orcamento.data} />
            <Badge icon={Clock} label="Validade" value={orcamento.validade} />
            <Badge icon={UserRound} label="Consultor" value={orcamento.consultor} />
          </div>
        </div>
      </header>

      {/* Divider */}
      <div className="max-w-3xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-dark-600 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════
          2. TOGGLE DE PAGAMENTO + LISTA
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-8 bg-dark-900/50 p-2 rounded-2xl border border-dark-700/50">
          <button onClick={() => setModoPagamento('avista')} className={`flex-1 w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${modoPagamento === 'avista' ? 'bg-neon text-dark-950 shadow-lg shadow-neon/20' : 'text-zinc-400 hover:text-white'}`}>
            <Banknote className="w-4 h-4" /> À Vista
          </button>
          <button onClick={() => setModoPagamento('cartao')} className={`flex-1 w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${modoPagamento === 'cartao' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'}`}>
            <CreditCard className="w-4 h-4" /> Cartão {orcamento.parcelas}x
          </button>
        </div>

        <div className="space-y-4">
          {orcamento.itens.map((item, idx) => (
            <div key={item.id} className="group bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-center hover:border-dark-600 transition-all animate-fade-in-up" style={{ animationDelay: `${idx * 0.1}s` }}>
              <div className="flex items-center gap-4">
                <div className={`shrink-0 w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-dark-700/80 border border-dark-600/50 flex items-center justify-center overflow-hidden ${item.url_imagem ? 'cursor-pointer hover:border-neon transition-colors' : ''}`} onClick={() => item.url_imagem && setExpandedImage(item.url_imagem)}>
                  {(() => {
                    if (!item.url_imagem) return <div className="text-center"><Package className="w-5 h-5 sm:w-6 sm:h-6 text-dark-500 mx-auto" /></div>;
                    const media = parseMediaUrl(item.url_imagem);
                    return media.type === 'image' ? <img src={media.url} alt={item.nome} className="w-full h-full object-cover" /> : <FolderOpen className="w-5 h-5 text-blue-400" />;
                  })()}
                </div>
                <div className="flex-1 sm:hidden">
                  <p className="text-sm font-bold text-white">{item.nome}</p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="hidden sm:block text-base font-bold text-white mb-1.5">{item.nome}</p>
                <div className="flex flex-wrap items-center gap-4 text-zinc-400 text-xs">
                  <span>Qtd: {item.quantidade}</span>
                  <span className="text-emerald-400/80">À vista: {item.preco_avista ? fmt(item.preco_avista) : fmt(item.preco * (1 - descAvista / 100))}</span>
                  <span className="text-blue-300/80">Cartão: {item.preco_prazo ? fmt(item.preco_prazo) : fmt(item.preco * (1 - descCartao / 100))}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end justify-center">
                <p className="text-sm font-bold text-emerald-400">
                  {fmt((item.preco_avista || item.preco * (1 - descAvista / 100)) * item.quantidade)}
                </p>
                <p className="text-[10px] text-blue-300/80">
                  {fmt((item.preco_prazo || item.preco * (1 - descCartao / 100)) * item.quantidade)}
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
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-neon/10 flex items-center justify-center">
              <Award className="w-4 h-4 text-neon" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Resumo do Investimento
            </h3>
          </div>

          <div className="space-y-4">
            <SummaryRow icon={<Weight className="w-4 h-4" />} label="Peso Total da Carga" value={`${orcamento.pesoTotal} kg`} />
            <SummaryRow icon={<Package className="w-4 h-4" />} label="Subtotal dos Equipamentos (À Vista)" value={fmt(orcamento.totalAvista - orcamento.frete)} />
            <SummaryRow icon={<Truck className="w-4 h-4" />} label="Frete Aplicado" value={fmt(orcamento.frete)} valueClass="text-orange-accent" />
          </div>

          <div className="my-6 h-px bg-gradient-to-r from-transparent via-dark-500/50 to-transparent" />

          {/* Totais: À Vista e Cartão */}
          <div className="space-y-4">
            {/* Bloco À Vista */}
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/30">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(16,185,129,0.1)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15">
                    <Banknote className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-400">
                      Total À Vista
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                      PIX / Boleto
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-emerald-400">
                    {fmt(orcamento.totalAvista)}
                  </p>
                  {orcamento.totalAvista < orcamento.totalCartao && (
                    <p className="text-[10px] text-emerald-400/60 mt-1">economize {fmt(orcamento.totalCartao - orcamento.totalAvista)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco Cartão */}
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-500/30">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(59,130,246,0.1)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15">
                    <CreditCard className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300">
                      Total no Cartão
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                      {orcamento.parcelas}x de {fmt(orcamento.parcelaValor)} sem juros
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-blue-300">
                    {fmt(orcamento.totalCartao)}
                  </p>
                </div>
              </div>
            </div>
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

        {/* Botão Negociar */}
        <button
          id="btn-negociar"
          onClick={handleNegociarProjeto}
          className="w-full flex items-center justify-center gap-3 text-lg font-black py-5 rounded-2xl transition-all duration-300 cursor-pointer bg-gradient-to-r from-neon-dim to-neon text-dark-950 hover:shadow-2xl hover:shadow-neon/30 hover:scale-[1.02] active:scale-[0.98]"
        >
          <MessageCircle className="w-6 h-6" />
          Negociar Projeto
          <ChevronRight className="w-5 h-5" />
        </button>
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

      {/* Lightbox / Modal de Imagem Expandida */}
      {expandedImage && (() => {
        const media = parseMediaUrl(expandedImage);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/90 backdrop-blur-sm p-4 animate-fade-in cursor-zoom-out" onClick={() => setExpandedImage(null)}>
            <button onClick={() => setExpandedImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-dark-800 text-white rounded-full flex items-center justify-center hover:bg-neon hover:text-dark-950 transition-colors cursor-pointer z-50">
              <X className="w-5 h-5" />
            </button>
            {media.type === 'folder' ? (
              <div className="w-full max-w-5xl h-[80vh] bg-white rounded-xl overflow-hidden cursor-default" onClick={(e) => e.stopPropagation()}>
                <iframe src={media.url} className="w-full h-full border-0" title="Pasta do Google Drive" />
              </div>
            ) : (
              <img src={media.url} alt="Imagem ampliada" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl shadow-neon/10 cursor-default" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        );
      })()}


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
