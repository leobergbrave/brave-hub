import { createClient } from '@supabase/supabase-js';

function fmtBRL(valor) {
  if (!valor || valor === 0) return 'Consultar';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function gerarHTML(proposta) {
  const equips = proposta.equipamentos || [];
  const primeiroNome = (proposta.lead_nome || 'Cliente').split(' ')[0];
  const totalAvista = equips.reduce((s, e) => s + (e.preco_avista || e.preco || 0), 0);
  const totalNormal = equips.reduce((s, e) => s + (e.preco || 0), 0);
  const economiaTotal = totalNormal - totalAvista;
  const parcelas = equips[0]?.parcelas || 10;
  const totalParcela = parcelas > 0 ? totalNormal / parcelas : 0;
  const validadeStr = proposta.validade_em
    ? new Date(proposta.validade_em + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const vendedorTel = (proposta.vendedor_telefone || '').replace(/\D/g, '');
  const wppTexto = encodeURIComponent(`Olá Leo! Vi minha proposta BRAVE e quero fechar negócio! 🔥`);
  const wppHref = vendedorTel ? `https://wa.me/55${vendedorTel}?text=${wppTexto}` : '#';

  const equipamentosHTML = equips.map((e, i) => {
    const specsHTML = (e.specs || []).map(s => `<li>${s}</li>`).join('');
    const precoAvista = e.preco_avista || e.preco || 0;
    const precoNormal = e.preco || 0;
    const economia = precoNormal - precoAvista;
    const imgLimpa = (e.imagem_url || '').trim();
    const temImagem = imgLimpa && imgLimpa.toUpperCase() !== 'SEM_FOTO_BLING' && /^https?:\/\//i.test(imgLimpa);

    return `
      <div class="equip-card${e.destaque ? ' destaque' : ''}">
        <div class="equip-top">
          <span class="equip-num">${String(i + 1).padStart(2, '0')}</span>
          ${e.destaque ? '<span class="destaque-badge">⭐ Mais pedido</span>' : ''}
        </div>
        ${temImagem
          ? `<img src="${e.imagem_url}" alt="${e.nome}" class="equip-img" loading="lazy" />`
          : `<div class="equip-placeholder"><span>${e.nome.charAt(0)}</span></div>`
        }
        <div class="equip-body">
          <h2 class="equip-nome">${e.nome}</h2>
          ${e.descricao ? `<p class="equip-desc">${e.descricao}</p>` : ''}
          ${specsHTML ? `<ul class="equip-specs">${specsHTML}</ul>` : ''}
          <div class="equip-price">
            ${economia > 0 ? `<span class="price-de">de ${fmtBRL(precoNormal)}</span>` : ''}
            <span class="price-avista">${fmtBRL(precoAvista)} <small>à vista</small></span>
            ${e.parcelas && e.preco_parcela ? `<span class="price-parc">ou ${e.parcelas}× de ${fmtBRL(e.preco_parcela)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposta Exclusiva — ${primeiroNome.toUpperCase()} | BRAVE Equipamentos</title>
  <meta name="description" content="${proposta.objetivo || 'Equipamentos BRAVE'} — proposta preparada exclusivamente para ${primeiroNome}.">
  <meta property="og:title" content="Proposta Exclusiva — ${primeiroNome} | BRAVE" />
  <meta property="og:description" content="${proposta.objetivo || 'Confira os equipamentos selecionados especialmente para você.'}" />
  <meta property="og:image" content="https://brave-hub-two.vercel.app/logo-orcamento.png" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BRAVE Equipamentos" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --neon: #39ff14;
      --dark: #080808;
      --dark-900: #0f0f0f;
      --dark-800: #171717;
      --dark-700: #222;
      --dark-600: #2d2d2d;
      --text: #e0e0e0;
      --muted: #777;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: var(--dark); color: var(--text); font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; }

    /* HEADER */
    .header {
      background: var(--dark-900);
      border-bottom: 1px solid #1c1c1c;
      padding: 14px 20px;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 100;
      backdrop-filter: blur(12px);
    }
    .logo { font-size: 22px; font-weight: 900; color: var(--neon); letter-spacing: -0.5px; }
    .header-pill {
      font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
      color: var(--dark); background: var(--neon); padding: 5px 12px; border-radius: 99px;
    }

    /* HERO */
    .hero {
      background: linear-gradient(160deg, #080808 0%, #0d1a08 60%, #080808 100%);
      border-bottom: 1px solid #1a2d14;
      padding: 40px 20px 36px;
      text-align: center;
      position: relative; overflow: hidden;
    }
    .hero::before {
      content: ''; position: absolute; top: -120px; left: 50%; transform: translateX(-50%);
      width: 700px; height: 700px;
      background: radial-gradient(ellipse, rgba(57,255,20,.07) 0%, transparent 65%);
      pointer-events: none;
    }
    .hero-tag {
      display: inline-block; margin-bottom: 20px;
      font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
      color: var(--neon); border: 1px solid rgba(57,255,20,.25);
      padding: 5px 14px; border-radius: 99px;
    }
    .hero h1 {
      font-size: clamp(30px, 8vw, 56px); font-weight: 900;
      line-height: 1.05; letter-spacing: -1.5px; color: #fff; margin-bottom: 14px;
    }
    .hero h1 span { color: var(--neon); }
    .hero-sub {
      font-size: clamp(14px, 3vw, 17px); color: var(--muted);
      max-width: 440px; margin: 0 auto 36px;
    }
    .hero-chips {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
    }
    .hero-chip {
      background: rgba(57,255,20,.08); border: 1px solid rgba(57,255,20,.15);
      color: rgba(57,255,20,.8); font-size: 12px; font-weight: 600;
      padding: 6px 14px; border-radius: 99px; text-transform: uppercase; letter-spacing: 1px;
    }

    /* SECTION */
    .wrap { max-width: 760px; margin: 0 auto; padding: 0 20px; }
    .section { padding: 48px 0 0; }
    .section-label {
      font-size: 10px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
      color: var(--muted); margin-bottom: 20px;
    }

    /* MENSAGEM */
    .msg-card {
      background: linear-gradient(135deg, #0d1a08, #111);
      border: 1px solid rgba(57,255,20,.15); border-radius: 16px; padding: 24px;
    }
    .msg-text { font-size: 15px; color: #ccc; line-height: 1.75; }
    .msg-autor {
      margin-top: 20px; display: flex; align-items: center; gap: 12px;
    }
    .msg-avatar {
      width: 38px; height: 38px; border-radius: 50%; background: var(--neon);
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 13px; color: var(--dark); flex-shrink: 0;
    }
    .msg-nome { font-size: 13px; font-weight: 700; color: #fff; }
    .msg-cargo { font-size: 11px; color: var(--muted); }

    /* EQUIPMENT CARDS */
    .equip-card {
      background: var(--dark-800); border: 1px solid var(--dark-700);
      border-radius: 20px; overflow: hidden; margin-bottom: 16px;
      transition: border-color .2s;
    }
    .equip-card:hover { border-color: rgba(57,255,20,.2); }
    .equip-card.destaque { border-color: rgba(57,255,20,.25); }
    .equip-top {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: var(--dark-700);
      border-bottom: 1px solid var(--dark-600);
    }
    .equip-num { font-size: 11px; font-weight: 800; color: var(--muted); letter-spacing: 2px; }
    .destaque-badge {
      font-size: 10px; font-weight: 700; color: var(--dark);
      background: var(--neon); padding: 3px 10px; border-radius: 99px;
    }
    .equip-img {
      width: 100%; max-height: 200px; object-fit: contain;
      background: #0a0a0a; display: block; padding: 18px;
    }
    .equip-placeholder {
      width: 100%; height: 140px;
      background: linear-gradient(135deg, var(--dark-900), var(--dark-700));
      display: flex; align-items: center; justify-content: center;
    }
    .equip-placeholder span {
      font-size: 56px; font-weight: 900; color: rgba(57,255,20,.15);
    }
    .equip-body { padding: 22px; }
    .equip-nome {
      font-size: clamp(18px, 4vw, 22px); font-weight: 800;
      color: #fff; letter-spacing: -0.5px; margin-bottom: 6px;
    }
    .equip-desc { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
    .equip-specs { list-style: none; margin-bottom: 20px; }
    .equip-specs li {
      font-size: 13px; color: var(--text); padding: 7px 0 7px 20px;
      border-bottom: 1px solid var(--dark-700); position: relative;
    }
    .equip-specs li:last-child { border-bottom: none; }
    .equip-specs li::before { content: '→'; position: absolute; left: 0; color: var(--neon); }
    .equip-price { display: flex; flex-direction: column; gap: 3px; }
    .price-de { font-size: 12px; color: var(--muted); text-decoration: line-through; }
    .price-avista { font-size: clamp(22px, 5vw, 28px); font-weight: 900; color: var(--neon); letter-spacing: -0.5px; }
    .price-avista small { font-size: 13px; font-weight: 500; color: var(--muted); }
    .price-parc { font-size: 12px; color: var(--muted); }

    /* RESUMO */
    .resumo-card {
      background: var(--dark-800); border: 1px solid var(--dark-700);
      border-radius: 20px; overflow: hidden; margin-bottom: 16px;
    }
    .resumo-header {
      padding: 14px 22px; background: var(--dark-700);
      font-size: 10px; font-weight: 700; letter-spacing: 2px;
      text-transform: uppercase; color: var(--muted);
    }
    .resumo-items { padding: 8px 22px; }
    .resumo-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid var(--dark-700); font-size: 14px;
    }
    .resumo-item:last-child { border-bottom: none; }
    .resumo-nome { color: var(--muted); }
    .resumo-preco { color: #fff; font-weight: 600; }
    .resumo-total {
      background: linear-gradient(135deg, #0d1a08, #111);
      border-top: 1px solid rgba(57,255,20,.15);
      padding: 22px; display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 12px;
    }
    .resumo-total-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .resumo-total-value {
      font-size: clamp(26px, 7vw, 38px); font-weight: 900;
      color: var(--neon); letter-spacing: -1px;
    }
    .economia-box { text-align: right; }
    .economia-pill {
      display: inline-block; font-size: 10px; font-weight: 700;
      color: var(--neon); background: rgba(57,255,20,.1);
      border: 1px solid rgba(57,255,20,.2); padding: 3px 10px;
      border-radius: 99px; margin-bottom: 4px;
    }
    .economia-valor { font-size: 18px; font-weight: 800; color: var(--neon); }
    .resumo-prazo {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 12px;
      padding: 16px 22px; border-top: 1px solid var(--dark-700);
    }
    .resumo-prazo-label { font-size: 12px; color: var(--muted); margin-bottom: 3px; }
    .resumo-prazo-value { font-size: clamp(18px, 5vw, 22px); font-weight: 800; color: var(--text); letter-spacing: -0.5px; }
    .resumo-prazo-box { text-align: right; }
    .resumo-prazo-total-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .resumo-prazo-total { font-size: 15px; font-weight: 700; color: #bbb; }

    /* VALIDADE */
    .validade-bar {
      background: rgba(255,193,7,.04); border: 1px solid rgba(255,193,7,.12);
      border-radius: 14px; padding: 16px 20px;
      display: flex; align-items: center; gap: 14px;
    }
    .validade-icon { font-size: 22px; flex-shrink: 0; }
    .validade-texto { font-size: 13px; color: #999; }
    .validade-data { font-weight: 700; color: #ffc107; }

    /* CTA */
    .cta-wrap { padding: 40px 20px 64px; max-width: 760px; margin: 0 auto; }
    .cta-btn {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; text-decoration: none; border-radius: 18px;
      background: #25D366; color: #fff;
      font-size: clamp(15px, 4vw, 18px); font-weight: 800;
      padding: 20px 24px;
      box-shadow: 0 12px 40px rgba(37,211,102,.25);
      transition: transform .1s, box-shadow .2s;
    }
    .cta-btn:active { transform: scale(.98); }
    .cta-btn svg { width: 26px; height: 26px; fill: #fff; flex-shrink: 0; }
    .cta-note { text-align: center; font-size: 12px; color: var(--muted); margin-top: 14px; }

    /* FOOTER */
    .footer {
      background: var(--dark-900); border-top: 1px solid #141414;
      padding: 24px 20px; text-align: center; font-size: 12px; color: var(--muted);
    }
    .footer strong { color: #aaa; }

    @media (min-width: 640px) {
      .hero { padding: 80px 24px 64px; }
      .equip-img { max-height: 320px; }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="logo">BRAVE</div>
    <div class="header-pill">Proposta Exclusiva</div>
  </header>

  <section class="hero">
    <div class="hero-tag">Preparamos especialmente para você</div>
    <h1>${primeiroNome},<br><span>${proposta.objetivo || 'vamos equipar seu box'}</span></h1>
    <p class="hero-sub">Selecionamos os melhores equipamentos BRAVE para você. Alta performance, padrão profissional.</p>
  </section>

  <div class="wrap">

    ${proposta.mensagem_personalizada ? `
    <div class="section">
      <div class="section-label">Mensagem do consultor</div>
      <div class="msg-card">
        <p class="msg-text">${proposta.mensagem_personalizada.replace(/\n/g, '<br>')}</p>
        <div class="msg-autor">
          <div class="msg-avatar">LB</div>
          <div>
            <div class="msg-nome">Leo Berg</div>
            <div class="msg-cargo">Consultor · BRAVE Equipamentos</div>
          </div>
        </div>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-label">Equipamentos selecionados (${equips.length})</div>
      ${equipamentosHTML}
    </div>

    <div class="section">
      <div class="section-label">Investimento</div>
      <div class="resumo-card">
        <div class="resumo-total">
          <div>
            <div class="resumo-total-label">Total à vista</div>
            <div class="resumo-total-value">${fmtBRL(totalAvista)}</div>
          </div>
          ${economiaTotal > 0 ? `<div class="economia-box">
            <div class="economia-pill">✓ Economia</div>
            <div class="economia-valor">${fmtBRL(economiaTotal)}</div>
          </div>` : ''}
        </div>
        <div class="resumo-prazo">
          <div>
            <div class="resumo-prazo-label">ou a prazo no cartão</div>
            <div class="resumo-prazo-value">${parcelas}× de ${fmtBRL(totalParcela)}</div>
          </div>
          <div class="resumo-prazo-box">
            <div class="resumo-prazo-total-label">Total a prazo</div>
            <div class="resumo-prazo-total">${fmtBRL(totalNormal)}</div>
          </div>
        </div>
      </div>
      ${validadeStr ? `<div class="validade-bar">
        <div class="validade-icon">⏳</div>
        <div>
          <div class="validade-texto">Proposta válida até <span class="validade-data">${validadeStr}</span></div>
          <div style="font-size:11px;color:#555;margin-top:3px;">Preços sujeitos à disponibilidade de estoque.</div>
        </div>
      </div>` : ''}
    </div>

  </div>

  <div class="cta-wrap">
    <a href="${wppHref}" class="cta-btn" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Quero fechar negócio!
    </a>
    <p class="cta-note">Ao clicar, você abrirá o WhatsApp com Leo Berg da BRAVE Equipamentos.</p>
  </div>

  <footer class="footer">
    <p><strong>BRAVE Equipamentos</strong> · Proposta preparada exclusivamente para ${proposta.lead_nome}</p>
    <p style="margin-top:6px;font-size:11px;">Brave Hub · Equipamentos Fitness Profissionais</p>
  </footer>

</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = req.query.slug || '';
  if (!slug) return res.status(400).send('<h1>Slug obrigatório</h1>');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: proposta, error } = await supabase
    .from('propostas_leads')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !proposta) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title>
<style>body{background:#080808;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;}h2{font-size:20px;margin-bottom:8px;}p{color:#666;font-size:14px;}</style>
</head><body><div><h2>Proposta não encontrada</h2><p>Este link pode ter expirado ou sido removido.</p></div></body></html>`);
  }

  // Registrar abertura (fire-and-forget)
  const agora = new Date().toISOString();
  const updatePayload = {
    aberturas: (proposta.aberturas || 0) + 1,
    ultima_abertura_em: agora,
  };
  if (!proposta.primeira_abertura_em) updatePayload.primeira_abertura_em = agora;
  if (proposta.status === 'enviada') updatePayload.status = 'aberta';
  supabase.from('propostas_leads').update(updatePayload).eq('id', proposta.id).then(() => {});

  const html = gerarHTML(proposta);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).send(html);
}
