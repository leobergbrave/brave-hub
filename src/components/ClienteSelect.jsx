import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, X, UserCheck, Copy, CheckCircle2, AlertTriangle, Loader2, Clock, Sparkles } from 'lucide-react';

/* Seletor de cliente cadastrado para o gerador de orçamento.
   A diretoria exige orçamento com nome completo, CPF/CNPJ, email e endereço
   com CEP — este componente busca o cadastro (feito pelo cliente em /cadastro)
   e expõe o que ainda falta via dadosFaltantes().

   Também aceita CADASTRO POR COLAGEM: colando no campo de busca um bloco como
   "nome / rua e número / CEP / CPF", o HUB interpreta (regras + ViaCEP, com IA
   de reforço) e abre um card de conferência antes de gravar. */

export function dadosFaltantes(cliente) {
  if (!cliente) return ['cliente cadastrado'];
  const falta = [];
  const df = cliente.dados_fiscais || {};
  if (!(cliente.nome || '').trim().includes(' ')) falta.push('nome completo');
  const doc = String(cliente.cpf_cnpj || df.cpfCnpj || '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) falta.push('CPF/CNPJ');
  // Cadastro feito pelo consultor (colagem) não exige e-mail — decisão do Léo
  // em 04/09/2026; o formulário preenchido pelo próprio cliente segue exigindo.
  if (df.origemCadastro !== 'interno' && !String(cliente.email || '').includes('@')) falta.push('email');
  const temEndereco = (df.logradouro || '').trim() && String(df.cep || '').replace(/\D/g, '').length === 8
    && (df.cidade || '').trim() && (df.estado || '').trim();
  if (!temEndereco) falta.push('endereço com CEP');
  return falta;
}

const CAMPOS = 'id, nome, telefone, email, cpf_cnpj, dados_fiscais';

/* O que é busca e o que é cadastro colado: nome tem uma linha e nenhum rótulo;
   um bloco de dados tem quebra de linha ou traz "CPF"/"CNPJ"/"CEP" escrito. */
const pareceBloco = (t) => /\n/.test(t) || /\bc(?:pf|npj)\b/i.test(t) || /\bcep\b/i.test(t);

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export default function ClienteSelect({ cliente, onSelect }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [recentes, setRecentes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const timer = useRef(null);
  const timerColagem = useRef(null);
  const toqueY = useRef(null);

  // Cadastro por colagem
  const [rascunho, setRascunho] = useState(null);      // campos interpretados, editáveis
  const [interpretando, setInterpretando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroColagem, setErroColagem] = useState('');
  const [jaExiste, setJaExiste] = useState(null);      // cliente com o mesmo CPF

  // Últimos cadastros: é quase sempre pra eles que o orçamento seguinte vai.
  useEffect(() => {
    supabase
      .from('clientes')
      .select(CAMPOS)
      .order('criado_em', { ascending: false })
      .limit(3)
      .then(({ data }) => setRecentes(data || []));
  }, []);

  useEffect(() => {
    const q = busca.trim();
    // Bloco colado não é termo de busca — quem cuida dele é a interpretação.
    if (q.length < 2 || pareceBloco(q)) { setResultados([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from('clientes')
        .select(CAMPOS)
        .or(`nome.ilike.%${q}%,telefone.ilike.%${q.replace(/\D/g, '') || q}%`)
        .order('atualizado_em', { ascending: false })
        .limit(8);
      setResultados(data || []);
      setBuscando(false);
      setAberto(true);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [busca]);

  /* Colou um bloco? Interpreta sozinho — o consultor não precisa clicar em nada
     a mais. O atraso evita disparar a cada tecla de quem digita à mão. */
  useEffect(() => {
    const q = busca.trim();
    if (rascunho || q.length < 12 || !pareceBloco(q)) return;
    clearTimeout(timerColagem.current);
    timerColagem.current = setTimeout(() => interpretar(q), 600);
    return () => clearTimeout(timerColagem.current);
  }, [busca, rascunho]);

  async function interpretar(texto) {
    setInterpretando(true);
    setErroColagem('');
    try {
      const r = await fetch('/api/bling?acao=cadastro_interpretar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'não consegui interpretar');
      setRascunho({ tipoPessoa: 'F', ...j.dados });
      setAberto(false);

      // Mesmo CPF já cadastrado: o salvamento ATUALIZA, então avisamos antes.
      const doc = soDigitos(j.dados.cpfCnpj);
      if (doc) {
        const { data } = await supabase.from('clientes').select(CAMPOS).eq('cpf_cnpj', doc).maybeSingle();
        setJaExiste(data || null);
      } else {
        setJaExiste(null);
      }
    } catch (e) {
      setErroColagem(e.message);
    } finally {
      setInterpretando(false);
    }
  }

  const setCampo = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }));

  const faltaNoRascunho = () => {
    if (!rascunho) return [];
    const f = [];
    if (!String(rascunho.nomeCompleto || '').trim().includes(' ')) f.push('nome completo');
    const doc = soDigitos(rascunho.cpfCnpj);
    if (doc.length !== 11 && doc.length !== 14) f.push('CPF/CNPJ');
    if (soDigitos(rascunho.cep).length !== 8) f.push('CEP');
    if (!String(rascunho.logradouro || '').trim()) f.push('endereço');
    if (!String(rascunho.numero || '').trim()) f.push('número');
    return f;
  };

  async function cadastrar() {
    setSalvando(true);
    setErroColagem('');
    try {
      const r = await fetch('/api/cadastro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 'interno' libera o e-mail — quem cadastra é o consultor, não o cliente.
        body: JSON.stringify({ ...rascunho, origemCadastro: 'interno' }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha ao cadastrar');

      /* O cadastro grava e devolve só o status; buscamos a linha para entregar
         o cliente já selecionado ao orçamento. */
      const doc = soDigitos(rascunho.cpfCnpj);
      const { data } = await supabase.from('clientes').select(CAMPOS)
        .eq('cpf_cnpj', doc).order('atualizado_em', { ascending: false }).limit(1).maybeSingle();
      if (!data) throw new Error('cadastrado, mas não consegui recuperar o cliente — busque pelo nome');

      escolher(data);
      setRascunho(null);
      setJaExiste(null);
    } catch (e) {
      setErroColagem(e.message);
    } finally {
      setSalvando(false);
    }
  }

  const cancelarColagem = () => { setRascunho(null); setJaExiste(null); setErroColagem(''); setBusca(''); };

  const copiarLinkCadastro = () => {
    navigator.clipboard.writeText(`${window.location.origin}/cadastro`).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const escolher = (c) => { onSelect(c); setBusca(''); setAberto(false); };

  const falta = cliente ? dadosFaltantes(cliente) : [];
  const inputCls = 'w-full bg-dark-950 border border-dark-600 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-neon/50';
  const rotuloCls = 'block text-[10px] text-zinc-500 mb-1';

  return (
    <div className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-400">Cliente cadastrado <span className="text-red-400">*</span></span>
        <button type="button" onClick={copiarLinkCadastro}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-neon cursor-pointer">
          {copiado ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copiado ? 'Link copiado!' : 'Copiar link de cadastro'}
        </button>
      </div>

      {cliente ? (
        <div className={`flex items-start justify-between gap-2 rounded-xl px-4 py-3 border ${falta.length ? 'bg-amber-500/5 border-amber-500/30' : 'bg-green-500/5 border-green-500/30'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <UserCheck className={`w-4 h-4 shrink-0 ${falta.length ? 'text-amber-400' : 'text-green-400'}`} />
              <span className="text-sm text-white font-semibold truncate">{cliente.nome}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {[cliente.telefone, cliente.email].filter(Boolean).join(' · ') || 'sem contato'}
            </div>
            {falta.length > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-amber-400 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> Falta: {falta.join(', ')} — peça pra completar em /cadastro
              </div>
            )}
          </div>
          <button type="button" onClick={() => onSelect(null)} className="text-zinc-500 hover:text-white cursor-pointer shrink-0 p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : rascunho ? (
        /* ── Card de conferência: nada é gravado antes daqui ── */
        <div className="rounded-xl border border-neon/30 bg-neon/[0.03] p-3.5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-neon">
              <Sparkles className="w-3.5 h-3.5" /> Confira os dados antes de cadastrar
            </span>
            <button type="button" onClick={cancelarColagem} className="text-zinc-500 hover:text-white cursor-pointer p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {jaExiste && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2 mb-3">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              Esse CPF/CNPJ já é de <strong className="font-semibold">{jaExiste.nome}</strong> — os dados serão atualizados, sem duplicar.
            </p>
          )}

          <div className="space-y-2.5">
            <div>
              <label className={rotuloCls}>Nome completo</label>
              <input className={inputCls} value={rascunho.nomeCompleto || ''} onChange={(e) => setCampo('nomeCompleto', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={rotuloCls}>CPF / CNPJ</label>
                <input className={inputCls} value={rascunho.cpfCnpj || ''} onChange={(e) => setCampo('cpfCnpj', e.target.value)} />
              </div>
              <div>
                <label className={rotuloCls}>Telefone</label>
                <input className={inputCls} value={rascunho.telefone || ''} onChange={(e) => setCampo('telefone', e.target.value)} placeholder="opcional" />
              </div>
            </div>
            <div>
              <label className={rotuloCls}>E-mail <span className="text-zinc-600">(opcional)</span></label>
              <input className={inputCls} value={rascunho.email || ''} onChange={(e) => setCampo('email', e.target.value)} placeholder="opcional" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={rotuloCls}>CEP</label>
                <input className={inputCls} value={rascunho.cep || ''} onChange={(e) => setCampo('cep', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={rotuloCls}>Logradouro</label>
                <input className={inputCls} value={rascunho.logradouro || ''} onChange={(e) => setCampo('logradouro', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={rotuloCls}>Número</label>
                <input className={inputCls} value={rascunho.numero || ''} onChange={(e) => setCampo('numero', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={rotuloCls}>Complemento</label>
                <input className={inputCls} value={rascunho.complemento || ''} onChange={(e) => setCampo('complemento', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={rotuloCls}>Bairro</label>
                <input className={inputCls} value={rascunho.bairro || ''} onChange={(e) => setCampo('bairro', e.target.value)} />
              </div>
              <div>
                <label className={rotuloCls}>Cidade</label>
                <input className={inputCls} value={rascunho.cidade || ''} onChange={(e) => setCampo('cidade', e.target.value)} />
              </div>
              <div>
                <label className={rotuloCls}>UF</label>
                <input maxLength={2} className={inputCls} value={rascunho.estado || ''} onChange={(e) => setCampo('estado', e.target.value.toUpperCase())} />
              </div>
            </div>
          </div>

          {faltaNoRascunho().length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-400 mt-3">
              <AlertTriangle className="w-3 h-3 shrink-0" /> Falta preencher: {faltaNoRascunho().join(', ')}
            </p>
          )}
          {erroColagem && <p className="text-[11px] text-red-400 mt-3">❌ {erroColagem}</p>}

          <div className="flex gap-2 mt-3">
            <button type="button" onClick={cadastrar} disabled={salvando || faltaNoRascunho().length > 0}
              className="flex-1 flex items-center justify-center gap-2 bg-neon text-dark-950 font-bold text-xs py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              {salvando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cadastrando...</> : <>✓ {jaExiste ? 'Atualizar e usar' : 'Cadastrar e usar'}</>}
            </button>
            <button type="button" onClick={cancelarColagem}
              className="px-4 text-xs text-zinc-400 border border-dark-600 rounded-lg hover:text-white cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
            {(buscando || interpretando) && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />}
            <textarea rows={pareceBloco(busca) ? 4 : 1} value={busca} onChange={(e) => setBusca(e.target.value)}
              onFocus={() => resultados.length && setAberto(true)}
              placeholder="Buscar por nome ou telefone — ou cole os dados do cliente"
              className="w-full resize-none bg-dark-900 border border-dark-600 text-white text-sm rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
          </div>

          {interpretando && (
            <p className="flex items-center gap-1.5 text-[11px] text-neon mt-2">
              <Sparkles className="w-3 h-3 shrink-0" /> Lendo os dados colados...
            </p>
          )}
          {erroColagem && !interpretando && (
            <p className="text-[11px] text-red-400 mt-2">❌ {erroColagem} — confira o texto colado.</p>
          )}

          {aberto && resultados.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-600 rounded-xl overflow-hidden shadow-xl">
              {resultados.map((c) => {
                const f = dadosFaltantes(c);
                return (
                  /* No celular, tocar no resultado logo apos digitar so fechava o
                     teclado: a tela refluia e o clique se perdia. Por isso o toque
                     e tratado direto (e ignorado se o dedo arrastou, para rolar a
                     lista nao selecionar quem estiver embaixo). */
                  <button key={c.id} type="button"
                    onPointerDown={(e) => {
                      if (e.pointerType !== 'touch') { e.preventDefault(); escolher(c); }
                    }}
                    onTouchStart={(e) => { toqueY.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => {
                      const dy = Math.abs(e.changedTouches[0].clientY - (toqueY.current ?? e.changedTouches[0].clientY));
                      if (dy < 8) { e.preventDefault(); escolher(c); }
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-dark-700 active:bg-dark-600 cursor-pointer border-b border-dark-700/50 last:border-0 select-none">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white leading-snug break-words">{c.nome}</span>
                      {f.length === 0
                        ? <span className="text-[10px] text-green-400 shrink-0">✓ completo</span>
                        : <span className="text-[10px] text-amber-400 shrink-0">falta {f.length}</span>}
                    </div>
                    <span className="text-[11px] text-zinc-500">{[c.telefone, c.email].filter(Boolean).join(' · ')}</span>
                  </button>
                );
              })}
            </div>
          )}
          {aberto && !buscando && !pareceBloco(busca) && busca.trim().length >= 2 && resultados.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-xs text-zinc-500">
              Nenhum cliente encontrado. Cole aqui os dados dele (nome, endereço, CEP, CPF) que eu cadastro — ou envie o link de cadastro.
            </div>
          )}

          {/* Atalho pros últimos cadastros — some assim que você começa a buscar */}
          {!busca.trim() && recentes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" /> Últimos:
              </span>
              {recentes.map((c) => {
                const f = dadosFaltantes(c);
                return (
                  <button key={c.id} type="button" onClick={() => escolher(c)}
                    title={f.length ? `Cadastro incompleto — falta: ${f.join(', ')}` : 'Cadastro completo'}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-2 rounded-lg border cursor-pointer transition-colors active:opacity-70 ${
                      f.length
                        ? 'text-amber-300 border-amber-500/25 hover:bg-amber-500/10'
                        : 'text-green-300 border-green-500/25 hover:bg-green-500/10'
                    }`}>
                    {f.length ? <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> : <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
                    <span className="max-w-[200px] truncate">{c.nome}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
