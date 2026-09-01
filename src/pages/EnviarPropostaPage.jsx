import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Share2, Download, Loader2, CheckCircle2, FileText, RefreshCw, Copy, Send, MessageSquareText, Package, Check } from 'lucide-react';
import LogoBrave from '../components/LogoBrave';

/* Central de Atendimento para o CELULAR (/enviar ou /atendimento).
   No computador o consultor tem o userscript, que anexa proposta, vídeo e
   texto direto na conversa do FSS. No celular ele usa os apps nativos (FSS,
   WhatsApp Business), onde extensão não existe — então a ponte é dupla:
   · Compartilhar/copiar: entrega o arquivo ao menu do sistema e o texto ao
     clipboard, e o consultor escolhe o app.
   · Enviar direto: o servidor manda via BotConversa no WhatsApp do cliente
     (só para conversas do número BotConversa; o FSS tem número próprio). */

const TIPOS = [
  { campo: 'bling_avista_pdf', tipo: 'avista', rotulo: 'À vista', numCampo: 'bling_avista_numero' },
  { campo: 'bling_prazo_pdf', tipo: 'prazo', rotulo: 'A prazo', numCampo: 'bling_prazo_numero' },
  { campo: 'proposta_pdf_path', tipo: 'unica', rotulo: 'Proposta', numCampo: 'bling_proposta_numero' },
];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

function nomeArquivo(orc, t) {
  const sufixo = { avista: ' - A vista', prazo: ' - A prazo', unica: '' }[t.tipo];
  return semAcento(`Proposta ${orc[t.numCampo] || ''} - ${orc.cliente || 'Cliente'}${sufixo}`)
    .replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80) + '.pdf';
}

async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch { return false; }
}

const ABAS = [
  { id: 'propostas', rotulo: 'Propostas', Icon: FileText },
  { id: 'produtos', rotulo: 'Produtos', Icon: Package },
  { id: 'rapidas', rotulo: 'Rápidas', Icon: MessageSquareText },
];

