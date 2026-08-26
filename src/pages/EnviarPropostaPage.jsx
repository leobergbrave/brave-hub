import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Share2, Download, Loader2, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import LogoBrave from '../components/LogoBrave';

/* Página de envio para o CELULAR.
   No computador o consultor tem o userscript, que anexa a proposta direto na
   conversa do FSS. No celular ele usa o app nativo do FSS, onde extensão não
   existe — então a ponte é o compartilhamento do próprio sistema: a página
   entrega o PDF ao menu "Compartilhar" e ele escolhe o FSS, o WhatsApp ou o
   que quiser. Sem baixar, procurar na pasta e anexar. */

const TIPOS = [
  { campo: 'bling_avista_pdf', tipo: 'avista', rotulo: 'À vista', numCampo: 'bling_avista_numero' },
  { campo: 'bling_prazo_pdf', tipo: 'prazo', rotulo: 'A prazo', numCampo: 'bling_prazo_numero' },
  { campo: 'proposta_pdf_path', tipo: 'unica', rotulo: 'Proposta', numCampo: 'bling_proposta_numero' },
];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function nomeArquivo(orc, t) {
  const sufixo = { avista: ' - A vista', prazo: ' - A prazo', unica: '' }[t.tipo];
  return semAcento(`Proposta ${orc[t.numCampo] || ''} - ${orc.cliente || 'Cliente'}${sufixo}`)
    .replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80) + '.pdf';
}

export default function EnviarPropostaPage() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState('');

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase
      .from('orcamentos_salvos')
      .select('slug, cliente, criado_em, payload, bling_avista_pdf, bling_avista_numero, bling_prazo_pdf, bling_prazo_numero, proposta_pdf_path, bling_proposta_numero, proposta_pdf_enviado_em')
      .or(TIPOS.map((t) => `${t.campo}.not.is.null`).join(','))
      .order('criado_em', { ascending: false })
      .limit(40);
    setOrcamentos(data || []);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, []);

  const termo = busca.trim().toLowerCase();
  const lista = orcamentos.filter((o) => !termo
    || (o.cliente || '').toLowerCase().includes(termo)
    || String(o.payload?.telefoneCliente || '').includes(termo.replace(/\D/g, '')));

  /* navigator.share com arquivo é o que abre o menu do sistema. Existe no
     Android (Chrome) e no iPhone (Safari), mas não em todo navegador — por
     isso sempre há o botão de baixar ao lado. */
  const compartilhar = async (orc) => {
    setAviso('');
    setOcupado(orc.slug);
    try {
      const disponiveis = TIPOS.filter((t) => orc[t.campo]);
      const arquivos = [];
      for (const t of disponiveis) {
        const url = `/api/bling?acao=proposta_pdf&slug=${orc.slug}&tipo=${t.tipo}&v=${Date.now()}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`não consegui baixar a proposta ${t.rotulo}`);
        arquivos.push(new File([await r.blob()], nomeArquivo(orc, t), { type: 'application/pdf' }));
      }

      if (navigator.canShare && navigator.canShare({ files: arquivos })) {
        await navigator.share({
          files: arquivos,
          title: `Proposta — ${orc.cliente}`,
        });
      } else {
        // Sem compartilhamento no aparelho: baixa, e o consultor anexa na mão.
        arquivos.forEach((f, i) => setTimeout(() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          document.body.appendChild(a); a.click(); a.remove();
        }, i * 600));
        setAviso('Este navegador não abre o menu de compartilhar — os arquivos foram baixados.');
      }
    } catch (e) {
      // Cancelar o menu de compartilhamento dispara AbortError: não é erro.
      if (e.name !== 'AbortError') setAviso(e.message || 'Não consegui preparar os arquivos.');
    } finally {
      setOcupado(null);
    }
  };

  const baixar = (orc, t) => {
    const a = document.createElement('a');
    a.href = `/api/bling?acao=proposta_pdf&slug=${orc.slug}&tipo=${t.tipo}`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white pb-16">
      <header className="sticky top-0 z-10 bg-dark-950/95 backdrop-blur border-b border-dark-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <LogoBrave className="h-6 w-auto" />
            <span className="text-sm font-bold uppercase tracking-wide">Enviar proposta</span>
          </div>
          <button onClick={carregar} className="p-2 text-zinc-400 active:text-white cursor-pointer" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome ou telefone..."
            className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-neon/50"
          />
        </div>
      </header>

      {aviso && (
        <div className="mx-4 mt-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-3 py-2">
          {aviso}
        </div>
      )}

      <main className="px-4 pt-3 space-y-3">
        {carregando && orcamentos.length === 0 && (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        )}

        {!carregando && lista.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-16">
            {termo ? 'Nenhum cliente encontrado.' : 'Nenhuma proposta com PDF pronto ainda.'}
          </p>
        )}

        {lista.map((o) => {
          const disponiveis = TIPOS.filter((t) => o[t.campo]);
          const tel = String(o.payload?.telefoneCliente || '').replace(/\D/g, '');
          const data = new Date(o.criado_em).toLocaleDateString('pt-BR');
          return (
            <section key={o.slug} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-sm font-bold leading-snug break-words">{o.cliente}</h2>
                {o.proposta_pdf_enviado_em && (
                  <span className="flex items-center gap-1 text-[10px] text-green-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3" /> enviada
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mb-3">
                {data}{tel ? ` · ${tel}` : ''} · {disponiveis.length} PDF{disponiveis.length > 1 ? 's' : ''}
              </p>

              <button
                onClick={() => compartilhar(o)}
                disabled={ocupado === o.slug}
                className="w-full flex items-center justify-center gap-2 bg-neon/15 border border-neon/40 text-neon font-bold text-sm py-3.5 rounded-xl active:bg-neon/25 disabled:opacity-50 cursor-pointer"
              >
                {ocupado === o.slug
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando...</>
                  : <><Share2 className="w-4 h-4" /> Compartilhar proposta</>}
              </button>

              <div className="flex gap-2 mt-2">
                {disponiveis.map((t) => (
                  <button key={t.tipo} onClick={() => baixar(o, t)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 border border-dark-700 rounded-lg py-2.5 active:bg-dark-800 cursor-pointer">
                    <Download className="w-3 h-3" /> {t.rotulo}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="px-4 pt-6 text-center">
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          <FileText className="w-3 h-3 inline mr-1" />
          Toque em <strong className="text-zinc-500">Compartilhar</strong> e escolha o app —
          o PDF vai anexado, sem precisar baixar e procurar depois.
        </p>
      </footer>
    </div>
  );
}
