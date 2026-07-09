import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Files, Copy, ExternalLink, Trash2, Save, Loader2, Check, DollarSign, MessageCircle } from 'lucide-react';
import { ERGO_CATALOG, comboSlug, comboTotais } from '../data/ergoCatalog';

const BASE = 'https://brave-hub-two.vercel.app';
const ROW_ID = 'ergo-combos';
const fmtBRL = (v) => Number(v) > 0 ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

export default function ComboErgoTab() {
  const [sel, setSel]           = useState([]);        // aliases marcados
  const [desconto, setDesconto] = useState('');
  const [nome, setNome]         = useState('');
  const [salvos, setSalvos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast]       = useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  useEffect(() => {
    supabase.from('landing_pages_config').select('config').eq('id', ROW_ID).maybeSingle()
      .then(({ data }) => setSalvos(data?.config?.combos_salvos || []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (alias) => setSel(s => s.includes(alias) ? s.filter(a => a !== alias) : [...s, alias]);

  const produtos = ERGO_CATALOG.filter(p => sel.includes(p.alias));
  const d = Math.max(0, Number(desconto) || 0);
  const t = comboTotais(produtos, d);
  const slug = comboSlug(produtos);
  const link = produtos.length ? `${BASE}/lp/ergo/${slug}${d > 0 ? `?d=${d}` : ''}` : '';

  const copiar = (txt) => { navigator.clipboard.writeText(txt); showToast('🔗 Link copiado!'); };

  const persistir = async (novaLista) => {
    const { error } = await supabase.from('landing_pages_config').upsert({
      id: ROW_ID, titulo: 'Combos Ergômetros', url_path: '/lp/ergo', ativo: true,
      config: { combos_salvos: novaLista }, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  };

  const salvarCombo = async () => {
    if (!produtos.length) return showToast('⚠️ Selecione ao menos 1 produto.');
    if (!nome.trim())     return showToast('⚠️ Dê um nome ao combo.');
    setSalvando(true);
    try {
      const novo = { nome: nome.trim(), aliases: produtos.map(p => p.alias), slug, desconto: d, criado_em: new Date().toISOString() };
      const lista = [novo, ...salvos.filter(c => !(c.slug === slug && c.desconto === d))];
      await persistir(lista);
      setSalvos(lista);
      setNome('');
      showToast('✅ Combo salvo!');
    } catch (e) { showToast('❌ ' + e.message); }
    finally { setSalvando(false); }
  };

  const removerCombo = async (i) => {
    const lista = salvos.filter((_, idx) => idx !== i);
    try { await persistir(lista); setSalvos(lista); showToast('🗑️ Combo removido.'); }
    catch (e) { showToast('❌ ' + e.message); }
  };

  const carregar = (c) => {
    setSel(c.aliases || []);
    setDesconto(c.desconto ? String(c.desconto) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const linkDe = (c) => `${BASE}/lp/ergo/${c.slug}${c.desconto > 0 ? `?d=${c.desconto}` : ''}`;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-dark-700 border border-dark-600 text-white text-sm px-5 py-3 rounded-xl shadow-xl">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neon/10 flex items-center justify-center">
          <Files className="w-5 h-5 text-neon" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">Combos de Ergômetros</h2>
          <p className="text-zinc-600 text-xs">Monte um link profissional com os produtos escolhidos e envie no WhatsApp</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gradient-to-br from-neon/5 to-dark-800/60 border border-neon/20 rounded-2xl p-5 text-xs text-zinc-400 leading-relaxed space-y-2">
        <p><span className="text-neon font-bold">Objetivo:</span> gerar páginas de combo (ex: Remo + SkiErg + Storm Bike) para enviar as informações dos produtos de forma profissional, com total do combo e prévia de imagem no WhatsApp.</p>
        <p><span className="text-neon font-bold">Como usar:</span> marque os produtos → (opcional) informe um desconto do combo → copie o link ou salve o combo com um nome para reusar. Cada combo tem sua própria imagem de prévia.</p>
        <p><span className="text-neon font-bold">Testar:</span> clique em <span className="text-white font-bold">Abrir</span> para ver a página; cole o link no WhatsApp para conferir a prévia (se cachear a antiga, use o sufixo <span className="font-mono text-zinc-300">?v=2</span>).</p>
      </div>

      {/* Seleção */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-white font-bold text-sm">1. Escolha os produtos do combo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ERGO_CATALOG.map(p => {
            const on = sel.includes(p.alias);
            return (
              <button key={p.alias} onClick={() => toggle(p.alias)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'bg-neon/10 border-neon/40' : 'bg-dark-900 border-dark-700 hover:border-dark-500'}`}>
                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-neon text-dark-950' : 'border border-dark-600'}`}>
                  {on && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="text-xl">{p.emoji}</span>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold truncate">{p.nome}</p>
                  <p className="text-zinc-500 text-[11px]">{p.preco_avista > 0 ? `${fmtBRL(p.preco_avista)} à vista` : 'Sob consulta'}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desconto + Totais */}
      {produtos.length > 0 && (
        <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-5">
          <h3 className="text-white font-bold text-sm">2. Desconto e total do combo</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <DollarSign className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="number" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="Desconto do combo (R$)"
                className="bg-dark-900 border border-dark-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 w-56 focus:outline-none focus:border-neon/50" />
            </div>
            <span className="text-zinc-600 text-xs">off no total à vista (opcional)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-dark-900 rounded-xl p-4">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Total à vista</p>
              <p className="text-neon text-xl font-black">{fmtBRL(t.avistaFinal)}</p>
            </div>
            <div className="bg-dark-900 rounded-xl p-4">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">10x sem juros</p>
              <p className="text-white text-xl font-black">{fmtBRL(t.parcela)}</p>
            </div>
            <div className="bg-dark-900 rounded-xl p-4">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Economia</p>
              <p className="text-neon text-xl font-black">{fmtBRL(t.economia)}</p>
            </div>
            <div className="bg-dark-900 rounded-xl p-4">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Itens</p>
              <p className="text-white text-xl font-black">{produtos.length}</p>
            </div>
          </div>
          {t.temConsultar && <p className="text-amber-400/80 text-[11px]">* Escada Ergométrica está sob consulta e não entra no total somado.</p>}

          {/* Link gerado */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-3">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Link do combo</p>
            <p className="text-neon text-xs font-mono break-all">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copiar(link)} className="flex items-center gap-1.5 text-xs text-white bg-neon/15 hover:bg-neon/25 text-neon px-3 py-2 rounded-lg font-bold transition-all">
                <Copy className="w-3.5 h-3.5" /> Copiar link
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-300 border border-dark-600 hover:border-dark-500 px-3 py-2 rounded-lg transition-all">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 px-3 py-2 rounded-lg transition-all">
                <MessageCircle className="w-3.5 h-3.5" /> Enviar no WhatsApp
              </a>
            </div>
          </div>

          {/* Salvar */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do combo (ex: Kit Cardio Completo)"
              className="flex-1 min-w-[220px] bg-dark-900 border border-dark-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-neon/50" />
            <button onClick={salvarCombo} disabled={salvando}
              className="flex items-center gap-1.5 text-xs text-dark-950 bg-neon hover:bg-neon-dim disabled:opacity-50 px-4 py-2.5 rounded-lg font-bold transition-all">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar combo
            </button>
          </div>
        </div>
      )}

      {/* Salvos */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-3">
        <h3 className="text-white font-bold text-sm">Combos salvos</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-neon animate-spin" /></div>
        ) : salvos.length === 0 ? (
          <p className="text-zinc-600 text-xs py-4 text-center">Nenhum combo salvo ainda. Monte um acima e clique em “Salvar combo”.</p>
        ) : salvos.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-3 bg-dark-900 border border-dark-700 rounded-xl px-4 py-3">
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate">{c.nome}</p>
              <p className="text-zinc-600 text-[11px] truncate">{(c.aliases || []).length} itens{c.desconto > 0 ? ` · desc. ${fmtBRL(c.desconto)}` : ''} · <span className="font-mono">/lp/ergo/{c.slug}</span></p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => carregar(c)} title="Editar" className="p-2 text-zinc-500 hover:text-neon hover:bg-dark-700 rounded-lg transition-colors text-[11px] font-bold px-2.5">Editar</button>
              <button onClick={() => copiar(linkDe(c))} title="Copiar" className="p-2 text-zinc-500 hover:text-neon hover:bg-dark-700 rounded-lg transition-colors"><Copy className="w-3.5 h-3.5" /></button>
              <a href={linkDe(c)} target="_blank" rel="noopener noreferrer" title="Abrir" className="p-2 text-zinc-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
              <button onClick={() => removerCombo(i)} title="Remover" className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
