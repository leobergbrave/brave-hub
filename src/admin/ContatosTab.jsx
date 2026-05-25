import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Search, Plus, Upload, X, Check, CheckSquare, Square,
  Phone, Mail, Building2, Loader2, Image,
  Flame, Thermometer, Snowflake, RefreshCw,
  MessageCircle, Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const STATUS = {
  frio:   { label: 'Frio',   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',  icon: Snowflake },
  morno:  { label: 'Morno',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20', icon: Thermometer },
  quente: { label: 'Quente', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',   icon: Flame },
};

const ORIGEM = {
  whatsapp:   { label: 'WhatsApp',   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  orcamento:  { label: 'Orçamento',  color: 'text-neon',        bg: 'bg-neon/10' },
  screenshot: { label: 'Importado',  color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  manual:     { label: 'Manual',     color: 'text-zinc-400',    bg: 'bg-zinc-500/10' },
};

function normTel(tel) {
  if (!tel) return '';
  return tel.replace(/\D/g, '');
}

function initials(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function fmtTel(tel) {
  if (!tel) return '—';
  const d = tel.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return tel;
}

const AVATAR_COLORS = [
  'from-purple-500 to-violet-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-neon/80 to-emerald-500',
];
function avatarColor(nome) {
  const sum = (nome || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default function ContatosTab() {
  const [contatos, setContatos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Stats
  const [stats, setStats] = useState({ total: 0, quente: 0, morno: 0, frio: 0 });

  // Import modal
  const [importStep, setImportStep] = useState(null); // null|'upload'|'processing'|'preview'|'saving'|'done'
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importContatos, setImportContatos] = useState([]);
  const [importSelecionados, setImportSelecionados] = useState(new Set());
  const [importSalvos, setImportSalvos] = useState(0);
  const [importErro, setImportErro] = useState('');
  const fileInputRef = useRef(null);

  // Add manual modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ nome: '', telefone: '', email: '', empresa: '', status: 'frio' });
  const [addSaving, setAddSaving] = useState(false);

  // ── Fetch ──
  const fetchContatos = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('contatos').select('*', { count: 'exact' });
      if (busca.trim()) {
        const b = busca.trim();
        q = q.or(`nome.ilike.%${b}%,telefone.ilike.%${b}%,email.ilike.%${b}%,empresa.ilike.%${b}%`);
      }
      if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus);
      if (filtroOrigem !== 'todos') q = q.eq('origem', filtroOrigem);
      q = q.order('criado_em', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, count } = await q;
      setContatos(data || []);
      setTotal(count || 0);
    } finally {
      setLoading(false);
    }
  }, [busca, filtroStatus, filtroOrigem, page]);

  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from('contatos').select('status');
    if (!data) return;
    const s = { total: data.length, quente: 0, morno: 0, frio: 0 };
    data.forEach(c => { if (s[c.status] !== undefined) s[c.status]++; });
    setStats(s);
  }, []);

  useEffect(() => { fetchContatos(); }, [fetchContatos]);
  useEffect(() => { fetchStats(); }, []);

  // ── Status change ──
  const changeStatus = async (id, status) => {
    await supabase.from('contatos').update({ status, atualizado_em: new Date().toISOString() }).eq('id', id);
    setContatos(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    fetchStats();
  };

  // ── Import: handle file ──
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImportFile(file);
    setImportPreview(URL.createObjectURL(file));
    setImportErro('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleImageFile(file);
  };

  // Captura Ctrl+V quando o modal de upload está aberto
  useEffect(() => {
    if (importStep !== 'upload') return;
    const handlePaste = (e) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (item) handleImageFile(item.getAsFile());
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importStep]);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });

  const handleExtrair = async () => {
    if (!importFile) return;
    setImportStep('processing');
    setImportErro('');
    try {
      const imageBase64 = await fileToBase64(importFile);
      const { data, error } = await supabase.functions.invoke('importar-screenshot-contatos', {
        body: { imageBase64, mimeType: importFile.type },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const lista = (data?.contatos || []).filter(c => c.nome || c.telefone);
      if (lista.length === 0) throw new Error('Nenhum contato encontrado na imagem.');
      setImportContatos(lista);
      setImportSelecionados(new Set(lista.map((_, i) => i)));
      setImportStep('preview');
    } catch (err) {
      setImportErro(err.message || 'Erro ao processar imagem.');
      setImportStep('upload');
    }
  };

  const toggleSelecionado = (i) => {
    setImportSelecionados(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleTodos = () => {
    if (importSelecionados.size === importContatos.length) {
      setImportSelecionados(new Set());
    } else {
      setImportSelecionados(new Set(importContatos.map((_, i) => i)));
    }
  };

  const handleSalvarImport = async () => {
    const lista = [...importSelecionados].map(i => importContatos[i]);
    if (lista.length === 0) return;
    setImportStep('saving');
    let salvos = 0;
    for (const c of lista) {
      const telNorm = normTel(c.telefone);
      const { error } = await supabase.from('contatos').insert({
        nome: c.nome || null,
        telefone: c.telefone || null,
        telefone_norm: telNorm || null,
        email: c.email || null,
        empresa: c.empresa || null,
        origem: 'screenshot',
      });
      if (!error) salvos++;
    }
    setImportSalvos(salvos);
    setImportStep('done');
    fetchContatos();
    fetchStats();
  };

  const closeImport = () => {
    setImportStep(null);
    setImportFile(null);
    setImportPreview(null);
    setImportContatos([]);
    setImportSelecionados(new Set());
    setImportErro('');
    setImportSalvos(0);
  };

  // ── Add manual ──
  const handleAddSave = async () => {
    if (!addForm.nome && !addForm.telefone) return;
    setAddSaving(true);
    const telNorm = normTel(addForm.telefone);
    await supabase.from('contatos').insert({
      nome: addForm.nome || null,
      telefone: addForm.telefone || null,
      telefone_norm: telNorm || null,
      email: addForm.email || null,
      empresa: addForm.empresa || null,
      status: addForm.status,
      origem: 'manual',
    });
    setAddSaving(false);
    setShowAddModal(false);
    setAddForm({ nome: '', telefone: '', email: '', empresa: '', status: 'frio' });
    fetchContatos();
    fetchStats();
  };

  const buscaDebounced = useRef(null);
  const handleBusca = (v) => {
    setBusca(v);
    if (buscaDebounced.current) clearTimeout(buscaDebounced.current);
    buscaDebounced.current = setTimeout(() => setPage(0), 400);
  };

  // ── Disparo em massa ──
  const [showDisparoModal, setShowDisparoModal] = useState(false);
  const [disparoLoading, setDisparoLoading] = useState(false);
  const [disparoProgress, setDisparoProgress] = useState({ atual: 0, total: 0, ok: 0 });
  const [disparoDone, setDisparoDone] = useState(false);

  const fetchAllFiltrados = async () => {
    let q = supabase.from('contatos').select('nome, telefone').not('telefone', 'is', null);
    if (busca.trim()) {
      const b = busca.trim();
      q = q.or(`nome.ilike.%${b}%,telefone.ilike.%${b}%,email.ilike.%${b}%,empresa.ilike.%${b}%`);
    }
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus);
    if (filtroOrigem !== 'todos') q = q.eq('origem', filtroOrigem);
    const { data } = await q;
    return (data || []).filter(c => c.telefone?.replace(/\D/g, '').length >= 10);
  };

  const handleDisparo = async () => {
    const webhookUrl = import.meta.env.VITE_BOTCONVERSA_WEBHOOK;
    if (!webhookUrl) return;
    setDisparoLoading(true);
    setDisparoDone(false);
    const todos = await fetchAllFiltrados();
    setDisparoProgress({ atual: 0, total: todos.length, ok: 0 });
    let ok = 0;
    for (let i = 0; i < todos.length; i++) {
      try {
        let tel = (todos[i].telefone || '').replace(/\D/g, '');
        if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente: todos[i].nome || '', telefone: tel }),
        });
        ok++;
      } catch {}
      setDisparoProgress({ atual: i + 1, total: todos.length, ok });
    }
    setDisparoLoading(false);
    setDisparoDone(true);
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-neon" /> Banco de Contatos
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">{stats.total.toLocaleString('pt-BR')} contatos salvos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowDisparoModal(true); setDisparoDone(false); setDisparoProgress({ atual: 0, total: 0, ok: 0 }); }}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" /> Disparar ({total.toLocaleString('pt-BR')})
          </button>
          <button
            onClick={() => { setImportStep('upload'); setImportFile(null); setImportPreview(null); }}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-colors cursor-pointer"
          >
            <Image className="w-3.5 h-3.5" /> Importar Screenshot
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-neon bg-neon/10 border border-neon/20 rounded-xl hover:bg-neon/20 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white', bg: 'bg-dark-800/60' },
          { label: 'Quente', value: stats.quente, color: 'text-red-400', bg: 'bg-red-500/5 border border-red-500/10' },
          { label: 'Morno', value: stats.morno, color: 'text-amber-400', bg: 'bg-amber-500/5 border border-amber-500/10' },
          { label: 'Frio', value: stats.frio, color: 'text-blue-400', bg: 'bg-blue-500/5 border border-blue-500/10' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{s.label}</p>
            <p className={`text-2xl font-black ${s.color} mt-1`}>{s.value.toLocaleString('pt-BR')}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={busca}
            onChange={e => handleBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, email..."
            className="w-full bg-dark-800 border border-dark-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-neon/50 placeholder:text-dark-500"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={e => { setFiltroStatus(e.target.value); setPage(0); }}
          className="bg-dark-800 border border-dark-700 text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
        >
          <option value="todos">Todos os status</option>
          <option value="quente">Quente</option>
          <option value="morno">Morno</option>
          <option value="frio">Frio</option>
        </select>
        <select
          value={filtroOrigem}
          onChange={e => { setFiltroOrigem(e.target.value); setPage(0); }}
          className="bg-dark-800 border border-dark-700 text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
        >
          <option value="todos">Todas as origens</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="orcamento">Orçamento</option>
          <option value="screenshot">Importado</option>
          <option value="manual">Manual</option>
        </select>
        <button onClick={() => fetchContatos()} className="p-2.5 bg-dark-800 border border-dark-700 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="bg-dark-800/40 border border-dark-700/40 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-neon animate-spin" />
          </div>
        ) : contatos.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-dark-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">Nenhum contato encontrado</p>
            <p className="text-xs text-dark-600 mt-1">Importe um screenshot ou adicione manualmente</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-dark-700/30">
              {contatos.map(c => {
                const or = ORIGEM[c.origem] || ORIGEM.manual;
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/20 transition-colors group">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(c.nome)} flex items-center justify-center shrink-0 text-xs font-bold text-white`}>
                      {initials(c.nome)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                      <div>
                        <p className="text-sm font-semibold text-white truncate">{c.nome || '—'}</p>
                        {c.empresa && <p className="text-[10px] text-zinc-500 truncate">{c.empresa}</p>}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {c.telefone && (
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Phone className="w-3 h-3 shrink-0" /> {fmtTel(c.telefone)}
                          </span>
                        )}
                        {c.email && (
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{c.email}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${or.bg} ${or.color}`}>
                          {or.label}
                        </span>
                        <span className="text-[10px] text-dark-500">
                          {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    {/* Status badge — clicável para ciclar */}
                    <div className="relative shrink-0">
                      <div className="flex gap-1">
                        {Object.entries(STATUS).map(([key, val]) => {
                          const Icon = val.icon;
                          const active = c.status === key;
                          return (
                            <button
                              key={key}
                              onClick={() => changeStatus(c.id, key)}
                              title={val.label}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${active ? `${val.bg} ${val.border} ${val.color}` : 'border-transparent text-dark-600 hover:text-zinc-400'}`}
                            >
                              <Icon className="w-3 h-3" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* WhatsApp link */}
                    {c.telefone && (
                      <a
                        href={`https://wa.me/55${normTel(c.telefone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-dark-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/30 text-xs text-zinc-500">
                <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 bg-dark-700/40 rounded-lg disabled:opacity-30 hover:bg-dark-700 transition-colors cursor-pointer disabled:cursor-default">
                    Anterior
                  </button>
                  <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 bg-dark-700/40 rounded-lg disabled:opacity-30 hover:bg-dark-700 transition-colors cursor-pointer disabled:cursor-default">
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal de Disparo em Massa ── */}
      {showDisparoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Disparo via BotConversa</h2>
              </div>
              {!disparoLoading && (
                <button onClick={() => setShowDisparoModal(false)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              {/* Segmento ativo */}
              <div className="bg-dark-800/60 border border-dark-700/40 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Segmento atual</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-neon/10 text-neon border border-neon/20">
                    {total.toLocaleString('pt-BR')} contatos
                  </span>
                  {filtroStatus !== 'todos' && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-700/40 text-zinc-300 border border-zinc-600/20">
                      Status: {STATUS[filtroStatus]?.label}
                    </span>
                  )}
                  {filtroOrigem !== 'todos' && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-700/40 text-zinc-300 border border-zinc-600/20">
                      Origem: {ORIGEM[filtroOrigem]?.label}
                    </span>
                  )}
                  {busca.trim() && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-700/40 text-zinc-300 border border-zinc-600/20">
                      Busca: "{busca}"
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500">Apenas contatos com telefone válido serão disparados.</p>
              </div>

              {/* Progresso */}
              {(disparoLoading || disparoDone) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{disparoDone ? 'Disparo concluído!' : `Disparando... ${disparoProgress.atual}/${disparoProgress.total}`}</span>
                    <span className="text-emerald-400 font-semibold">{disparoProgress.ok} enviados</span>
                  </div>
                  <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${disparoProgress.total ? (disparoProgress.atual / disparoProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-3">
                {!disparoDone ? (
                  <>
                    <button
                      onClick={() => setShowDisparoModal(false)}
                      disabled={disparoLoading}
                      className="flex-1 px-4 py-2.5 text-xs font-semibold text-zinc-400 bg-dark-800 border border-dark-700 rounded-xl hover:bg-dark-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDisparo}
                      disabled={disparoLoading || total === 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                    >
                      {disparoLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Disparando...</> : <><Zap className="w-3.5 h-3.5" /> Confirmar Disparo</>}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowDisparoModal(false)}
                    className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-neon/20 border border-neon/30 text-neon rounded-xl hover:bg-neon/30 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 inline mr-1" /> Fechar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {importStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Importar Contatos por Screenshot</h2>
              </div>
              <button onClick={closeImport} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {/* Step: upload */}
              {(importStep === 'upload') && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">Envie um print de qualquer CRM, planilha ou lista de contatos. A IA vai extrair os dados automaticamente.</p>

                  <div
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-dark-600 hover:border-purple-500/50 rounded-2xl p-8 text-center cursor-pointer transition-colors"
                  >
                    {importPreview ? (
                      <img src={importPreview} alt="preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-dark-500 mx-auto mb-3" />
                        <p className="text-sm text-zinc-400">Arraste, clique para selecionar ou <span className="text-purple-400 font-semibold">Ctrl+V</span> para colar</p>
                        <p className="text-[10px] text-dark-500 mt-1">PNG, JPG, WEBP</p>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => handleImageFile(e.target.files[0])} />
                  </div>

                  {importErro && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{importErro}</p>}

                  {importFile && (
                    <button onClick={handleExtrair}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3 rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
                      <Zap className="w-4 h-4" /> Extrair Contatos com IA
                    </button>
                  )}
                </div>
              )}

              {/* Step: processing */}
              {importStep === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                  </div>
                  <p className="text-sm font-semibold text-white">Analisando imagem com IA...</p>
                  <p className="text-xs text-zinc-500">Identificando contatos visíveis na tela</p>
                </div>
              )}

              {/* Step: preview */}
              {importStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{importContatos.length} contatos encontrados</p>
                    <button onClick={toggleTodos} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer">
                      {importSelecionados.size === importContatos.length
                        ? <><CheckSquare className="w-3.5 h-3.5" /> Desmarcar todos</>
                        : <><Square className="w-3.5 h-3.5" /> Selecionar todos</>}
                    </button>
                  </div>

                  <div className="border border-dark-700/40 rounded-xl divide-y divide-dark-700/30 max-h-72 overflow-y-auto">
                    {importContatos.map((c, i) => (
                      <div key={i}
                        onClick={() => toggleSelecionado(i)}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${importSelecionados.has(i) ? 'bg-purple-500/5' : 'opacity-40'}`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border ${importSelecionados.has(i) ? 'bg-purple-500 border-purple-500' : 'border-dark-600'}`}>
                          {importSelecionados.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                          <span className="text-white font-medium truncate">{c.nome || '—'}</span>
                          <span className="text-zinc-400 truncate">{fmtTel(c.telefone) || '—'}</span>
                          {c.empresa && <span className="text-zinc-500 truncate">{c.empresa}</span>}
                          {c.email && <span className="text-zinc-500 truncate">{c.email}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSalvarImport}
                    disabled={importSelecionados.size === 0}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-violet-500 text-white font-bold text-sm py-3 rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
                  >
                    <Users className="w-4 h-4" /> Salvar {importSelecionados.size} contato{importSelecionados.size !== 1 ? 's' : ''}
                  </button>
                </div>
              )}

              {/* Step: saving */}
              {importStep === 'saving' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 text-neon animate-spin" />
                  <p className="text-sm text-zinc-400">Salvando contatos...</p>
                </div>
              )}

              {/* Step: done */}
              {importStep === 'done' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-neon/10 flex items-center justify-center">
                    <Check className="w-8 h-8 text-neon" />
                  </div>
                  <p className="text-lg font-bold text-white">{importSalvos} contato{importSalvos !== 1 ? 's' : ''} importado{importSalvos !== 1 ? 's' : ''}!</p>
                  <p className="text-xs text-zinc-500">Duplicatas foram ignoradas automaticamente.</p>
                  <button onClick={closeImport} className="px-6 py-2.5 bg-neon/10 text-neon border border-neon/20 rounded-xl text-sm font-semibold hover:bg-neon/20 transition-colors cursor-pointer">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Manual Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/40">
              <h2 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4 text-neon" /> Adicionar Contato</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-dark-700 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {[
                { key: 'nome', label: 'Nome', placeholder: 'Nome do contato', icon: Users },
                { key: 'telefone', label: 'Telefone', placeholder: '(11) 99999-9999', icon: Phone },
                { key: 'email', label: 'Email', placeholder: 'email@exemplo.com', icon: Mail },
                { key: 'empresa', label: 'Empresa', placeholder: 'Nome da empresa', icon: Building2 },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1">{f.label}</label>
                  <div className="relative">
                    <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
                    <input
                      value={addForm[f.key]}
                      onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-neon/50 placeholder:text-dark-500"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium block mb-1">Status</label>
                <div className="flex gap-2">
                  {Object.entries(STATUS).map(([key, val]) => {
                    const Icon = val.icon;
                    return (
                      <button key={key} onClick={() => setAddForm(p => ({ ...p, status: key }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${addForm.status === key ? `${val.bg} ${val.border} ${val.color}` : 'border-dark-600 text-dark-500 hover:border-dark-500'}`}>
                        <Icon className="w-3 h-3" /> {val.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={handleAddSave} disabled={addSaving || (!addForm.nome && !addForm.telefone)}
                className="w-full flex items-center justify-center gap-2 bg-neon/10 border border-neon/20 text-neon font-bold text-sm py-3 rounded-xl hover:bg-neon/20 transition-colors cursor-pointer disabled:opacity-40 mt-2">
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {addSaving ? 'Salvando...' : 'Salvar Contato'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