export default function EnviarPropostaPage() {
  const [aba, setAba] = useState('propostas');
  const [orcamentos, setOrcamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const [aviso, setAviso] = useState('');

  const [catalogo, setCatalogo] = useState(null); // { itens, rapidas }
  const [copiado, setCopiado] = useState('');     // id do último item copiado
  const [telefone, setTelefone] = useState(() => localStorage.getItem('atendimento_tel') || '');

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

  useEffect(() => {
    fetch('/api/bling?acao=produtos_fss')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setCatalogo(j); })
      .catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('atendimento_tel', telefone); }, [telefone]);

  const marcarCopiado = (id) => { setCopiado(id); setTimeout(() => setCopiado(''), 2500); };

  const termo = busca.trim().toLowerCase();
  const lista = orcamentos.filter((o) => !termo
    || (o.cliente || '').toLowerCase().includes(termo)
    || String(o.payload?.telefoneCliente || '').includes(termo.replace(/\D/g, '')));

  /* navigator.share com arquivo é o que abre o menu do sistema. Existe no
     Android (Chrome) e no iPhone (Safari), mas não em todo navegador — por
     isso sempre há o fallback de baixar. */
  const compartilharArquivos = async (arquivos, titulo) => {
    if (navigator.canShare && navigator.canShare({ files: arquivos })) {
      await navigator.share({ files: arquivos, title: titulo });
      return true;
    }
    arquivos.forEach((f, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 600));
    return false;
  };

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
      const compartilhou = await compartilharArquivos(arquivos, `Proposta — ${orc.cliente}`);
      if (!compartilhou) setAviso('Este navegador não abre o menu de compartilhar — os arquivos foram baixados.');
    } catch (e) {
      // Cancelar o menu de compartilhamento dispara AbortError: não é erro.
      if (e.name !== 'AbortError') setAviso(e.message || 'Não consegui preparar os arquivos.');
    } finally {
      setOcupado(null);
    }
  };

  /* Mesmo botão do userscript no PC: o servidor manda os PDFs no WhatsApp do
     cliente via BotConversa. Confirmação antes, porque envia de verdade. */
  const enviarPropostaWhats = async (orc) => {
    if (!window.confirm(`Enviar a proposta de ${orc.cliente} no WhatsApp do cliente agora?`)) return;
    setAviso('');
    setOcupado(orc.slug + ':whats');
    try {
      const r = await fetch('/api/bling?acao=enviar_pdf_cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: orc.slug }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha no envio');
      setAviso(`✅ Proposta enviada no WhatsApp de ${orc.cliente}.`);
      carregar();
    } catch (e) {
      setAviso(`❌ ${e.message}`);
    } finally {
      setOcupado(null);
    }
  };

  const baixar = (orc, t) => {
    const a = document.createElement('a');
    a.href = `/api/bling?acao=proposta_pdf&slug=${orc.slug}&tipo=${t.tipo}`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* Produto: copia o texto ANTES de abrir a folha (precisa estar no gesto do
     toque) e compartilha o vídeo — no WhatsApp o texto vira a legenda colada;
     no iPhone + FSS o caminho é Salvar Vídeo e anexar pela galeria. */
  const compartilharProduto = async (item) => {
    setAviso('');
    setOcupado(item.id);
    try {
      await copiarTexto(item.texto);
      marcarCopiado(item.id);
      if (!item.video) { setAviso('Este produto ainda não tem vídeo — o texto foi copiado.'); return; }
      const r = await fetch(item.video);
      if (!r.ok) throw new Error('não consegui baixar o vídeo');
      const file = new File([await r.blob()], `${item.id}.mp4`, { type: 'video/mp4' });
      const compartilhou = await compartilharArquivos([file], item.titulo);
      if (!compartilhou) setAviso('Este navegador não abre o menu de compartilhar — o vídeo foi baixado e o texto copiado.');
    } catch (e) {
      if (e.name !== 'AbortError') setAviso(e.message || 'Não consegui preparar o vídeo.');
    } finally {
      setOcupado(null);
    }
  };

  const enviarProdutoDireto = async (item) => {
    const tel = telefone.replace(/\D/g, '');
    if (tel.length < 10) { setAviso('Preencha o WhatsApp do cliente (com DDD) no campo acima.'); return; }
    if (!window.confirm(`Enviar "${item.titulo}" (vídeo + texto) para ${telefone} agora?`)) return;
    setAviso('');
    setOcupado(item.id + ':whats');
    try {
      const r = await fetch('/api/bling?acao=enviar_produto_cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: tel, id: item.id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha no envio');
      setAviso(`✅ ${item.titulo} enviado no WhatsApp ${telefone}.`);
    } catch (e) {
      setAviso(`❌ ${e.message}`);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white pb-16">
      <header className="sticky top-0 z-10 bg-dark-950/95 backdrop-blur border-b border-dark-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <LogoBrave className="h-6 w-auto" />
            <span className="text-sm font-bold uppercase tracking-wide">Atendimento</span>
          </div>
          <button onClick={carregar} className="p-2 text-zinc-400 active:text-white cursor-pointer" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <nav className="grid grid-cols-3 gap-1 bg-dark-900 border border-dark-700 rounded-xl p-1">
          {ABAS.map(({ id, rotulo, Icon }) => (
            <button key={id} onClick={() => { setAba(id); setAviso(''); }}
              className={`flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg cursor-pointer transition-colors ${aba === id ? 'bg-neon text-dark-950' : 'text-zinc-400 active:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {rotulo}
            </button>
          ))}
        </nav>
        {aba === 'propostas' && (
          <div className="relative mt-3">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente por nome ou telefone..."
              className="w-full bg-dark-900 border border-dark-700 text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-neon/50"
            />
          </div>
        )}
      </header>

      {aviso && (
        <div className="mx-4 mt-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-3 py-2">
          {aviso}
        </div>
      )}

      {aba === 'propostas' && (
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

                <button
                  onClick={() => enviarPropostaWhats(o)}
                  disabled={ocupado === o.slug + ':whats'}
                  className="w-full flex items-center justify-center gap-2 mt-2 bg-dark-800 border border-dark-600 text-zinc-200 font-bold text-sm py-3 rounded-xl active:bg-dark-700 disabled:opacity-50 cursor-pointer"
                >
                  {ocupado === o.slug + ':whats'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    : <><Send className="w-4 h-4" /> Enviar no WhatsApp do cliente</>}
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

          <footer className="pt-3 text-center">
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              <FileText className="w-3 h-3 inline mr-1" />
              <strong className="text-zinc-500">Compartilhar</strong> abre o menu do sistema (FSS, WhatsApp...);{' '}
              <strong className="text-zinc-500">Enviar no WhatsApp</strong> manda sozinho pelo número da BRAVE.
            </p>
          </footer>
        </main>
      )}

      {aba === 'produtos' && (
        <main className="px-4 pt-3 space-y-3">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-3">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              WhatsApp do cliente (para enviar direto)
            </label>
            <input
              type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)}
              placeholder="(48) 99999-9999"
              className="w-full bg-dark-950 border border-dark-700 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-neon/50"
            />
          </div>

          {!catalogo && (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando produtos...
            </div>
          )}

          {(catalogo?.itens || []).map((item) => (
            <section key={item.id} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
              <h2 className="text-sm font-bold leading-snug mb-2">{item.titulo}</h2>
              <details className="mb-3">
                <summary className="text-[11px] text-zinc-500 cursor-pointer select-none">ver texto da mensagem</summary>
                <pre className="mt-2 text-[11px] text-zinc-400 whitespace-pre-wrap font-sans bg-dark-950 border border-dark-800 rounded-xl p-3">{item.texto}</pre>
              </details>

              <button
                onClick={() => compartilharProduto(item)}
                disabled={ocupado === item.id}
                className="w-full flex items-center justify-center gap-2 bg-neon/15 border border-neon/40 text-neon font-bold text-sm py-3.5 rounded-xl active:bg-neon/25 disabled:opacity-50 cursor-pointer"
              >
                {ocupado === item.id
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando vídeo...</>
                  : <><Share2 className="w-4 h-4" /> Compartilhar vídeo + copiar texto</>}
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => { await copiarTexto(item.texto); marcarCopiado(item.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 border border-dark-700 rounded-lg py-2.5 active:bg-dark-800 cursor-pointer"
                >
                  {copiado === item.id ? <><Check className="w-3 h-3 text-green-400" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar texto</>}
                </button>
                <button
                  onClick={() => enviarProdutoDireto(item)}
                  disabled={ocupado === item.id + ':whats'}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-zinc-200 border border-dark-600 bg-dark-800 rounded-lg py-2.5 active:bg-dark-700 disabled:opacity-50 cursor-pointer"
                >
                  {ocupado === item.id + ':whats'
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</>
                    : <><Send className="w-3 h-3" /> Enviar direto</>}
                </button>
              </div>
            </section>
          ))}

          <footer className="pt-3 text-center">
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              {IOS
                ? <>No iPhone o app do FSS não aparece na folha: toque em <strong className="text-zinc-500">Salvar Vídeo</strong> e anexe pela galeria — o texto já está copiado para colar.</>
                : <>O texto é copiado junto: depois de compartilhar o vídeo, cole a mensagem como legenda ou em seguida.</>}
            </p>
          </footer>
        </main>
      )}

      {aba === 'rapidas' && (
        <main className="px-4 pt-3 space-y-3">
          {!catalogo && (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          )}
          {(catalogo?.rapidas || []).map((m) => (
            <section key={m.id} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
              <h2 className="text-sm font-bold leading-snug mb-2">{m.titulo}</h2>
              <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-sans bg-dark-950 border border-dark-800 rounded-xl p-3 mb-3">{m.texto}</pre>
              <button
                onClick={async () => { await copiarTexto(m.texto); marcarCopiado(m.id); }}
                className="w-full flex items-center justify-center gap-2 bg-neon/15 border border-neon/40 text-neon font-bold text-sm py-3 rounded-xl active:bg-neon/25 cursor-pointer"
              >
                {copiado === m.id ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar mensagem</>}
              </button>
            </section>
          ))}
        </main>
      )}
    </div>
  );
}
