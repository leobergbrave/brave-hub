import { useState, useMemo, useCallback } from 'react';
import {
  ShoppingCart, Plus, Trash2, Truck, Weight, DollarSign,
  PackageCheck, Link2, Dumbbell, ChevronDown, Sparkles, MapPin,
  Loader2, BrainCircuit, MessageSquareText
} from 'lucide-react';
import { PRODUTOS, ESTADOS, ZONAS, formatCurrency, formatWeight, calcularFrete } from './data';

/* ═══════════════════════════════════════════════
   BRAVE HUB — Gerador de Orçamentos
   ═══════════════════════════════════════════════ */

export default function App() {
  // ── State ──
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [estado, setEstado] = useState('SP');
  const [zona, setZona] = useState('CAPITAL');
  const [itens, setItens] = useState([]);
  const [linkGerado, setLinkGerado] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

  // ── IA State ──
  const [iaTexto, setIaTexto] = useState('');
  const [iaProcessando, setIaProcessando] = useState(false);

  // ── Derived calculations ──
  const pesoTotal = useMemo(
    () => itens.reduce((acc, i) => acc + i.peso * i.quantidade, 0),
    [itens]
  );
  const subtotalEquip = useMemo(
    () => itens.reduce((acc, i) => acc + i.preco * i.quantidade, 0),
    [itens]
  );
  const freteFinal = useMemo(
    () => calcularFrete(pesoTotal, estado, zona),
    [pesoTotal, estado, zona]
  );
  const totalProjeto = subtotalEquip + freteFinal;

  // ── Handlers ──
  const handleAdicionar = useCallback(() => {
    if (!produtoId) return;
    const produto = PRODUTOS.find((p) => p.id === Number(produtoId));
    if (!produto) return;

    setItens((prev) => {
      const existing = prev.find((i) => i.id === produto.id);
      if (existing) {
        return prev.map((i) =>
          i.id === produto.id ? { ...i, quantidade: i.quantidade + quantidade } : i
        );
      }
      return [...prev, { ...produto, quantidade }];
    });
    setProdutoId('');
    setQuantidade(1);
  }, [produtoId, quantidade]);

  const handleRemover = useCallback((id) => {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const showToastMessage = useCallback((msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  const handleGerarLink = useCallback(() => {
    if (itens.length === 0) return;
    const params = new URLSearchParams();
    params.set('itens', JSON.stringify(itens.map((i) => ({ id: i.id, q: i.quantidade }))));
    params.set('uf', estado);
    params.set('zona', zona);
    const link = `${window.location.origin}/orcamento?${params.toString()}`;
    setLinkGerado(link);
    navigator.clipboard.writeText(link).catch(() => {});
    showToastMessage('Link copiado para a área de transferência!');
  }, [itens, estado, zona, showToastMessage]);

  // ── IA Mock Handler ──
  const handleProcessarIA = useCallback(() => {
    if (iaProcessando) return;
    setIaProcessando(true);

    setTimeout(() => {
      // Simulated AI extraction: 2x BikeErg Concept 2 (id:5), 5x Med Ball (id:1)
      const itensMock = [
        { ...PRODUTOS.find((p) => p.id === 5), quantidade: 2 },
        { ...PRODUTOS.find((p) => p.id === 1), quantidade: 5 },
      ];

      setItens((prev) => {
        let updated = [...prev];
        for (const novoItem of itensMock) {
          const existing = updated.find((i) => i.id === novoItem.id);
          if (existing) {
            updated = updated.map((i) =>
              i.id === novoItem.id
                ? { ...i, quantidade: i.quantidade + novoItem.quantidade }
                : i
            );
          } else {
            updated.push(novoItem);
          }
        }
        return updated;
      });

      setIaTexto('');
      setIaProcessando(false);
      showToastMessage('Produtos extraídos e adicionados com sucesso!');
    }, 1500);
  }, [iaProcessando, showToastMessage]);

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* ── Ambient background glow ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-neon/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-orange-accent/[0.04] blur-[140px]" />
        <div className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full bg-purple-500/[0.03] blur-[100px]" />
      </div>

      {/* ── Toast ── */}
      {showToast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-in-right">
          <div className="flex items-center gap-3 bg-dark-700 border border-neon/30 px-5 py-3 rounded-xl shadow-lg shadow-neon/10">
            <PackageCheck className="w-5 h-5 text-neon" />
            <span className="text-sm font-medium text-white">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-dark-700/60">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon/20 to-neon/5 border border-neon/20 flex items-center justify-center animate-pulse-neon">
              <Dumbbell className="w-5 h-5 text-neon" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                BRAVE <span className="text-neon">HUB</span>
              </h1>
              <p className="text-[11px] font-medium text-dark-500 tracking-widest uppercase">
                Gerador de Orçamentos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Equipamentos de Alto Padrão</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ═══ COLUNA ESQUERDA ═══ */}
          <div className="lg:col-span-5 space-y-6 animate-fade-in-up">

            {/* Card: Leitura Inteligente (IA) */}
            <section className="relative bg-dark-800/60 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6 overflow-hidden">
              {/* Subtle purple glow inside the card */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />

              <div className="relative flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Leitura Inteligente
                  </h2>
                  <p className="text-[10px] text-purple-400/70 font-medium tracking-wide">WhatsApp / Áudio</p>
                </div>
              </div>

              <div className="relative">
                <textarea
                  id="textarea-ia"
                  value={iaTexto}
                  onChange={(e) => setIaTexto(e.target.value)}
                  rows={4}
                  placeholder={'Cole aqui a mensagem do cliente. Ex: Fala irmão, me vê duas bikes da concept e 5 med balls de 9kg...'}
                  className="w-full bg-dark-900/80 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-dark-500 placeholder:text-xs leading-relaxed"
                />
                <MessageSquareText className="absolute right-3 top-3 w-4 h-4 text-dark-500/50" />
              </div>

              <button
                id="btn-processar-ia"
                onClick={handleProcessarIA}
                disabled={iaProcessando}
                className="relative w-full mt-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer overflow-hidden"
              >
                {iaProcessando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Processar Lista com IA
                  </>
                )}
              </button>
            </section>

            {/* Card: Adicionar Produto */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-neon/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-neon" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Adicionar Produto
                </h2>
              </div>

              {/* Select Produto */}
              <label className="block mb-4">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Produto</span>
                <div className="relative">
                  <select
                    id="select-produto"
                    value={produtoId}
                    onChange={(e) => setProdutoId(e.target.value)}
                    className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-all cursor-pointer"
                  >
                    <option value="">Selecione um produto...</option>
                    {PRODUTOS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — {formatCurrency(p.preco)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                </div>
              </label>

              {/* Quantidade */}
              <label className="block mb-5">
                <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Quantidade</span>
                <input
                  id="input-quantidade"
                  type="number"
                  min={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-all"
                />
              </label>

              {/* Botão Adicionar */}
              <button
                id="btn-adicionar"
                onClick={handleAdicionar}
                disabled={!produtoId}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-neon-dim to-neon text-dark-950 font-bold text-sm py-3.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-neon/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Adicionar ao Orçamento
              </button>
            </section>

            {/* Card: Destino */}
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-orange-accent/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-orange-accent" />
                </div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Destino da Entrega
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Estado</span>
                  <div className="relative">
                    <select
                      id="select-estado"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-orange-accent/50 focus:ring-1 focus:ring-orange-accent/20 transition-all cursor-pointer"
                    >
                      {ESTADOS.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  </div>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 mb-1.5 block">Zona</span>
                  <div className="relative">
                    <select
                      id="select-zona"
                      value={zona}
                      onChange={(e) => setZona(e.target.value)}
                      className="w-full appearance-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-orange-accent/50 focus:ring-1 focus:ring-orange-accent/20 transition-all cursor-pointer"
                    >
                      {ZONAS.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  </div>
                </label>
              </div>
            </section>

            {/* Info card */}
            <div className="bg-dark-800/30 border border-dark-700/30 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 leading-relaxed">
                <span className="text-neon font-semibold">Dica:</span> O frete é calculado automaticamente 
                com base no peso total dos equipamentos e na zona de entrega selecionada. 
                O valor mínimo do estado é sempre garantido.
              </p>
            </div>
          </div>

          {/* ═══ COLUNA DIREITA ═══ */}
          <div className="lg:col-span-7 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <section className="bg-dark-800/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl overflow-hidden flex flex-col h-full">

              {/* Header do Orçamento */}
              <div className="px-6 py-4 border-b border-dark-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-neon" />
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Orçamento
                  </h2>
                </div>
                {itens.length > 0 && (
                  <span className="text-xs font-bold text-dark-950 bg-neon px-2.5 py-1 rounded-full">
                    {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </div>

              {/* Lista de itens */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[200px]">
                {itens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mb-4">
                      <PackageCheck className="w-7 h-7 text-dark-500" />
                    </div>
                    <p className="text-sm text-zinc-500 font-medium">Nenhum item adicionado</p>
                    <p className="text-xs text-dark-500 mt-1">Selecione um produto e clique em "Adicionar"</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {itens.map((item, idx) => (
                      <li
                        key={item.id}
                        className="group bg-dark-900/50 border border-dark-700/40 rounded-xl p-4 flex items-center gap-4 hover:border-dark-600 transition-all animate-slide-in-right"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{item.nome}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-zinc-500">
                              {item.quantidade}x {formatCurrency(item.preco)}
                            </span>
                            <span className="text-[10px] text-dark-500">•</span>
                            <span className="text-xs text-zinc-500">
                              {formatWeight(item.peso * item.quantidade)}
                            </span>
                          </div>
                        </div>
                        {/* Subtotal */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-neon">
                            {formatCurrency(item.preco * item.quantidade)}
                          </p>
                        </div>
                        {/* Remove */}
                        <button
                          onClick={() => handleRemover(item.id)}
                          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-dark-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Painel de Resumo ── */}
              <div className="border-t border-dark-700/50 bg-dark-900/40 px-6 py-5 space-y-3">
                {/* Peso Total */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Weight className="w-4 h-4" />
                    <span className="text-xs font-medium">Peso Total</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{formatWeight(pesoTotal)}</span>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">Subtotal Equipamentos</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{formatCurrency(subtotalEquip)}</span>
                </div>

                {/* Frete */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Truck className="w-4 h-4" />
                    <span className="text-xs font-medium">Frete Final ({estado} · {zona})</span>
                  </div>
                  <span className="text-sm font-semibold text-orange-accent">{formatCurrency(freteFinal)}</span>
                </div>

                {/* Divider */}
                <div className="border-t border-dark-700/50 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Total do Projeto</span>
                    <span className="text-xl font-black text-neon">{formatCurrency(totalProjeto)}</span>
                  </div>
                </div>

                {/* Botão Gerar Link */}
                <button
                  id="btn-gerar-link"
                  onClick={handleGerarLink}
                  disabled={itens.length === 0}
                  className="w-full mt-3 flex items-center justify-center gap-2.5 bg-gradient-to-r from-orange-dim to-orange-accent text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-accent/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer"
                >
                  <Link2 className="w-5 h-5" />
                  Gerar Link para o Cliente
                </button>

                {/* Link gerado */}
                {linkGerado && (
                  <div className="mt-3 bg-dark-800 border border-dark-600 rounded-xl p-3 animate-fade-in-up">
                    <p className="text-[10px] uppercase font-semibold text-zinc-500 mb-1.5 tracking-wider">Link do Orçamento</p>
                    <p className="text-xs text-neon/80 break-all font-mono leading-relaxed select-all">
                      {linkGerado}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-dark-700/30 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-[11px] text-dark-500">
            © 2026 Brave Hub — Todos os direitos reservados
          </p>
          <p className="text-[11px] text-dark-500">
            v1.0.0
          </p>
        </div>
      </footer>
    </div>
  );
}
