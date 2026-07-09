import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';
import { Package, Save, Loader2, X, Plus, Trash2, Check, Image as ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { ERGO_CATALOG, mergeCatalog } from '../data/ergoCatalog';

const ROW_ID = 'ergo-catalog';
const BUCKET = 'ergo-media';
const fmt = (v) => Number(v) > 0 ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const pad4 = (arr) => { const a = [...(arr || [])]; while (a.length < 4) a.push(''); return a.slice(0, 4); };

function driveThumb(url) {
  if (!url) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

export default function ProdutosErgoTab() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto]     = useState(0);
  const [toast, setToast]       = useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    supabase.from('landing_pages_config').select('config').eq('id', ROW_ID).maybeSingle()
      .then(({ data }) => setProdutos(mergeCatalog(data?.config?.produtos).map(p => ({ ...p, fotos: pad4(p.fotos) }))))
      .finally(() => setLoading(false));
  }, []);

  const set = (i, key, val) => setProdutos(ps => ps.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  const setSpec = (i, si, val) => setProdutos(ps => ps.map((p, idx) => idx === i ? { ...p, specs: p.specs.map((s, j) => j === si ? val : s) } : p));
  const addSpec = (i) => setProdutos(ps => ps.map((p, idx) => idx === i ? { ...p, specs: [...(p.specs || []), ''] } : p));
  const rmSpec = (i, si) => setProdutos(ps => ps.map((p, idx) => idx === i ? { ...p, specs: p.specs.filter((_, j) => j !== si) } : p));
  const setFoto = (i, fi, url) => setProdutos(ps => ps.map((p, idx) => idx === i ? { ...p, fotos: p.fotos.map((f, j) => j === fi ? url : f) } : p));

  const salvar = async () => {
    setSalvando(true);
    try {
      const clean = produtos.map(p => ({ ...p, fotos: (p.fotos || []).filter(Boolean), specs: (p.specs || []).filter(s => s.trim()) }));
      const { error } = await supabase.from('landing_pages_config').upsert({
        id: ROW_ID, titulo: 'Catálogo Ergômetros', url_path: '/lp/ergo', ativo: true,
        config: { produtos: clean }, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      showToast('✅ Produtos salvos! Já valem nas páginas de combo.');
    } catch (e) { showToast('❌ ' + e.message); }
    finally { setSalvando(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-neon animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {toast && <div className="fixed top-6 right-6 z-50 bg-dark-700 border border-dark-600 text-white text-sm px-5 py-3 rounded-xl shadow-xl">{toast}</div>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon/10 flex items-center justify-center"><Package className="w-5 h-5 text-neon" /></div>
          <div>
            <h2 className="text-white font-bold text-lg">Produtos Ergômetros</h2>
            <p className="text-zinc-600 text-xs">Edite detalhes, 4 fotos e 1 vídeo de cada — aparece nas páginas de combo</p>
          </div>
        </div>
        <button onClick={salvar} disabled={salvando} className="flex items-center gap-2 bg-neon hover:bg-neon-dim disabled:opacity-50 text-dark-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-all">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar tudo
        </button>
      </div>

      <div className="bg-gradient-to-br from-neon/5 to-dark-800/60 border border-neon/20 rounded-2xl p-5 text-xs text-zinc-400 leading-relaxed space-y-1.5">
        <p><span className="text-neon font-bold">Como usar:</span> abra um produto, edite os textos/preços, envie até 4 fotos e 1 vídeo (upload direto). Clique em <span className="text-white font-bold">Salvar tudo</span>.</p>
        <p><span className="text-neon font-bold">Na página do combo:</span> o cliente clica na foto para ver em tela cheia e no botão de vídeo para assistir.</p>
        <p><span className="text-amber-400 font-bold">Pré-requisito:</span> rodar a migration <span className="font-mono text-zinc-300">20260708_ergo_media_bucket.sql</span> no Supabase (cria o bucket de mídia). Sem ela, o upload falha.</p>
      </div>

      {produtos.map((p, i) => (
        <div key={p.alias} className="bg-dark-800/60 border border-dark-700 rounded-2xl overflow-hidden">
          <button onClick={() => setAberto(aberto === i ? -1 : i)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-700/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{p.emoji}</span>
              <div className="text-left">
                <p className="text-white font-bold text-sm">{p.nome}</p>
                <p className="text-zinc-600 text-[11px]">{p.preco_avista > 0 ? `${fmt(p.preco_avista)} à vista` : 'Sob consulta'} · {(p.fotos || []).filter(Boolean).length}/4 fotos{p.video ? ' · vídeo ✓' : ''}</p>
              </div>
            </div>
            {aberto === i ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
          </button>

          {aberto === i && (
            <div className="px-5 pb-6 space-y-5 border-t border-dark-700 pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome" value={p.nome} onChange={v => set(i, 'nome', v)} />
                <Field label="Emoji" value={p.emoji} onChange={v => set(i, 'emoji', v)} />
              </div>
              <Field label="Subtítulo (frase de destaque)" value={p.subtitle} onChange={v => set(i, 'subtitle', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Preço prazo/normal (R$)" type="number" value={p.preco} onChange={v => set(i, 'preco', parseFloat(v) || 0)} />
                <Field label="Preço à vista (R$)" type="number" value={p.preco_avista} onChange={v => set(i, 'preco_avista', parseFloat(v) || 0)} />
              </div>

              {/* Specs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Características</label>
                  <button onClick={() => addSpec(i)} className="text-[10px] text-neon hover:text-neon-dim flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar</button>
                </div>
                {(p.specs || []).map((s, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-neon shrink-0" />
                    <input value={s} onChange={e => setSpec(i, si, e.target.value)} className="flex-1 bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-neon/50" />
                    <button onClick={() => rmSpec(i, si)} className="p-1.5 text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>

              {/* Fotos */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Fotos (até 4) — a 1ª é a capa</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {p.fotos.map((f, fi) => (
                    <MediaSlot key={fi} kind="image" url={f} preview={driveThumb(f)} alias={p.alias} name={`foto${fi}`}
                      onDone={url => setFoto(i, fi, url)} onRemove={() => setFoto(i, fi, '')} onError={showToast} />
                  ))}
                </div>
              </div>

              {/* Vídeo */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vídeo (1)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MediaSlot kind="video" url={p.video} preview={p.video} alias={p.alias} name="video"
                    onDone={url => set(i, 'video', url)} onRemove={() => set(i, 'video', '')} onError={showToast} />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end">
        <button onClick={salvar} disabled={salvando} className="flex items-center gap-2 bg-neon hover:bg-neon-dim disabled:opacity-50 text-dark-950 font-bold text-sm px-6 py-3 rounded-xl transition-all">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar tudo
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-neon/50 transition-colors" />
    </div>
  );
}

function MediaSlot({ kind, url, preview, alias, name, onDone, onRemove, onError }) {
  const [up, setUp] = useState(false);
  const inp = useRef(null);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp(true);
    try {
      let f = file;
      if (kind === 'image' && file.type.startsWith('image/')) {
        f = await imageCompression(file, { maxSizeMB: 0.9, maxWidthOrHeight: 1920, useWebWorker: true });
      }
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `${alias}/${name}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || undefined });
      if (error) throw error;
      onDone(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (err) {
      onError('❌ Upload falhou: ' + (err.message || err) + ' — rodou a migration do bucket?');
    } finally { setUp(false); if (inp.current) inp.current.value = ''; }
  };

  if (url) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-dark-700 bg-dark-900 aspect-square">
        {kind === 'image'
          ? <img src={preview} alt="" className="w-full h-full object-cover" />
          : <video src={url} className="w-full h-full object-cover" muted />}
        <button onClick={onRemove} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
        {kind === 'video' && <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-neon text-dark-950 px-1.5 py-0.5 rounded">VÍDEO</span>}
      </div>
    );
  }
  return (
    <button onClick={() => inp.current?.click()} disabled={up}
      className="aspect-square rounded-xl border border-dashed border-dark-600 hover:border-neon/40 bg-dark-900 flex flex-col items-center justify-center gap-1.5 text-zinc-600 hover:text-neon transition-all">
      {up ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
      <span className="text-[10px] font-medium">{up ? 'Enviando…' : (kind === 'image' ? 'Enviar foto' : 'Enviar vídeo')}</span>
      <input ref={inp} type="file" accept={kind === 'image' ? 'image/*' : 'video/*'} onChange={handle} className="hidden" />
    </button>
  );
}
