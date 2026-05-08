import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Shield, CalendarDays, Clock, UserRound, Package, Weight,
  Truck, CheckCircle2, MessageCircle, Sparkles, ChevronRight,
  Star, Award, BadgeCheck, Loader2, X, FolderOpen, CreditCard, Banknote,
  Flame, Zap
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
      const frete = orcamentoSalvo?.payload?.frete !== undefined 
        ? Number(orcamentoSalvo.payload.frete) 
        : calcularFreteComRegra(pesoTotal, regraFrete);
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

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* ── Ambient ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-neon/[0.025] blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-orange-accent/[0.03] blur-[120px]" />
        <div className="absolute top-[60%] left-[-5%] w-[350px] h-[350px] rounded-full bg-purple-500/[0.025] blur-[100px]" />
      </div>



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
          2. LISTA DE EQUIPAMENTOS
          ══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-8">

        <div className="space-y-4">
          {orcamento.itens.map((item, idx) => {
            const pTabela = item.precoOriginal;
            const pAvista = item.preco_avista ?? item.preco * (1 - orcamento.descAvista / 100);
            const pPrazo = item.preco_prazo ?? item.preco * (1 - orcamento.descCartao / 100);
            const descAvista = pTabela > 0 ? Math.round(((pTabela - pAvista) / pTabela) * 100) : 0;
            const descPrazo = pTabela > 0 ? Math.round(((pTabela - pPrazo) / pTabela) * 100) : 0;
            const totalPrazo = pPrazo * item.quantidade;
            const totalAvista = pAvista * item.quantidade;
            const totalTabela = pTabela * item.quantidade;
            const parcelaMensal = totalPrazo / orcamento.parcelas;
            const economiaTotal = totalTabela - totalAvista;
            const unidsDisp = ((item.id.charCodeAt(0) || 3) % 4) + 2;
            const media = item.url_imagem ? parseMediaUrl(item.url_imagem) : null;

            return (
              <div key={item.id} className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden relative animate-fade-in-up" style={{ animationDelay: `${idx * 0.1}s` }}>
                {/* Selo exclusivo */}
                {descAvista > 0 && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-neon to-emerald-500 text-dark-950 text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl z-10 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> OFERTA EXCLUSIVA
                  </div>
                )}

                {/* Header: imagem + nome + qtd */}
                <div className="flex items-center gap-4 p-4 pb-2">
                  <div
                    className={`shrink-0 w-16 h-16 rounded-xl bg-dark-900 flex items-center justify-center overflow-hidden ${item.url_imagem ? 'cursor-pointer hover:border-neon border border-transparent transition-colors' : ''}`}
                    onClick={() => item.url_imagem && setExpandedImage(item.url_imagem)}
                  >
                    {media && media.type === 'image' ? (
                      <img src={media.url} alt={item.nome} className="max-h-full max-w-full object-contain" />
                    ) : media && media.type === 'folder' ? (
                      <FolderOpen className="w-6 h-6 text-blue-400" />
                    ) : (
                      <Package className="w-6 h-6 text-dark-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white leading-tight pr-20">{item.nome}</h3>
                    {item.peso > 0 && (
                      <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 mt-0.5"><Weight className="w-3 h-3" /> {item.peso}kg · Qtd: {item.quantidade}</span>
                    )}
                  </div>
                </div>

                {/* 3 tiers de preço */}
                <div className="px-4 pb-2 space-y-1.5">
                  {/* Tier 1: Preço de tabela */}
                  <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-dark-900/50">
                    <span className="text-[11px] text-zinc-600 uppercase tracking-wider font-medium">Preço de tabela</span>
                    <span className="text-sm text-zinc-600 line-through font-medium">{fmt(totalTabela)}</span>
                  </div>

                  {/* Tier 2: Cartão parcelado */}
                  {descPrazo > 0 && (
                    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/20">
                      <div>
                        <span className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold flex items-center gap-1"><CreditCard className="w-3 h-3" /> Cartão {orcamento.parcelas}x</span>
                        <p className="text-base font-black text-white mt-0.5">{orcamento.parcelas}x {fmt(parcelaMensal)}</p>
                        <p className="text-[10px] text-zinc-500">Total: {fmt(totalPrazo)}</p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-950 bg-gradient-to-r from-amber-400 to-yellow-300 px-2.5 py-1 rounded-full shadow-sm shadow-amber-500/20 whitespace-nowrap">
                        {descPrazo}% off
                      </span>
                    </div>
                  )}

                  {/* Tier 3: À Vista */}
                  {descAvista > 0 && (
                    <div className="relative flex items-center justify-between py-2.5 px-3 rounded-xl border border-neon/30" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04) 0%, rgba(16,185,129,0.06) 100%)' }}>
                      <div>
                        <span className="text-[10px] text-neon/80 uppercase tracking-wider font-semibold flex items-center gap-1"><Banknote className="w-3 h-3" /> À Vista (PIX)</span>
                        <p className="text-lg font-black text-neon mt-0.5">{fmt(totalAvista)}</p>
                        <p className="text-[10px] text-emerald-400 font-medium">Economia de {fmt(economiaTotal)}</p>
                      </div>
                      <span className="text-[10px] font-bold text-dark-950 bg-gradient-to-r from-neon to-emerald-400 px-2.5 py-1 rounded-full shadow-lg shadow-neon/25 animate-pulse whitespace-nowrap">
                        {descAvista}% off
                      </span>
                    </div>
                  )}
                </div>

                {/* Urgency Bar */}
                <div className="mx-4 mb-3 mt-1 flex items-center gap-2 py-2 px-3 rounded-xl bg-red-500/[0.05] border border-red-500/15">
                  <Flame className="w-3.5 h-3.5 text-red-400 animate-pulse shrink-0" />
                  <span className="text-[11px] text-red-400 font-semibold">Apenas {unidsDisp} unidades disponíveis</span>
                  <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden ml-auto max-w-[50px]">
                    <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full animate-pulse" style={{ width: `${unidsDisp * 15}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
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
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 border border-neon/25" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04) 0%, rgba(16,185,129,0.06) 100%)' }}>
              <div className="absolute top-0 right-0 bg-gradient-to-l from-neon to-emerald-500 text-dark-950 text-[9px] font-black px-2.5 py-0.5 rounded-bl-lg flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> MELHOR OFERTA
              </div>
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(57,255,20,0.08)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-neon/10">
                    <Banknote className="w-5 h-5 text-neon" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neon">
                      Total À Vista
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                      PIX / Boleto
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-neon">
                    {fmt(orcamento.totalAvista)}
                  </p>
                  {orcamento.totalAvista < orcamento.totalCartao && (
                    <p className="text-[10px] text-emerald-400 font-medium mt-1">economize {fmt(orcamento.totalCartao - orcamento.totalAvista)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco Cartão */}
            <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-amber-500/[0.04] border border-amber-500/20">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none" style={{ background: 'rgba(245,158,11,0.08)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-400">
                      Total no Cartão
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                      {orcamento.parcelas}x de {fmt(orcamento.parcelaValor)} sem juros
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-4xl font-black text-white">
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
