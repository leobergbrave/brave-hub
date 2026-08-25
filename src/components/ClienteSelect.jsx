import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, X, UserCheck, Copy, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

/* Seletor de cliente cadastrado para o gerador de orçamento.
   A diretoria exige orçamento com nome completo, CPF/CNPJ, email e endereço
   com CEP — este componente busca o cadastro (feito pelo cliente em /cadastro)
   e expõe o que ainda falta via dadosFaltantes(). */

export function dadosFaltantes(cliente) {
  if (!cliente) return ['cliente cadastrado'];
  const falta = [];
  const df = cliente.dados_fiscais || {};
  if (!(cliente.nome || '').trim().includes(' ')) falta.push('nome completo');
  const doc = String(cliente.cpf_cnpj || df.cpfCnpj || '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) falta.push('CPF/CNPJ');
  if (!String(cliente.email || '').includes('@')) falta.push('email');
  const temEndereco = (df.logradouro || '').trim() && String(df.cep || '').replace(/\D/g, '').length === 8
    && (df.cidade || '').trim() && (df.estado || '').trim();
  if (!temEndereco) falta.push('endereço com CEP');
  return falta;
}

export default function ClienteSelect({ cliente, onSelect }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBuscando(true);
      const q = busca.trim();
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, telefone, email, cpf_cnpj, dados_fiscais')
        .or(`nome.ilike.%${q}%,telefone.ilike.%${q.replace(/\D/g, '') || q}%`)
        .order('atualizado_em', { ascending: false })
        .limit(8);
      setResultados(data || []);
      setBuscando(false);
      setAberto(true);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [busca]);

  const copiarLinkCadastro = () => {
    navigator.clipboard.writeText(`${window.location.origin}/cadastro`).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const falta = cliente ? dadosFaltantes(cliente) : [];

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
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
            {buscando && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />}
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              onFocus={() => resultados.length && setAberto(true)}
              placeholder="Buscar por nome ou telefone..."
              className="w-full bg-dark-900 border border-dark-600 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-dark-500" />
          </div>
          {aberto && resultados.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-600 rounded-xl overflow-hidden shadow-xl">
              {resultados.map((c) => {
                const f = dadosFaltantes(c);
                return (
                  <button key={c.id} type="button"
                    onClick={() => { onSelect(c); setBusca(''); setAberto(false); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-dark-700 cursor-pointer border-b border-dark-700/50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white truncate">{c.nome}</span>
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
          {aberto && !buscando && busca.trim().length >= 2 && resultados.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-xs text-zinc-500">
              Nenhum cliente encontrado. Envie o link de cadastro pra ele preencher os dados.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
