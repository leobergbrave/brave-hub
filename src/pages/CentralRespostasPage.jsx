import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, Video, MessageSquareText, Package, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ═══════════════════════════════════════════════
   BRAVE HUB — Central de Respostas
   Abre a partir do alerta do vigia: ?nome=Anna&p=bikeerg,remo
   Mostra o roteiro de atendimento + conteudo dos produtos, prontos pra copiar.
   ═══════════════════════════════════════════════ */

const ALIAS_LABEL = {
  bikeerg: 'Bike Erg', remo: 'Remo Indoor', skierg: 'Ski Erg',
  storm: 'Storm Bike', estcv: 'Esteira Curva', escada: 'Escada',
};
const ORDEM = ['estcv', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'];

function CopiarBtn({ texto, label = 'Copiar', full = false }) {
  const [ok, setOk] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(texto || '').then(() => {
      setOk(true); setTimeout(() => setOk(false), 1500);
    }).catch(() => {});
  };
  return (
    <button onClick={copiar}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${full ? 'w-full' : ''} ${ok ? 'bg-neon/20 text-neon border border-neon/40' : 'bg-neon text-dark-950 hover:brightness-110'}`}>
      {ok ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {ok ? 'Copiado!' : label}
    </button>
  );
}

export default function CentralRespostasPage() {
  const [sp] = useSearchParams();
  const nome = sp.get('nome') || '';
  const pParam = sp.get('p') || '';

  const [blocos, setBlocos] = useState([]);
  const [conteudos, setConteudos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState(() =>
    new Set(pParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  );

  useEffect(() => {
    (async () => {
      try {
        const [rb, pc] = await Promise.all([
          supabase.from('resposta_blocos').select('*').eq('ativo', true).order('ordem'),
          supabase.from('produtos_conteudo').select('*').eq('ativo', true),
        ]);
        if (rb.error) throw rb.error;
        if (pc.error) throw pc.error;
        setBlocos(rb.data || []);
        setConteudos(pc.data || []);
      } catch (e) {
        setErro(e.message || 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const nomeCurto = nome.split(' ')[0] || '';
  const conteudoDe = (a) => conteudos.find((c) => c.alias === a);
  const produtosTexto = useMemo(() => {
    const nomes = [...sel].map((a) => conteudoDe(a)?.nome || ALIAS_LABEL[a] || a);
    return nomes.join(', ');
  }, [sel, conteudos]);

  const preencher = (t) => String(t || '')
    .replace(/\{nome\}/g, nomeCurto || 'tudo bem?')
    .replace(/\{produtos\}/g, produtosTexto || 'seus equipamentos');

  const toggle = (a) => setSel((prev) => {
    const n = new Set(prev);
    n.has(a) ? n.delete(a) : n.add(a);
    return n;
  });

  const selecionados = ORDEM.filter((a) => sel.has(a));

  return (
    <div className="min-h-screen bg-dark-950 text-white pb-16">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-neon/15 flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 text-neon" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Central de Respostas</h1>
            <p className="text-dark-400 text-sm">{nome ? `Atendimento — ${nome}` : 'Roteiro de atendimento'}</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-dark-400 py-10 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        )}
        {erro && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">{erro}</div>}

        {!loading && !erro && (
          <>
            {/* Seletor de produtos */}
            <div className="bg-dark-900 border border-dark-700 rounded-2xl p-4 mb-5">
              <p className="text-xs font-bold text-dark-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" /> Produtos deste lead
              </p>
              <div className="flex flex-wrap gap-2">
                {ORDEM.map((a) => (
                  <button key={a} onClick={() => toggle(a)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${sel.has(a) ? 'bg-neon/15 border-neon/50 text-neon' : 'bg-dark-800 border-dark-600 text-dark-300'}`}>
                    {conteudoDe(a)?.nome || ALIAS_LABEL[a]}
                  </button>
                ))}
              </div>
            </div>

            {/* Roteiro */}
            <p className="text-xs font-bold text-dark-400 uppercase tracking-wide mb-2">Roteiro (copie o passo que precisar)</p>
            <div className="space-y-3 mb-6">
              {blocos.map((b) => {
                const texto = preencher(b.texto);
                return (
                  <div key={b.id} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-semibold text-neon">{b.ordem}. {b.titulo}</span>
                      <CopiarBtn texto={texto} />
                    </div>
                    <p className="text-sm text-dark-200 whitespace-pre-wrap leading-relaxed">{texto}</p>
                  </div>
                );
              })}
              {!blocos.length && <p className="text-dark-500 text-sm">Nenhum bloco cadastrado ainda.</p>}
            </div>

            {/* Conteudo dos produtos selecionados */}
            {selecionados.length > 0 && (
              <>
                <p className="text-xs font-bold text-dark-400 uppercase tracking-wide mb-2">Conteúdo dos produtos</p>
                <div className="space-y-3">
                  {selecionados.map((a) => {
                    const c = conteudoDe(a);
                    if (!c) return null;
                    return (
                      <div key={a} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
                        <p className="font-bold mb-3">{c.nome}</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {c.video_url && (
                            <>
                              <a href={c.video_url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold bg-dark-800 border border-dark-600 text-dark-200 hover:border-neon/50">
                                <Video className="w-4 h-4" /> Abrir vídeo <ExternalLink className="w-3 h-3" />
                              </a>
                              <CopiarBtn texto={c.video_url} label="Copiar link do vídeo" />
                            </>
                          )}
                          {c.specs && <CopiarBtn texto={c.specs} label="Copiar specs" />}
                        </div>
                        {c.specs && (
                          <details className="text-sm text-dark-300">
                            <summary className="cursor-pointer text-dark-400 mb-1">ver specs</summary>
                            <p className="whitespace-pre-wrap leading-relaxed mt-2">{c.specs}</p>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
