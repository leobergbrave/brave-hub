import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ShoppingCart, X, Plus, Minus, Trash2, Loader2, CheckCircle2, MessageCircle, Truck, MapPin, ArrowRight, Check } from 'lucide-react';

/* ═══════════════════════════════════════════════
   Orçamento na Landing Page — carrinho mobile-first.
   Envolva a página com <OrcamentoProvider origem="lp-ergometros" titulo="Ergômetros" waNumber="...">
   e chame useOrcamento().add({ alias, nome, preco, img, peso }) nos botões dos cards.
   ═══════════════════════════════════════════════ */

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Ctx = createContext(null);
export const useOrcamento = () => useContext(Ctx);

/* Botão pronto para os cards — já fala com o contexto do provider.
   <AddButton item={{ alias, nome, preco, img, peso }} /> */
export function AddButton({ item, className = '', label = 'Adicionar ao orçamento' }) {
  const orc = useOrcamento();
  const jaTem = orc?.itens?.[item.key || item.alias || item.sku || item.nome];
  return (
    <button
      onClick={() => orc?.add(item)}
      className={`w-full flex items-center justify-center gap-2 font-black text-sm rounded-xl py-3 transition-colors ${
        jaTem ? 'bg-neon/15 text-neon border border-neon/40' : 'bg-neon text-dark-950 hover:bg-neon-dim'
      } ${className}`}
    >
      {jaTem ? <><Check className="w-4 h-4" /> No orçamento ({jaTem.qtd})</> : <><Plus className="w-4 h-4" /> {label}</>}
    </button>
  );
}

