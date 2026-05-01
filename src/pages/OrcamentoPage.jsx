import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Shield, CalendarDays, Clock, UserRound, Package, Weight,
  Truck, CheckCircle2, MessageCircle, Sparkles, ChevronRight,
  Star, Award, BadgeCheck, Loader2, X, FolderOpen
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
  const [aprovado, setAprovado] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [pulseBtn, setPulseBtn] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  
  const [showModalNegociacao, setShowModalNegociacao] = useState(false);
  const [motivoNegociacao, setMotivoNegociacao] = useState(null);

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
        
        return {
          id: prod.id,
          nome: prod.nome,
          url_imagem: prod.url_imagem,
          quantidade: quantidade,
          precoOriginal: precoOriginal,
          preco: precoVenda,
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
        total
      };
    } catch (e) {
      console.error('Erro ao processar orçamento:', e);
      return null;
    }
  }, [searchParams, produtosDb, regrasFreteDb, orcamentoSalvo]);

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

  const handleEnviarNegociacao = () => {
    if (!motivoNegociacao || !orcamento) return;
    
    let texto = `Olá ${orcamento.consultor}! Analisei o projeto do meu box no valor de ${fmt(orcamento.total)}.\n\n`;
    
    if (motivoNegociacao === 'concorrente') {
      texto += `Gostei muito, mas tenho uma proposta menor de outra marca. Conseguimos revisar as condições para fecharmos com a Brave?`;
    } else if (motivoNegociacao === 'pagamento') {
      texto += `O investimento ficou um pouco acima do esperado no momento. Podemos ver algumas opções flexíveis de pagamento ou parcelamento?`;
    } else if (motivoNegociacao === 'escopo') {
      texto += `Para viabilizarmos agora, pensei em ajustarmos alguns equipamentos e reduzir um pouco o escopo. Podemos reavaliar?`;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
    setShowModalNegociacao(false);
    setMotivoNegociacao(null);
  };

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
          {orcamento.itens.map((item, idx) => (
            <div
              key={item.id}
              className="group bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-center hover:border-dark-600 transition-all animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="flex items-center gap-4">
                {/* Image / Placeholder */}
                <div 
                  className={`shrink-0 w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-dark-700/80 border border-dark-600/50 flex items-center justify-center overflow-hidden ${item.url_imagem ? 'cursor-pointer hover:border-neon transition-colors' : ''}`}
                  onClick={() => item.url_imagem && setExpandedImage(item.url_imagem)}
                >
                  {(() => {
                    if (!item.url_imagem) {
                      return (
                        <div className="text-center">
                          <Package className="w-5 h-5 sm:w-6 sm:h-6 text-dark-500 mx-auto" />
                          <p className="text-[7px] sm:text-[8px] text-dark-500 mt-1 font-medium">FOTO</p>
                        </div>
                      );
                    }
                    const media = parseMediaUrl(item.url_imagem);
                    if (media.type === 'image') {
                      return <img src={media.url} alt={item.nome} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />;
                    } else if (media.type === 'folder') {
                      return (
                        <div className="text-center group-hover:scale-110 transition-transform duration-500">
                          <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 mx-auto" />
                          <p className="text-[7px] sm:text-[8px] text-blue-400 mt-1 font-bold tracking-widest">FOTOS</p>
                        </div>
                      );
                    }
                  })()}
                </div>
                
                {/* Mobile Title & Total */}
                <div className="flex-1 sm:hidden">
                  <p className="text-sm font-bold text-white leading-tight mb-1 line-clamp-2">{item.nome}</p>
                  <p className="text-lg font-black text-neon">{fmt(item.preco * item.quantidade)}</p>
                </div>
              </div>

              {/* Info Desktop + Meta Mobile */}
              <div className="flex-1 min-w-0">
                <p className="hidden sm:block text-base sm:text-lg font-bold text-white truncate mb-1.5">
                  {item.nome}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-dark-900/40 sm:bg-transparent p-2.5 sm:p-0 rounded-lg border border-dark-700/30 sm:border-0">
                  <span className="text-[11px] sm:text-xs text-zinc-500">
                    Qtd: <span className="text-zinc-300 font-semibold">{item.quantidade}</span>
                  </span>
                  <span className="text-[11px] sm:text-xs text-zinc-500 flex items-center gap-1 flex-wrap">
                    Unit: 
                    {item.descontoUnitario > 0 ? (
                      <>
                        <span className="text-zinc-500 line-through text-[9px] sm:text-[10px] ml-0.5">{fmt(item.precoOriginal)}</span>
                        <span className="text-neon font-bold ml-1">{fmt(item.preco)}</span>
                        <span className="bg-neon/10 text-neon border border-neon/20 text-[9px] px-1 py-0.5 rounded uppercase font-bold tracking-wider ml-1">
                          -{Math.round((item.descontoUnitario / item.precoOriginal) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-300 font-semibold">{fmt(item.preco)}</span>
                    )}
                  </span>
                  <span className="text-[11px] sm:text-xs text-zinc-500">
                    Peso: <span className="text-zinc-300 font-semibold">{item.peso * item.quantidade} kg</span>
                  </span>
                </div>
              </div>

              {/* Subtotal Desktop */}
              <div className="hidden sm:block text-right shrink-0">
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
              value={`${orcamento.pesoTotal} kg`}
            />
            <SummaryRow
              icon={<Package className="w-4 h-4" />}
              label="Subtotal dos Equipamentos"
              value={fmt(orcamento.subtotal + orcamento.descontoTotal)}
            />
            {orcamento.descontoTotal > 0 && (
              <SummaryRow
                icon={<BadgeCheck className="w-4 h-4 text-neon" />}
                label="Desconto Especial Aplicado"
                value={`- ${fmt(orcamento.descontoTotal)}`}
                valueClass="text-neon font-bold"
              />
            )}
            <SummaryRow
              icon={<Truck className="w-4 h-4" />}
              label="Frete Aplicado"
              value={fmt(orcamento.frete)}
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
              {fmt(orcamento.total)}
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

        {/* Botão Personalizar Condições */}
        {!aprovado && (
          <div className="text-center mt-5">
            <button 
              onClick={() => setShowModalNegociacao(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dark-600 bg-dark-800 text-sm font-semibold text-zinc-300 hover:text-white hover:border-dark-500 hover:bg-dark-700 transition-all duration-300 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-zinc-400" />
              Personalizar Condições
            </button>
          </div>
        )}
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

      {/* Modal de Negociação */}
      {showModalNegociacao && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-950/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowModalNegociacao(false)}>
          <div className="w-full max-w-lg bg-dark-800 border border-dark-600 rounded-3xl p-6 sm:p-8 shadow-2xl cursor-default" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Como podemos viabilizar?</h3>
                <p className="text-sm text-zinc-400">A Brave tem o compromisso de entregar o melhor Custo x Performance do mercado. Nos conte qual o próximo passo:</p>
              </div>
              <button onClick={() => setShowModalNegociacao(false)} className="p-2 bg-dark-700 hover:bg-dark-600 rounded-full text-zinc-400 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-8">
              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${motivoNegociacao === 'concorrente' ? 'border-neon bg-neon/10' : 'border-dark-600 bg-dark-900/50 hover:border-dark-500'}`}>
                <input type="radio" name="motivo" value="concorrente" checked={motivoNegociacao === 'concorrente'} onChange={(e) => setMotivoNegociacao(e.target.value)} className="w-4 h-4 text-neon focus:ring-neon bg-dark-700 border-dark-500" />
                <span className="text-sm font-medium text-white">Tenho um orçamento de <span className="text-neon">outra marca</span> e quero saber se a Brave cobre.</span>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${motivoNegociacao === 'pagamento' ? 'border-neon bg-neon/10' : 'border-dark-600 bg-dark-900/50 hover:border-dark-500'}`}>
                <input type="radio" name="motivo" value="pagamento" checked={motivoNegociacao === 'pagamento'} onChange={(e) => setMotivoNegociacao(e.target.value)} className="w-4 h-4 text-neon focus:ring-neon bg-dark-700 border-dark-500" />
                <span className="text-sm font-medium text-white">O valor está um pouco acima. Quero ver <span className="text-neon">condições de pagamento</span>.</span>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${motivoNegociacao === 'escopo' ? 'border-neon bg-neon/10' : 'border-dark-600 bg-dark-900/50 hover:border-dark-500'}`}>
                <input type="radio" name="motivo" value="escopo" checked={motivoNegociacao === 'escopo'} onChange={(e) => setMotivoNegociacao(e.target.value)} className="w-4 h-4 text-neon focus:ring-neon bg-dark-700 border-dark-500" />
                <span className="text-sm font-medium text-white">Quero <span className="text-neon">reavaliar alguns equipamentos</span> para diminuir o valor total.</span>
              </label>
            </div>

            <button
              onClick={handleEnviarNegociacao}
              disabled={!motivoNegociacao}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold bg-dark-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              Avisar Consultor no WhatsApp
            </button>
          </div>
        </div>
      )}
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
