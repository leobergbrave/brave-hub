import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Globe, Edit2, ExternalLink, Plus, Trash2, ChevronDown, ChevronRight,
  Save, Loader2, RefreshCw, Check, X, Phone, FileText, Layout, Package, Code2
} from 'lucide-react';

function convertImgUrl(url) {
  if (!url) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w800`;
  return url;
}

const BADGE_CORES = [
  { label: 'Verde Neon',  cls: 'bg-neon text-dark-950'    },
  { label: 'Laranja',     cls: 'bg-orange-500 text-white' },
  { label: 'Roxo',        cls: 'bg-purple-500 text-white' },
  { label: 'Azul',        cls: 'bg-blue-600 text-white'   },
  { label: 'Vermelho',    cls: 'bg-red-500 text-white'    },
];

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label>}
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-500/50 transition-colors placeholder:text-zinc-700"
      />
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label>}
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-500/50 transition-colors placeholder:text-zinc-700 resize-none"
      />
    </div>
  );
}

export default function LandingPagesTab() {
  const [paginas, setPaginas]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editando, setEditando]       = useState(null);
  const [form, setForm]               = useState(null);
  const [salvando, setSalvando]       = useState(false);
  const [prodAberto, setProdAberto]   = useState(null);
  const [secao, setSecao]             = useState('geral');
  const [jsonRaw, setJsonRaw]         = useState('');
  const [jsonErro, setJsonErro]       = useState('');
  const [toast, setToast]             = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchPaginas = async () => {
    setLoading(true);
    const { data } = await supabase.from('landing_pages_config').select('*').order('titulo');
    setPaginas(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPaginas(); }, []);

  const iniciarEdicao = (pagina) => {
    setEditando(pagina.id);
    const cfg = JSON.parse(JSON.stringify(pagina.config || {}));
    setForm({ ...pagina, config: cfg });
    setJsonRaw(JSON.stringify(cfg, null, 2));
    setJsonErro('');
    setSecao('geral');
    setProdAberto(null);
  };

  const cancelar = () => { setEditando(null); setForm(null); };

  const salvar = async () => {
    if (!editando || !form) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('landing_pages_config')
        .update({ titulo: form.titulo, wa_number: form.wa_number, config: form.config, updated_at: new Date().toISOString() })
        .eq('id', editando);
      if (error) throw error;
      showToast('✅ Página salva com sucesso!');
      await fetchPaginas();
    } catch (e) {
      showToast('❌ ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  // ── Helpers de update ──────────────────────────────────────
  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setHero = (key, val) =>
    setForm(f => ({ ...f, config: { ...f.config, hero: { ...f.config.hero, [key]: val } } }));

  const setProd = (idx, key, val) =>
    setForm(f => {
      const ps = [...(f.config.produtos || [])];
      ps[idx] = { ...ps[idx], [key]: val };
      return { ...f, config: { ...f.config, produtos: ps } };
    });

  const setFeature = (pIdx, fIdx, val) =>
    setForm(f => {
      const ps = [...(f.config.produtos || [])];
      const fs = [...(ps[pIdx].features || [])];
      fs[fIdx] = val;
      ps[pIdx] = { ...ps[pIdx], features: fs };
      return { ...f, config: { ...f.config, produtos: ps } };
    });

  const addFeature = (pIdx) =>
    setForm(f => {
      const ps = [...(f.config.produtos || [])];
      ps[pIdx] = { ...ps[pIdx], features: [...(ps[pIdx].features || []), ''] };
      return { ...f, config: { ...f.config, produtos: ps } };
    });

  const removeFeature = (pIdx, fIdx) =>
    setForm(f => {
      const ps = [...(f.config.produtos || [])];
      ps[pIdx] = { ...ps[pIdx], features: (ps[pIdx].features || []).filter((_, i) => i !== fIdx) };
      return { ...f, config: { ...f.config, produtos: ps } };
    });

  const addProduto = () =>
    setForm(f => ({
      ...f,
      config: {
        ...f.config,
        produtos: [...(f.config.produtos || []), {
          nome: 'Novo Produto', badge: 'Novidade', badgeCls: 'bg-orange-500',
          tagline: '', emoji: '🏋️', alias: '', img_url: '',
          preco_normal: 0, preco_avista: 0, parcelas_num: 0, parcelas_valor: 0,
          features: [''],
        }],
      },
    }));

  const removeProduto = (idx) => {
    setForm(f => {
      const ps = [...(f.config.produtos || [])].filter((_, i) => i !== idx);
      return { ...f, config: { ...f.config, produtos: ps } };
    });
    if (prodAberto === idx) setProdAberto(null);
  };

  // ── Render ─────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-dark-700 border border-dark-600 text-white text-sm px-5 py-3 rounded-xl shadow-xl animate-fade-in-up">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Landing Pages</h2>
            <p className="text-zinc-600 text-xs">Edite conteúdo, links e produtos sem mexer no código</p>
          </div>
        </div>
        <button onClick={fetchPaginas} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-dark-700 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Lista de páginas */}
      {!editando && (
        <div className="space-y-3">
          {paginas.length === 0 && (
            <div className="text-center py-12 text-zinc-600 text-sm">
              Nenhuma landing page cadastrada.<br />
              <span className="text-zinc-700 text-xs">Execute a migration no Supabase para começar.</span>
            </div>
          )}
          {paginas.map(p => (
            <div key={p.id} className="bg-dark-800/60 border border-dark-700 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-zinc-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-bold text-sm">{p.titulo}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs font-mono mt-0.5">{p.url_path}</p>
                  {p.updated_at && (
                    <p className="text-zinc-700 text-[10px] mt-1">
                      Atualizado: {new Date(p.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={p.url_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white border border-dark-600 hover:border-dark-500 px-3 py-2 rounded-lg transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ver
                </a>
                <button
                  onClick={() => iniciarEdicao(p)}
                  className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-white bg-orange-500/10 hover:bg-orange-500 px-3 py-2 rounded-lg transition-all font-bold"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {editando && form && (
        <div className="space-y-5">

          {/* Barra superior do editor */}
          <div className="flex items-center justify-between bg-dark-800/60 border border-dark-700 rounded-2xl px-5 py-4">
            <div>
              <p className="text-white font-bold text-sm">{form.titulo}</p>
              <p className="text-zinc-600 text-xs font-mono">{form.url_path}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={form.url_path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white border border-dark-600 px-3 py-2 rounded-lg transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Preview
              </a>
              <button onClick={cancelar} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white border border-dark-600 px-3 py-2 rounded-lg transition-all">
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex items-center gap-1.5 text-xs text-white bg-orange-500 hover:bg-orange-400 disabled:opacity-50 px-4 py-2 rounded-lg transition-all font-bold"
              >
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
          </div>

          {/* Tabs de seção */}
          <div className="flex gap-1 bg-dark-800/40 border border-dark-700 rounded-xl p-1">
            {[
              { id: 'geral',    label: 'Geral',    Icon: Phone },
              { id: 'hero',     label: 'Hero',     Icon: Layout },
              { id: 'produtos', label: 'Produtos', Icon: Package },
              { id: 'avancado', label: 'Avançado', Icon: Code2 },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setSecao(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  secao === id ? 'bg-dark-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── SEÇÃO GERAL ── */}
          {secao === 'geral' && (
            <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-5">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-orange-400" />
                Configurações Gerais
              </h3>
              <Input
                label="Título interno da página"
                value={form.titulo}
                onChange={v => setF('titulo', v)}
                placeholder="LP Ergômetros"
              />
              <Input
                label="Número WhatsApp (com DDI — ex: 554199999999)"
                value={form.wa_number}
                onChange={v => setF('wa_number', v)}
                placeholder="554199999999"
              />
              <Input
                label="URL da página (somente leitura)"
                value={form.url_path}
                onChange={() => {}}
                placeholder="/lp/ergometros"
              />
              <Textarea
                label="Mensagem padrão do WhatsApp (CTA geral)"
                value={form.config.wa_msg_geral}
                onChange={v => setForm(f => ({ ...f, config: { ...f.config, wa_msg_geral: v } }))}
                placeholder="Olá! Vi os ergômetros da Brave e gostaria de solicitar uma cotação."
                rows={2}
              />
            </div>
          )}

          {/* ── SEÇÃO HERO ── */}
          {secao === 'hero' && (
            <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-5">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Layout className="w-4 h-4 text-orange-400" />
                Seção Hero (topo da página)
              </h3>
              <Input
                label="Badge (pequena etiqueta acima do título)"
                value={form.config.hero?.badge}
                onChange={v => setHero('badge', v)}
                placeholder="Linha Ergômetros 2025"
              />
              <Input
                label="Título — linha 1"
                value={form.config.hero?.headline_1}
                onChange={v => setHero('headline_1', v)}
                placeholder="Ergômetros Profissionais"
              />
              <Input
                label="Título — linha 2 (destaque laranja)"
                value={form.config.hero?.headline_2}
                onChange={v => setHero('headline_2', v)}
                placeholder="para o seu Box"
              />
              <Textarea
                label="Descrição"
                value={form.config.hero?.desc}
                onChange={v => setHero('desc', v)}
                rows={3}
                placeholder="Equipamentos desenvolvidos para suportar os treinos mais intensos..."
              />
            </div>
          )}

          {/* ── SEÇÃO PRODUTOS ── */}
          {secao === 'produtos' && (
            <div className="space-y-4">
              {(form.config.produtos || []).map((prod, pIdx) => (
                <div key={pIdx} className="bg-dark-800/60 border border-dark-700 rounded-2xl overflow-hidden">
                  {/* Cabeçalho do produto */}
                  <button
                    onClick={() => setProdAberto(prodAberto === pIdx ? null : pIdx)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-dark-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prod.emoji || '🏋️'}</span>
                      <div className="text-left">
                        <p className="text-white font-bold text-sm">{prod.nome}</p>
                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${prod.badgeCls || 'bg-orange-500'}`}>
                          {prod.badge}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); removeProduto(pIdx); }}
                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {prodAberto === pIdx
                        ? <ChevronDown className="w-4 h-4 text-zinc-500" />
                        : <ChevronRight className="w-4 h-4 text-zinc-500" />
                      }
                    </div>
                  </button>

                  {/* Formulário do produto */}
                  {prodAberto === pIdx && (
                    <div className="px-5 pb-5 space-y-4 border-t border-dark-700">
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <Input label="Nome do produto" value={prod.nome} onChange={v => setProd(pIdx, 'nome', v)} />
                        <Input label="Emoji" value={prod.emoji} onChange={v => setProd(pIdx, 'emoji', v)} placeholder="🏋️" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Texto do badge" value={prod.badge} onChange={v => setProd(pIdx, 'badge', v)} placeholder="Pronta Entrega" />
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cor do badge</label>
                          <select
                            value={prod.badgeCls || 'bg-orange-500 text-white'}
                            onChange={e => setProd(pIdx, 'badgeCls', e.target.value)}
                            className="w-full bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-500/50"
                          >
                            {BADGE_CORES.map(c => (
                              <option key={c.cls} value={c.cls}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Input
                        label="Tagline (frase abaixo do nome)"
                        value={prod.tagline}
                        onChange={v => setProd(pIdx, 'tagline', v)}
                        placeholder="Força, resistência e resultados imediatos."
                      />
                      <Input
                        label="Alias para orçamento (ex: remo, bikeerg)"
                        value={prod.alias}
                        onChange={v => setProd(pIdx, 'alias', v)}
                        placeholder="remo"
                      />
                      <Input
                        label="URL da foto do produto"
                        value={prod.img_url || ''}
                        onChange={v => setProd(pIdx, 'img_url', v)}
                        placeholder="https://..."
                      />
                      {prod.img_url && (
                        <img src={convertImgUrl(prod.img_url)} alt={prod.nome}
                          className="w-full h-40 object-contain rounded-xl border border-dark-600 mt-1 bg-dark-900" />
                      )}

                      {/* Preços */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Preços</label>
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Preço Normal (R$)"
                            type="number"
                            value={prod.preco_normal || ''}
                            onChange={v => setProd(pIdx, 'preco_normal', parseFloat(v) || 0)}
                            placeholder="7990"
                          />
                          <Input
                            label="Promoção À Vista (R$)"
                            type="number"
                            value={prod.preco_avista || ''}
                            onChange={v => setProd(pIdx, 'preco_avista', parseFloat(v) || 0)}
                            placeholder="5990"
                          />
                          <Input
                            label="Nº de Parcelas"
                            type="number"
                            value={prod.parcelas_num || ''}
                            onChange={v => setProd(pIdx, 'parcelas_num', parseInt(v) || 0)}
                            placeholder="10"
                          />
                          <Input
                            label="Valor da Parcela (R$)"
                            type="number"
                            value={prod.parcelas_valor || ''}
                            onChange={v => setProd(pIdx, 'parcelas_valor', parseFloat(v) || 0)}
                            placeholder="699"
                          />
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Features (checkmarks)</label>
                          <button
                            onClick={() => addFeature(pIdx)}
                            className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Adicionar
                          </button>
                        </div>
                        {(prod.features || []).map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <input
                              value={feat}
                              onChange={e => setFeature(pIdx, fIdx, e.target.value)}
                              className="flex-1 bg-dark-900 border border-dark-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/50 transition-colors"
                              placeholder="Característica do produto"
                            />
                            <button onClick={() => removeFeature(pIdx, fIdx)} className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Adicionar produto */}
              <button
                onClick={addProduto}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-dark-600 hover:border-orange-500/40 text-zinc-600 hover:text-orange-400 py-4 rounded-2xl transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Adicionar Produto
              </button>
            </div>
          )}

          {/* ── SEÇÃO AVANÇADO (JSON) ── */}
          {secao === 'avancado' && (
            <div className="bg-dark-800/60 border border-dark-700 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
                  <Code2 className="w-4 h-4 text-orange-400" />
                  Editor JSON Avançado
                </h3>
                <p className="text-zinc-600 text-xs">Edite diretamente o config JSON — útil para preços, tiers, depoimentos e campos específicos de cada página.</p>
              </div>
              {jsonErro && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-4 py-3 font-mono">
                  {jsonErro}
                </div>
              )}
              <textarea
                value={jsonRaw}
                onChange={e => {
                  setJsonRaw(e.target.value);
                  setJsonErro('');
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setForm(f => ({ ...f, config: parsed }));
                  } catch {
                    setJsonErro('JSON inválido — corrija antes de salvar.');
                  }
                }}
                rows={24}
                spellCheck={false}
                className="w-full bg-dark-950 border border-dark-600 text-emerald-400 text-xs rounded-xl px-4 py-4 font-mono focus:outline-none focus:border-orange-500/50 transition-colors resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Botão salvar fixo no bottom */}
          <div className="flex justify-end pt-2">
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Página
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
