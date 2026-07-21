import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2, MessageCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════
   BRAVE HUB — Página de Comparação de Produtos
   Rota /compara/:slug — conteúdo vem da tabela `comparacoes` (jsonb),
   então dá pra criar comparações novas sem mexer em código.
   ═══════════════════════════════════════════════ */

const WHATSAPP = 'https://wa.me/5514998681119';

function Card({ p, destaque }) {
  return (
    <div className={`rounded-2xl border p-5 ${destaque ? 'border-neon/50 bg-neon/[0.04]' : 'border-dark-700 bg-dark-900'}`}>
      {p.tag && (
        <span className={`inline-block text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-md mb-3 ${destaque ? 'bg-neon/20 text-neon' : 'bg-dark-800 text-dark-400'}`}>
          {p.tag}
        </span>
      )}
      <h2 className="text-xl font-bold text-white mb-3">{p.nome}</h2>

      {Array.isArray(p.precos) && p.precos.length > 0 && (
        <div className="mb-4 space-y-1">
          {p.precos.map((pr, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dark-800 pb-1">
              <span className="text-sm text-dark-400">{pr.label}</span>
              <span className={`font-bold whitespace-nowrap ${destaque ? 'text-neon' : 'text-white'}`}>{pr.valor}</span>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(p.specs) && (
        <ul className="space-y-2 mb-4">
          {p.specs.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <Check className={`w-4 h-4 mt-0.5 flex-none ${destaque ? 'text-neon' : 'text-dark-500'}`} />
              <span className="text-dark-200">
                <span className="text-dark-400">{s.label}:</span> {s.valor}
              </span>
            </li>
          ))}
        </ul>
      )}

      {p.quando && (
        <div className="rounded-xl bg-dark-800/60 border border-dark-700 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-dark-500 mb-1">Escolha se…</p>
          <p className="text-sm text-dark-200 leading-relaxed">{p.quando}</p>
        </div>
      )}
    </div>
  );
}

export default function ComparacaoPage() {
  const { slug } = useParams();
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('comparacoes').select('*').eq('slug', slug).eq('ativo', true).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Comparação não encontrada.');
        setComp(data);
      } catch (e) {
        setErro(e.message || 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center text-dark-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
  if (erro) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <p className="text-red-300 text-sm">{erro}</p>
    </div>
  );

  const c = comp.conteudo || {};

  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
        <header className="mb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-black leading-tight">{comp.titulo}</h1>
          {comp.subtitulo && <p className="text-dark-400 mt-2">{comp.subtitulo}</p>}
        </header>

        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <Card p={c.a || {}} destaque={!!c.a?.destaque} />
          <Card p={c.b || {}} destaque={!!c.b?.destaque} />
        </div>

        {c.destaque && (
          <div className="rounded-2xl border border-neon/40 bg-neon/[0.06] p-5 mb-6 text-center">
            <p className="font-bold text-neon mb-1">{c.destaque.titulo}</p>
            {c.destaque.texto && <p className="text-sm text-dark-200">{c.destaque.texto}</p>}
            {c.destaque.valor && <p className="text-3xl font-black mt-2">{c.destaque.valor}</p>}
          </div>
        )}

        {Array.isArray(c.observacoes) && c.observacoes.length > 0 && (
          <div className="rounded-2xl border border-dark-700 bg-dark-900 p-4 mb-6">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-dark-500 mb-2">
              <Info className="w-4 h-4" /> Observações
            </p>
            <ul className="space-y-1">
              {c.observacoes.map((o, i) => (
                <li key={i} className="text-sm text-dark-300">• {o}</li>
              ))}
            </ul>
          </div>
        )}

        <a href={WHATSAPP} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-neon text-dark-950 font-bold py-4 hover:brightness-110 transition">
          <MessageCircle className="w-5 h-5" /> Falar com um consultor
        </a>
        <p className="text-center text-dark-600 text-xs mt-4">BRAVE Equipamentos</p>
      </div>
    </div>
  );
}