export function OrcamentoProvider({ origem, titulo, waNumber, children }) {
  const [itens, setItens]     = useState({});   // key -> { alias, sku, nome, preco, img, peso, qtd, variante }
  const [aberto, setAberto]   = useState(false);
  const [cep, setCep]         = useState('');
  const [freteInfo, setFrete] = useState(null);  // { frete, cidade, estado } | null
  const [calcFrete, setCalcFrete] = useState(false);
  const [nome, setNome]       = useState('');
  const [tel, setTel]         = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(null);  // { link } | null
  const [erro, setErro]       = useState('');

  const add = useCallback((item) => {
    const key = item.key || item.alias || item.sku || item.nome;
    setItens(prev => {
      const atual = prev[key];
      return { ...prev, [key]: { ...item, key, qtd: (atual?.qtd || 0) + 1 } };
    });
    setAberto(true);
    setFrete(null);
  }, []);

  const setQtd = useCallback((key, delta) => {
    setItens(prev => {
      const it = prev[key]; if (!it) return prev;
      const q = it.qtd + delta;
      if (q <= 0) { const cp = { ...prev }; delete cp[key]; return cp; }
      return { ...prev, [key]: { ...it, qtd: q } };
    });
    setFrete(null);
  }, []);

  const remover = useCallback((key) => {
    setItens(prev => { const cp = { ...prev }; delete cp[key]; return cp; });
    setFrete(null);
  }, []);

  const lista = useMemo(() => Object.values(itens), [itens]);
  const totalItens = lista.reduce((a, i) => a + i.qtd, 0);
  const subtotal   = lista.reduce((a, i) => a + (Number(i.preco) || 0) * i.qtd, 0);
  const pesoTotal  = lista.reduce((a, i) => a + (Number(i.peso) || 0) * i.qtd, 0);

  const calcularFrete = async () => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) { setErro('CEP precisa ter 8 dígitos'); return; }
    setErro(''); setCalcFrete(true); setFrete(null);
    try {
      const r = await fetch(`/api/lp-orcamento?cep=${cepLimpo}&peso=${Math.ceil(pesoTotal)}`);
      const j = await r.json();
      if (j.ok) setFrete({ frete: j.frete, cidade: j.cidade, estado: j.estado });
      else setErro(j.error || 'Não consegui calcular o frete');
    } catch { setErro('Erro ao calcular frete'); }
    finally { setCalcFrete(false); }
  };

  const enviar = async () => {
    if (!nome.trim())            { setErro('Digite seu nome'); return; }
    if (tel.replace(/\D/g, '').length < 10) { setErro('WhatsApp inválido (com DDD)'); return; }
    setErro(''); setEnviando(true);
    try {
      const r = await fetch('/api/lp-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origem, titulo, nome, telefone: tel, cep: cep.replace(/\D/g, ''),
          itens: lista.map(i => ({ alias: i.alias, sku: i.sku, nome: i.nome, quantidade: i.qtd })),
        }),
      });
      const j = await r.json();
      if (j.ok) setSucesso({ link: j.link });
      else setErro(j.error || 'Algo deu errado. Tente de novo.');
    } catch { setErro('Sem conexão. Tente de novo.'); }
    finally { setEnviando(false); }
  };

  const totalComFrete = subtotal + (freteInfo?.frete || 0);
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá! Acabei de montar um orçamento (${titulo}) no site e quero fechar.`)}`
    : null;

  return (
    <Ctx.Provider value={{ add, itens, totalItens }}>
      {children}

      {/* ── Barra flutuante (aparece com ≥1 item) ── */}
      {totalItens > 0 && !aberto && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-4 inset-x-4 z-[60] flex items-center justify-between gap-3 bg-neon text-dark-950 font-black rounded-2xl px-5 py-4 shadow-2xl shadow-neon/30 animate-fade-in-up max-w-lg mx-auto"
        >
          <span className="flex items-center gap-2.5">
            <span className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 bg-dark-950 text-neon text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">{totalItens}</span>
            </span>
            Meu orçamento
          </span>
          <span className="flex items-center gap-1.5 text-sm">{fmtBRL(subtotal)} <ArrowRight className="w-4 h-4" /></span>
        </button>
      )}

      {/* ── Gaveta (bottom sheet) ── */}
      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAberto(false)} />
          <div className="relative w-full sm:max-w-lg bg-dark-900 border-t sm:border border-dark-700 sm:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col animate-fade-in-up">

            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 shrink-0">
              <div>
                <h3 className="text-white font-black text-lg leading-none">Seu orçamento BRAVE</h3>
                <p className="text-zinc-500 text-xs mt-1">{titulo}</p>
              </div>
              <button onClick={() => setAberto(false)} className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {sucesso ? (
              /* ── Confirmação ── */
              <div className="p-6 text-center overflow-y-auto">
                <div className="w-16 h-16 rounded-full bg-neon/15 border border-neon/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-neon" />
                </div>
                <h4 className="text-white font-black text-xl mb-2">Orçamento gerado! 🎉</h4>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                  Um especialista BRAVE <span className="text-white font-bold">já foi avisado</span> e vai te chamar no WhatsApp.
                  Enquanto isso, seu orçamento já está pronto:
                </p>
                <a href={sucesso.link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-dark-800 border border-dark-600 text-white font-bold rounded-xl py-3.5 mb-3 hover:border-neon/40 transition-colors">
                  Ver meu orçamento <ArrowRight className="w-4 h-4" />
                </a>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-neon text-dark-950 font-black rounded-xl py-3.5 hover:bg-neon-dim transition-colors">
                    <MessageCircle className="w-5 h-5" /> Falar agora no WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <>
                {/* itens + form */}
                <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
                  {lista.length === 0 && (
                    <p className="text-zinc-500 text-sm text-center py-8">Toque em <span className="text-neon font-bold">＋ Adicionar</span> nos produtos para montar seu orçamento.</p>
                  )}
                  {lista.map((it) => (
                    <div key={it.key} className="flex items-center gap-3 bg-dark-800/60 border border-dark-700 rounded-xl p-3">
                      <div className="w-12 h-12 rounded-lg bg-dark-900 overflow-hidden flex items-center justify-center shrink-0">
                        {it.img ? <img src={it.img} alt={it.nome} className="w-full h-full object-contain p-1" /> : <span className="text-xl opacity-40">🏋️</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold leading-tight truncate">{it.nome}</p>
                        {it.variante && <p className="text-neon text-[11px] font-semibold">{it.variante}</p>}
                        {Number(it.preco) > 0 && <p className="text-zinc-400 text-xs mt-0.5">{fmtBRL(it.preco)}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQtd(it.key, -1)} className="w-7 h-7 rounded-lg bg-dark-700 text-white flex items-center justify-center hover:bg-dark-600"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="text-white text-sm font-black w-5 text-center">{it.qtd}</span>
                        <button onClick={() => setQtd(it.key, 1)} className="w-7 h-7 rounded-lg bg-dark-700 text-white flex items-center justify-center hover:bg-dark-600"><Plus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remover(it.key)} className="w-7 h-7 rounded-lg text-zinc-600 hover:text-red-400 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}

                  {lista.length > 0 && (
                    <>
                      {/* frete */}
                      <div className="bg-dark-800/40 border border-dark-700 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                          <Truck className="w-3.5 h-3.5 text-neon" /> Calcular frete
                        </div>
                        <div className="flex gap-2">
                          <input inputMode="numeric" value={cep} onChange={e => setCep(e.target.value)} placeholder="Seu CEP"
                            className="flex-1 bg-dark-900 border border-dark-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neon/50 placeholder:text-zinc-600" />
                          <button onClick={calcularFrete} disabled={calcFrete}
                            className="px-4 rounded-lg bg-dark-700 text-white text-sm font-bold hover:bg-dark-600 disabled:opacity-50 flex items-center gap-1.5">
                            {calcFrete ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                          </button>
                        </div>
                        {freteInfo && (
                          <p className="text-xs text-zinc-400">
                            {freteInfo.cidade}/{freteInfo.estado} — frete <span className="text-neon font-black">{freteInfo.frete > 0 ? fmtBRL(freteInfo.frete) : 'a combinar'}</span>
                          </p>
                        )}
                      </div>

                      {/* totais */}
                      <div className="border-t border-dark-700 pt-3 space-y-1 text-sm">
                        <div className="flex justify-between text-zinc-400"><span>Produtos</span><span>{fmtBRL(subtotal)}</span></div>
                        {freteInfo?.frete > 0 && <div className="flex justify-between text-zinc-400"><span>Frete</span><span>{fmtBRL(freteInfo.frete)}</span></div>}
                        <div className="flex justify-between text-white font-black text-base pt-1"><span>Total</span><span className="text-neon">{fmtBRL(totalComFrete)}</span></div>
                      </div>

                      {/* dados */}
                      <div className="space-y-2 pt-1">
                        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome"
                          className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-lg px-3 py-3 focus:outline-none focus:border-neon/50 placeholder:text-zinc-600" />
                        <input inputMode="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="Seu WhatsApp (com DDD)"
                          className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-lg px-3 py-3 focus:outline-none focus:border-neon/50 placeholder:text-zinc-600" />
                      </div>
                    </>
                  )}

                  {erro && <p className="text-red-400 text-xs text-center">{erro}</p>}
                </div>

                {/* CTA fixo */}
                {lista.length > 0 && (
                  <div className="p-4 border-t border-dark-700 shrink-0">
                    <button onClick={enviar} disabled={enviando}
                      className="w-full flex items-center justify-center gap-2 bg-neon text-dark-950 font-black rounded-xl py-4 hover:bg-neon-dim disabled:opacity-60 transition-colors text-base">
                      {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Gerar meu orçamento <ArrowRight className="w-5 h-5" /></>}
                    </button>
                    <p className="text-zinc-600 text-[11px] text-center mt-2">Sem compromisso — um especialista confirma tudo com você.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
