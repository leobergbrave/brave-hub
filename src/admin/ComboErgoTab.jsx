import { useState, useEffect, useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../lib/supabase';
import { Files, Copy, ExternalLink, Trash2, Save, Loader2, Check, DollarSign, MessageCircle, Plus, Search, X, Package, Edit3, Upload } from 'lucide-react';
import { ERGO_CATALOG, mergeCatalog, comboSlug, comboTotais } from '../data/ergoCatalog';

const BASE = 'https://brave-hub-two.vercel.app';
const ROW_ID = 'ergo-combos';
const BUCKET = 'ergo-media'; // mesmo bucket dos ergometros
const fmtBRL = (v) => Number(v) > 0 ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const deburr = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// combo_produtos (banco) -> shape do catalogo (igual ao loadCatalog do backend)
const mapExtra = (r) => ({
  alias: r.alias, nome: r.nome, subtitle: r.subtitle || '', emoji: r.emoji || '📦',
  preco: Number(r.preco) || 0,
  preco_avista: r.preco_avista != null ? Number(r.preco_avista) : null,
  peso_kg: Number(r.peso_kg) || 0,
  specs: Array.isArray(r.specs) ? r.specs : [],
  fotos: Array.isArray(r.fotos) ? r.fotos.filter(Boolean) : [],
  video: r.video || '',
});

export default function ComboErgoTab() {
  const [sel, setSel]           = useState([]);
  const [desconto, setDesconto] = useState('');
  const [nome, setNome]         = useState('');
  const [salvos, setSalvos]     = useState([]);
  const [catalog, setCatalog]   = useState(ERGO_CATALOG); // os 6 nucleo
  const [extras, setExtras]     = useState([]);            // linhas de combo_produtos (cru)
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast]       = useState('');

  // Adicionar produto do Bling
  const [addOpen, setAddOpen]   = useState(false);
  const [busca, setBusca]       = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [form, setForm]         = useState(null); // { editandoId?, alias, sku, nome, subtitle, emoji, preco, preco_avista, peso_kg, imagem, specsTexto }
  const [salvandoProd, setSalvandoProd] = useState(false);
  const [enviandoImg, setEnviandoImg] = useState(false);
  const [enviandoVid, setEnviandoVid] = useState(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const todos = [...catalog, ...extras.map(mapExtra)]; // catalogo completo (6 + curados)

  const fetchTudo = useCallback(async () => {
    const [combos, cat, cp] = await Promise.all([
      supabase.from('landing_pages_config').select('config').eq('id', ROW_ID).maybeSingle(),
      supabase.from('landing_pages_config').select('config').eq('id', 'ergo-catalog').maybeSingle(),
      supabase.from('combo_produtos').select('*').eq('ativo', true).order('ordem', { ascending: true }),
    ]);
    setSalvos(combos.data?.config?.combos_salvos || []);
    setCatalog(mergeCatalog(cat.data?.config?.produtos));
    setExtras(cp.data || []);
  }, []);

  useEffect(() => { fetchTudo().finally(() => setLoading(false)); }, [fetchTudo]);

  const toggle = (alias) => setSel(s => s.includes(alias) ? s.filter(a => a !== alias) : [...s, alias]);

  const produtos = todos.filter(p => sel.includes(p.alias));
  const d = Math.max(0, Number(desconto) || 0);
  const t = comboTotais(produtos, d);
  const slug = comboSlug(produtos);
  const link = produtos.length ? `${BASE}/lp/ergo/${slug}${d > 0 ? `?d=${d}` : ''}` : '';

  const copiar = (txt) => { navigator.clipboard.writeText(txt); showToast('🔗 Link copiado!'); };

  // ── Adicionar produto do Bling ────────────────────────────────────────
  const buscarBling = useCallback(async (termo) => {
    if (!termo || termo.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const { data } = await supabase.from('produtos')
      .select('nome, codigo_sku, preco, preco_avista, preco_prazo, peso_kg, url_imagem')
      .ilike('nome', `%${termo.trim()}%`).limit(15);
    setResultados(data || []);
    setBuscando(false);
  }, []);

  const gerarAlias = (sku, nomeProd) => {
    let base = deburr(sku || nomeProd).replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'produto';
    const usados = new Set(todos.map(p => p.alias));
    let alias = base, i = 2;
    while (usados.has(alias)) alias = base + (i++);
    return alias;
  };

  const escolherProduto = (p) => {
    setForm({
      editandoId: null,
      alias: gerarAlias(p.codigo_sku, p.nome),
      sku: p.codigo_sku || '',
      nome: p.nome || '',
      subtitle: '',
      emoji: '📦',
      // congelado: pre-preenche do Bling, editavel. preco = prazo (usado no 10x), preco_avista = a vista
      preco: p.preco_prazo != null ? p.preco_prazo : (p.preco || ''),
      preco_avista: p.preco_avista != null ? p.preco_avista : (p.preco || ''),
      peso_kg: p.peso_kg || '',
      imagem: p.url_imagem || '',
      video: '',
      specsTexto: '',
    });
    setResultados([]);
    setBusca('');
  };

  // Abre o form pra editar um produto ja existente (trocar foto quebrada, etc.)
  const editarExtra = (row) => {
    setAddOpen(true);
    setForm({
      editandoId: row.id,
      alias: row.alias, sku: row.sku || '', nome: row.nome, subtitle: row.subtitle || '', emoji: row.emoji || '📦',
      preco: row.preco ?? '', preco_avista: row.preco_avista ?? '', peso_kg: row.peso_kg ?? '',
      imagem: Array.isArray(row.fotos) && row.fotos[0] ? row.fotos[0] : '',
      video: row.video || '',
      specsTexto: Array.isArray(row.specs) ? row.specs.join('\n') : '',
    });
    setResultados([]); setBusca('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Upload pro Supabase (bucket ergo-media) -> URL permanente, nao quebra.
  // campo = 'imagem' | 'video'. Imagem e comprimida; video sobe como esta.
  const enviarArquivo = async (file, campo) => {
    if (!file || !form) return;
    const setBusy = campo === 'video' ? setEnviandoVid : setEnviandoImg;
    const ref = campo === 'video' ? videoRef : fileRef;
    setBusy(true);
    try {
      let f = file;
      if (campo === 'imagem' && file.type.startsWith('image/')) {
        f = await imageCompression(file, { maxSizeMB: 0.9, maxWidthOrHeight: 1920, useWebWorker: true });
      }
      const ext = (file.name.split('.').pop() || (campo === 'video' ? 'mp4' : 'jpg')).toLowerCase();
      const path = `combo/${(form.alias || 'produto')}-${campo}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || undefined });
      if (error) throw error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      setForm(prev => ({ ...prev, [campo]: url }));
      showToast(campo === 'video' ? '✅ Vídeo enviado!' : '✅ Imagem enviada!');
    } catch (e) {
      showToast('❌ Upload falhou: ' + (e.message || e) + ' — a migration do bucket rodou?');
    } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  const salvarProduto = async () => {
    if (!form.nome.trim() || !form.alias.trim()) return showToast('⚠️ Nome e código são obrigatórios.');
    setSalvandoProd(true);
    try {
      const specs = form.specsTexto.split('\n').map(s => s.trim()).filter(Boolean);
      const payload = {
        alias: form.alias.trim().toLowerCase(),
        sku: form.sku || null,
        nome: form.nome.trim(),
        subtitle: form.subtitle.trim() || null,
        emoji: form.emoji || '📦',
        preco: Number(form.preco) || 0,
        preco_avista: form.preco_avista !== '' ? Number(form.preco_avista) : null,
        peso_kg: form.peso_kg !== '' ? Number(form.peso_kg) : null,
        specs,
        fotos: form.imagem ? [form.imagem] : [],
        video: form.video?.trim() || null,
        ativo: true,
      };
      let error;
      if (form.editandoId) {
        ({ error } = await supabase.from('combo_produtos').update(payload).eq('id', form.editandoId));
      } else {
        ({ error } = await supabase.from('combo_produtos').insert({ ...payload, ordem: 100 + extras.length }));
      }
      if (error) throw error;
      await fetchTudo();
      setForm(null);
      setAddOpen(false);
      showToast(form.editandoId ? '✅ Produto atualizado!' : '✅ Produto adicionado aos combos!');
    } catch (e) {
      showToast('❌ ' + (String(e.message).includes('duplicate') ? 'Esse código já existe.' : e.message));
    } finally { setSalvandoProd(false); }
  };

  const removerExtra = async (id, aliasRemovido) => {
    if (!confirm('Remover este produto da lista de combos?')) return;
    try {
      const { error } = await supabase.from('combo_produtos').delete().eq('id', id);
      if (error) throw error;
      setSel(s => s.filter(a => a !== aliasRemovido));
      await fetchTudo();
      showToast('🗑️ Produto removido.');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  // ── Combos salvos ─────────────────────────────────────────────────────
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
  const aliasExtras = new Set(extras.map(e => e.alias));

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
          <h2 className="text-white font-bold text-lg">Combos de Produtos</h2>
          <p className="text-zinc-600 text-xs">Monte um link profissional com qualquer produto e envie no WhatsApp</p>
        </div>
      </div>

      {/* Adicionar produto do Bling */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-sm flex items-center gap-2"><Package className="w-4 h-4 text-neon" /> Produtos disponíveis para combo</h3>
          <button onClick={() => { setAddOpen(o => !o); setForm(null); setBusca(''); setResultados([]); }}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-neon/10 text-neon border border-neon/20 hover:bg-neon/20 transition-colors">
            {addOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {addOpen ? 'Fechar' : 'Adicionar do Bling'}
          </button>
        </div>

        {addOpen && !form && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input autoFocus value={busca} onChange={e => { setBusca(e.target.value); buscarBling(e.target.value); }}
                placeholder="Buscar produto no Bling (ex: TURF, Sled, Anilha)…"
                className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-neon/50" />
              {buscando && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
            </div>
            {resultados.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-1 border border-dark-700 rounded-lg p-1">
                {resultados.map((p, i) => (
                  <button key={i} onClick={() => escolherProduto(p)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-dark-700 transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{p.nome}</p>
                      <p className="text-zinc-600 text-[11px]">{p.codigo_sku || 'sem SKU'} · {p.preco_avista ? fmtBRL(p.preco_avista) + ' à vista' : fmtBRL(p.preco)}</p>
                    </div>
                    <Plus className="w-4 h-4 text-neon shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {addOpen && form && (
          <div className="space-y-3 bg-dark-900 border border-dark-700 rounded-xl p-4">
            <p className="text-xs text-zinc-500">Dados vieram do Bling — confira e complemente. O preço fica <span className="text-white font-bold">congelado</span> (só muda se você editar aqui).</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Nome"><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inp} /></Campo>
              <Campo label="Código (slug)"><input value={form.alias} onChange={e => setForm({ ...form, alias: e.target.value })} className={inp + ' font-mono'} /></Campo>
              <Campo label="Subtítulo"><input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="ex: Piso oficial de prova" className={inp} /></Campo>
              <Campo label="Emoji"><input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className={inp} /></Campo>
              <Campo label="Preço à vista (R$)"><input type="number" value={form.preco_avista} onChange={e => setForm({ ...form, preco_avista: e.target.value })} className={inp} /></Campo>
              <Campo label="Preço prazo / 10x (R$)"><input type="number" value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} className={inp} /></Campo>
              <Campo label="Peso (kg)"><input type="number" value={form.peso_kg} onChange={e => setForm({ ...form, peso_kg: e.target.value })} className={inp} /></Campo>
            </div>
            {/* Imagem — URL ou upload pro Supabase (não quebra) */}
            <Campo label="Imagem do produto">
              <div className="flex gap-2 items-start">
                {form.imagem
                  ? <img src={form.imagem} alt="" className="w-16 h-16 rounded-lg object-cover border border-dark-700 bg-dark-800 shrink-0" onError={e => { e.target.style.opacity = .3; }} />
                  : <div className="w-16 h-16 rounded-lg border border-dashed border-dark-600 flex items-center justify-center text-zinc-600 text-2xl shrink-0">{form.emoji}</div>}
                <div className="flex-1 space-y-2">
                  <input value={form.imagem} onChange={e => setForm({ ...form, imagem: e.target.value })} placeholder="Cole uma URL ou envie um arquivo →" className={inp} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={enviandoImg}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-neon/10 text-neon border border-neon/20 hover:bg-neon/20 disabled:opacity-50">
                    {enviandoImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {enviandoImg ? 'Enviando…' : 'Enviar imagem'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => enviarArquivo(e.target.files?.[0], 'imagem')} />
                </div>
              </div>
            </Campo>

            {/* Vídeo — URL (YouTube/Vimeo/Drive) ou upload */}
            <Campo label="Vídeo (opcional)">
              <div className="flex gap-2 items-center flex-wrap">
                <input value={form.video} onChange={e => setForm({ ...form, video: e.target.value })} placeholder="Link do YouTube/Vimeo/Drive, ou envie um arquivo →" className={inp} />
                <button type="button" onClick={() => videoRef.current?.click()} disabled={enviandoVid}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-neon/10 text-neon border border-neon/20 hover:bg-neon/20 disabled:opacity-50 whitespace-nowrap">
                  {enviandoVid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {enviandoVid ? 'Enviando…' : 'Enviar vídeo'}
                </button>
                <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => enviarArquivo(e.target.files?.[0], 'video')} />
                {form.video && <a href={form.video} target="_blank" rel="noreferrer" className="text-[11px] text-neon underline">ver vídeo atual</a>}
              </div>
            </Campo>
            <Campo label="Specs (uma por linha)">
              <textarea rows={4} value={form.specsTexto} onChange={e => setForm({ ...form, specsTexto: e.target.value })}
                placeholder={'Altura: 16 mm\nMedidas oficiais de prova\nGarantia de 1 ano'} className={inp + ' resize-y'} />
            </Campo>
            <div className="flex gap-2">
              <button onClick={salvarProduto} disabled={salvandoProd}
                className="flex items-center gap-1.5 text-xs text-dark-950 bg-neon hover:bg-neon-dim disabled:opacity-50 px-4 py-2.5 rounded-lg font-bold">
                {salvandoProd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Adicionar aos combos
              </button>
              <button onClick={() => setForm(null)} className="text-xs text-zinc-400 border border-dark-600 hover:border-dark-500 px-3 py-2.5 rounded-lg">Voltar à busca</button>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-gradient-to-br from-neon/5 to-dark-800/60 border border-neon/20 rounded-2xl p-5 text-xs text-zinc-400 leading-relaxed space-y-2">
        <p><span className="text-neon font-bold">Objetivo:</span> gerar páginas de combo com qualquer produto (ergômetros, turf, sled…) pra enviar de forma profissional no WhatsApp, com total e prévia.</p>
        <p><span className="text-neon font-bold">Como usar:</span> adicione produtos do Bling acima → marque os do combo → (opcional) desconto → copie o link ou salve o combo.</p>
      </div>

      {/* Seleção */}
      <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-white font-bold text-sm">1. Escolha os produtos do combo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {todos.map(p => {
            const on = sel.includes(p.alias);
            const ehExtra = aliasExtras.has(p.alias);
            const extraRow = ehExtra ? extras.find(e => e.alias === p.alias) : null;
            return (
              <div key={p.alias}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'bg-neon/10 border-neon/40' : 'bg-dark-900 border-dark-700 hover:border-dark-500'}`}>
                <button onClick={() => toggle(p.alias)} className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-neon text-dark-950' : 'border border-dark-600'}`}>
                    {on && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <span className="text-xl">{p.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{p.nome}</p>
                    <p className="text-zinc-500 text-[11px]">{p.preco_avista > 0 ? `${fmtBRL(p.preco_avista)} à vista` : 'Sob consulta'}{ehExtra ? ' · do Bling' : ''}</p>
                  </div>
                </button>
                {ehExtra && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => editarExtra(extraRow)} title="Editar / trocar imagem"
                      className="p-1.5 text-zinc-600 hover:text-neon hover:bg-neon/10 rounded-lg"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removerExtra(extraRow.id, p.alias)} title="Remover dos combos"
                      className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
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
            <div className="bg-dark-900 rounded-xl p-4"><p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Total à vista</p><p className="text-neon text-xl font-black">{fmtBRL(t.avistaFinal)}</p></div>
            <div className="bg-dark-900 rounded-xl p-4"><p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">10x sem juros</p><p className="text-white text-xl font-black">{fmtBRL(t.parcela)}</p></div>
            <div className="bg-dark-900 rounded-xl p-4"><p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Economia</p><p className="text-neon text-xl font-black">{fmtBRL(t.economia)}</p></div>
            <div className="bg-dark-900 rounded-xl p-4"><p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Itens</p><p className="text-white text-xl font-black">{produtos.length}</p></div>
          </div>
          {t.temConsultar && <p className="text-amber-400/80 text-[11px]">* Itens sob consulta não entram no total somado.</p>}

          <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-3">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Link do combo</p>
            <p className="text-neon text-xs font-mono break-all">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copiar(link)} className="flex items-center gap-1.5 text-xs text-neon bg-neon/15 hover:bg-neon/25 px-3 py-2 rounded-lg font-bold transition-all"><Copy className="w-3.5 h-3.5" /> Copiar link</button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-300 border border-dark-600 hover:border-dark-500 px-3 py-2 rounded-lg transition-all"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a>
              <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 px-3 py-2 rounded-lg transition-all"><MessageCircle className="w-3.5 h-3.5" /> Enviar no WhatsApp</a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do combo (ex: Kit Hyrox Completo)"
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

const inp = 'w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-neon/50';
function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
