import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Files, Download, Loader2, Trash2, Link2, Sparkles, Copy, Check,
  AlertTriangle, Package, ExternalLink, Info, X, RefreshCw,
} from 'lucide-react';

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ModelosTab() {
  const [modelos, setModelos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Importação
  const [numeros, setNumeros] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // Geração de link (orçamento | proposta) para um modelo
  const [gerar, setGerar] = useState(null); // { modelo, tipo }
  const [form, setForm] = useState({ nome: '', cep: '', telefone: '', desconto_avista: 15 });
  const [gerando, setGerando] = useState(false);
  const [linkGerado, setLinkGerado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orcamentos_modelo')
      .select('*')
      .eq('ativo', true)
      .order('atualizado_em', { ascending: false, nullsFirst: false })
      .order('criado_em', { ascending: false });
    setModelos(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const importar = async () => {
    const nums = numeros.split(/[\s,;]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean);
    if (nums.length === 0) return;
    setImportando(true);
    setResultado(null);
    try {
      const r = await fetch('/api/bling?acao=importar_modelos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeros: nums }),
      });
      const j = await r.json();
      setResultado(j);
      if (j.ok) { setNumeros(''); load(); }
    } catch (err) {
      setResultado({ ok: false, error: err.message });
    } finally {
      setImportando(false);
    }
  };

  const excluir = async (id) => {
    if (!confirm('Remover este modelo? (não afeta a proposta no Bling)')) return;
    await supabase.from('orcamentos_modelo').update({ ativo: false }).eq('id', id);
    load();
  };

  const abrirGerar = (modelo, tipo) => {
    setGerar({ modelo, tipo });
    setForm({ nome: '', cep: '', telefone: '', desconto_avista: 15 });
    setLinkGerado(null);
    setCopiado(false);
  };

  const executarGeracao = async () => {
    if (!gerar) return;
    setGerando(true);
    setLinkGerado(null);
    try {
      const acao = gerar.tipo === 'orcamento' ? 'gerar_orcamento' : 'gerar_proposta';
      const r = await fetch(`/api/bling?acao=${acao}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_id: gerar.modelo.id, ...form }),
      });
      const j = await r.json();
      if (j.ok) setLinkGerado(j);
      else setLinkGerado({ ok: false, error: j.error });
    } catch (err) {
      setLinkGerado({ ok: false, error: err.message });
    } finally {
      setGerando(false);
    }
  };

  const copiar = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-neon/10"><Files className="w-6 h-6 text-neon" /></div>
        <h1 className="text-2xl font-bold text-white">Modelos de Orçamento</h1>
      </div>

      {/* Bloco informativo (constituição B.L.A.S.T.) */}
      <div className="bg-neon/[0.04] border border-neon/15 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-neon shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 space-y-2">
            <p><strong className="text-white">O que faz:</strong> importa as propostas comerciais que você já
              tem prontas no Bling e as deixa salvas como <em>modelos</em> reutilizáveis. A partir de cada modelo você
              gera, em 1 clique, o <strong className="text-neon">link de orçamento</strong> (com cálculo de frete por CEP)
              ou a <strong className="text-neon">proposta premium</strong> para enviar ao lead.</p>
            <p><strong className="text-white">Como usar:</strong> no Bling, abra <em>Vendas → Propostas Comerciais</em>,
              copie o <strong>número</strong> de cada modelo, cole abaixo (um por linha ou separados por vírgula) e clique
              em <strong>Importar do Bling</strong>. Os preços usados são sempre os <strong>atuais do catálogo</strong>.</p>
            <p><strong className="text-white">Como testar rápido:</strong> importe a proposta de número
              <strong className="text-neon"> 3747</strong> (BOX FULL BRAVE) — deve trazer o modelo com todos os itens
              vinculados. Depois clique em <em>Gerar link de orçamento</em>, informe um nome e um CEP, e abra o link.</p>
          </div>
        </div>
      </div>

      {/* Importação */}
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 mb-6">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Importar do Bling</p>
        <textarea
          value={numeros}
          onChange={(e) => setNumeros(e.target.value)}
          placeholder="Números das propostas — ex: 3747, 5933  (um por linha ou separados por vírgula)"
          rows={3}
          className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50 resize-y"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={importar}
            disabled={importando || !numeros.trim()}
            className="flex items-center gap-2 bg-neon text-dark-950 text-sm font-black rounded-xl px-4 py-2.5 hover:bg-neon/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {importando ? 'Importando… (pode levar alguns segundos)' : 'Importar do Bling'}
          </button>
          <button onClick={load} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm cursor-pointer">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>

        {/* Resultado da importação */}
        {resultado && (
          <div className="mt-4 space-y-2">
            {!resultado.ok && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {resultado.error || 'Falha na importação.'}
              </p>
            )}
            {(resultado.resultados || []).map((r) => (
              <div key={r.numero} className={`text-sm rounded-xl px-3 py-2.5 border ${
                r.ok ? 'bg-dark-900/60 border-dark-700/50' : 'bg-red-500/[0.06] border-red-500/20'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.ok
                    ? <Check className="w-4 h-4 text-neon shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span className="font-semibold text-white">Proposta #{r.numero}</span>
                  {r.ok
                    ? <span className="text-zinc-400">— {r.atualizado ? 'atualizada' : 'importada'}: {r.itens} itens{r.faltantes ? `, ${r.faltantes} sem vínculo` : ''}</span>
                    : <span className="text-red-300">— {r.motivo || r.erro}</span>}
                </div>
                {r.faltantesDetalhe && r.faltantesDetalhe.length > 0 && (
                  <div className="mt-1.5 ml-6 text-xs text-amber-400/90">
                    <p className="flex items-center gap-1 mb-0.5"><AlertTriangle className="w-3 h-3" /> Itens sem produto no catálogo (sincronize no Bling/Produtos):</p>
                    <ul className="list-disc list-inside text-amber-300/70 space-y-0.5">
                      {r.faltantesDetalhe.map((f, i) => (
                        <li key={i}>{f.descricao}{f.codigo ? ` (${f.codigo})` : ''} × {f.quantidade}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de modelos */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
      ) : modelos.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-10">Nenhum modelo ainda. Importe uma proposta do Bling acima.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modelos.map((m) => {
            const nFalt = (m.itens_faltantes || []).length;
            return (
              <div key={m.id} className="bg-dark-800/60 border border-dark-700/50 rounded-2xl p-5 flex flex-col hover:border-neon/25 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.nome}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {(m.itens || []).length} itens</span>
                      {m.bling_proposta_numero && <span className="text-zinc-600">· Bling #{m.bling_proposta_numero}</span>}
                      {m.total_bling ? <span className="text-zinc-600">· {brl(m.total_bling)}</span> : null}
                    </p>
                  </div>
                  <button onClick={() => excluir(m.id)} className="text-zinc-600 hover:text-red-400 cursor-pointer shrink-0" title="Remover modelo">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {nFalt > 0 && (
                  <p className="mt-2 text-[11px] text-amber-400/90 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {nFalt} item(ns) sem vínculo no catálogo
                  </p>
                )}

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-dark-700/40">
                  <button
                    onClick={() => abrirGerar(m, 'orcamento')}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-neon/10 text-neon text-xs font-bold rounded-lg px-2 py-2 hover:bg-neon/20 transition-all cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Link de orçamento
                  </button>
                  <button
                    onClick={() => abrirGerar(m, 'proposta')}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-dark-700/60 text-zinc-200 text-xs font-bold rounded-lg px-2 py-2 hover:bg-dark-700 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Proposta premium
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de geração */}
      {gerar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setGerar(null)} />
          <div className="relative w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl p-6 shadow-2xl">
            <button onClick={() => setGerar(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-2 mb-1">
              {gerar.tipo === 'orcamento' ? <Link2 className="w-5 h-5 text-neon" /> : <Sparkles className="w-5 h-5 text-neon" />}
              <h2 className="text-lg font-bold text-white">{gerar.tipo === 'orcamento' ? 'Link de orçamento' : 'Proposta premium'}</h2>
            </div>
            <p className="text-xs text-zinc-500 mb-4 truncate">Modelo: {gerar.modelo.nome}</p>

            {!linkGerado ? (
              <div className="space-y-3">
                <input placeholder="Nome do lead" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
                <input placeholder="WhatsApp (opcional)" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
                {gerar.tipo === 'orcamento' && (
                  <input placeholder="CEP do lead (para o frete)" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })}
                    className="w-full bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
                )}
                <label className="block">
                  <span className="text-xs text-zinc-500">Desconto à vista (%)</span>
                  <input type="number" value={form.desconto_avista} onChange={(e) => setForm({ ...form, desconto_avista: Number(e.target.value) })}
                    className="w-full mt-1 bg-dark-800 border border-dark-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-neon/50" />
                </label>
                <button onClick={executarGeracao} disabled={gerando || !form.nome.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-neon text-dark-950 text-sm font-black rounded-xl px-4 py-3 hover:bg-neon/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50">
                  {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {gerando ? 'Gerando…' : 'Gerar link'}
                </button>
              </div>
            ) : linkGerado.ok ? (
              <div className="space-y-3">
                <p className="text-sm text-neon flex items-center gap-2"><Check className="w-4 h-4" /> Link pronto!</p>
                <div className="flex items-center gap-2 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2.5">
                  <span className="text-xs text-zinc-300 truncate flex-1">{linkGerado.link}</span>
                  <button onClick={() => copiar(linkGerado.link)} className="text-neon hover:text-neon/80 cursor-pointer shrink-0">
                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {linkGerado.resumo && (
                  <p className="text-xs text-zinc-500">
                    {gerar.tipo === 'orcamento'
                      ? `${linkGerado.resumo.itens} itens · frete ${brl(linkGerado.resumo.frete)} · total à vista ${brl(linkGerado.resumo.total_avista)}`
                      : `${linkGerado.resumo.equipamentos} equipamentos · total à vista ${brl(linkGerado.resumo.total_avista)}`}
                  </p>
                )}
                <a href={linkGerado.link} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-dark-700/60 text-zinc-200 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-dark-700 transition-all cursor-pointer">
                  <ExternalLink className="w-4 h-4" /> Abrir link
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {linkGerado.error}</p>
                <button onClick={() => setLinkGerado(null)} className="text-sm text-zinc-400 hover:text-white cursor-pointer">Tentar de novo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
