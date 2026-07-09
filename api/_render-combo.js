// api/_render-combo.js — página de combo de ergômetros renderizada no servidor.
// Rota pública: /lp/ergo/{slug}?d={desconto}  (slug = aliases separados por "-")
// Server-side para o WhatsApp ler o OG certo de qualquer combinação.
import { parseComboSlug, comboSlug, comboTotais } from '../src/data/ergoCatalog.js';

const BASE = 'https://brave-hub-two.vercel.app';
const WA_DEFAULT = '5514981451119';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtBRL = (v) => Number(v) > 0 ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Consultar';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = req.query.slug || '';
  const desconto = Math.max(0, Number(req.query.d) || 0);
  const produtos = parseComboSlug(slug);

  if (!produtos.length) {
    return res.status(404).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Combo não encontrado</title>
<style>body{background:#050507;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center}p{color:#666}</style></head>
<body><div><h2>Combo não encontrado</h2><p>Verifique o link do combo de ergômetros.</p></div></body></html>`);
  }

  const canon = comboSlug(produtos);
  const t = comboTotais(produtos, desconto);
  const nomes = produtos.map(p => p.nome);
  const qs = desconto > 0 ? `?d=${desconto}` : '';
  const ogImg = `${BASE}/lp/ergo/og/${canon}.png${qs}`;
  const titulo = `Combo de Ergômetros — ${nomes.join(' + ')} | BRAVE`;
  const descricao = `${nomes.join(', ')} — equipamentos de alta performance BRAVE${t.avistaFinal > 0 ? `, a partir de ${fmtBRL(t.avistaFinal)} à vista` : ''}. 10x sem juros.`;
  const waMsg = encodeURIComponent(`Olá! Tenho interesse no combo de ergômetros: ${nomes.join(', ')}. Podem me enviar as condições?`);
  const waHref = `https://wa.me/${WA_DEFAULT}?text=${waMsg}`;

  const cardsHTML = produtos.map((p, i) => `
    <div class="card">
      <div class="card-top">
        <span class="card-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="card-emoji">${p.emoji || ''}</span>
      </div>
      <div class="card-body">
        <h2 class="card-nome">${esc(p.nome)}</h2>
        <p class="card-sub">${esc(p.subtitle || '')}</p>
        <ul class="specs">${(p.specs || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="price">
          ${p.preco_avista > 0
            ? `${p.preco > p.preco_avista ? `<span class="price-de">de ${fmtBRL(p.preco)}</span>` : ''}
               <span class="price-avista">${fmtBRL(p.preco_avista)} <small>à vista</small></span>
               <span class="price-parc">ou 10× de ${fmtBRL(p.preco / 10)} sem juros</span>`
            : `<span class="price-avista" style="font-size:22px">Sob consulta</span>`}
        </div>
      </div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${BASE}/lp/ergo/${canon}${qs}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Brave">
<meta property="og:url" content="${BASE}/lp/ergo/${canon}${qs}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImg}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root{--neon:#39ff14;--dark:#050507;--d900:#0a0a0f;--d800:#111118;--d700:#1a1a24;--d600:#25252f;--text:#e4e4e7;--muted:#8a8a94}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--dark);color:var(--text);font-family:'Inter',system-ui,sans-serif;line-height:1.6}
  .header{position:sticky;top:0;z-index:50;background:rgba(5,5,7,.95);backdrop-filter:blur(10px);border-bottom:1px solid rgba(57,255,20,.2);padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
  .logo{font-size:22px;font-weight:900;color:var(--neon);letter-spacing:-.5px}
  .header a{display:inline-flex;align-items:center;gap:8px;background:var(--neon);color:var(--dark);font-weight:800;font-size:12px;padding:9px 16px;border-radius:99px;text-decoration:none}
  .hero{padding:52px 20px 40px;text-align:center;position:relative;overflow:hidden;border-bottom:1px solid var(--d700)}
  .hero::before{content:'';position:absolute;top:-140px;left:50%;transform:translateX(-50%);width:700px;height:700px;background:radial-gradient(ellipse,rgba(57,255,20,.08),transparent 65%)}
  .hero-tag{display:inline-block;margin-bottom:18px;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--neon);border:1px solid rgba(57,255,20,.25);padding:5px 14px;border-radius:99px}
  .hero h1{font-size:clamp(30px,8vw,60px);font-weight:900;line-height:1.02;letter-spacing:-1.5px;color:#fff;margin-bottom:14px;text-transform:uppercase}
  .hero h1 span{color:var(--neon)}
  .hero-sub{font-size:clamp(14px,3vw,17px);color:var(--muted);max-width:520px;margin:0 auto}
  .wrap{max-width:820px;margin:0 auto;padding:0 20px}
  .section{padding:44px 0 0}
  .section-label{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
  .grid{display:grid;grid-template-columns:1fr;gap:16px}
  @media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
  .card{background:var(--d800);border:1px solid var(--d700);border-radius:20px;overflow:hidden;display:flex;flex-direction:column}
  .card-top{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--d700)}
  .card-num{font-size:11px;font-weight:800;color:var(--muted);letter-spacing:2px}
  .card-emoji{font-size:26px}
  .card-body{padding:22px;display:flex;flex-direction:column;flex:1}
  .card-nome{font-size:21px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:5px}
  .card-sub{font-size:13px;color:var(--neon);font-weight:600;margin-bottom:16px}
  .specs{list-style:none;margin-bottom:20px}
  .specs li{font-size:13px;color:var(--text);padding:7px 0 7px 20px;border-bottom:1px solid var(--d700);position:relative}
  .specs li:last-child{border-bottom:none}
  .specs li::before{content:'→';position:absolute;left:0;color:var(--neon)}
  .price{margin-top:auto;padding-top:16px;border-top:1px solid var(--d700);display:flex;flex-direction:column;gap:3px}
  .price-de{font-size:12px;color:var(--muted);text-decoration:line-through}
  .price-avista{font-size:26px;font-weight:900;color:var(--neon);letter-spacing:-.5px}
  .price-avista small{font-size:13px;font-weight:500;color:var(--muted)}
  .price-parc{font-size:12px;color:var(--muted)}
  .resumo{background:var(--d800);border:1px solid var(--d700);border-radius:20px;overflow:hidden}
  .resumo-item{display:flex;justify-content:space-between;align-items:center;padding:12px 22px;border-bottom:1px solid var(--d700);font-size:14px}
  .resumo-item span:first-child{color:var(--muted)}
  .resumo-item span:last-child{color:#fff;font-weight:600}
  .resumo-total{background:linear-gradient(135deg,#0d1a08,#111);border-top:1px solid rgba(57,255,20,.15);padding:24px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
  .resumo-total-label{font-size:12px;color:var(--muted);margin-bottom:4px}
  .resumo-total-value{font-size:clamp(28px,7vw,40px);font-weight:900;color:var(--neon);letter-spacing:-1px}
  .eco{text-align:right}
  .eco-pill{display:inline-block;font-size:10px;font-weight:700;color:var(--neon);background:rgba(57,255,20,.1);border:1px solid rgba(57,255,20,.2);padding:3px 10px;border-radius:99px;margin-bottom:4px}
  .eco-val{font-size:18px;font-weight:800;color:var(--neon)}
  .resumo-prazo{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 22px}
  .resumo-prazo-value{font-size:clamp(18px,5vw,22px);font-weight:800;color:var(--text);letter-spacing:-.5px}
  .nota{font-size:12px;color:#666;padding:0 22px 16px}
  .cta-wrap{padding:40px 20px 64px;max-width:820px;margin:0 auto}
  .cta-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;text-decoration:none;border-radius:18px;background:#25D366;color:#fff;font-size:clamp(15px,4vw,18px);font-weight:800;padding:20px 24px;box-shadow:0 12px 40px rgba(37,211,102,.22)}
  .cta-btn svg{width:26px;height:26px;fill:#fff;flex-shrink:0}
  .cta-note{text-align:center;font-size:12px;color:var(--muted);margin-top:14px}
  .footer{background:var(--d900);border-top:1px solid #141414;padding:24px 20px;text-align:center;font-size:12px;color:var(--muted)}
</style>
</head>
<body>
  <header class="header">
    <div class="logo">BRAVE</div>
    <a href="${waHref}" target="_blank" rel="noopener">Falar no WhatsApp</a>
  </header>

  <section class="hero">
    <div class="hero-tag">Combo de Ergômetros</div>
    <h1>Monte seu <span>Box de Cardio</span></h1>
    <p class="hero-sub">Seleção de ergômetros de alta performance BRAVE. Padrão profissional, pronta entrega e condições exclusivas para o combo.</p>
  </section>

  <div class="wrap">
    <div class="section">
      <div class="section-label">Equipamentos do combo (${produtos.length})</div>
      <div class="grid">${cardsHTML}</div>
    </div>

    <div class="section">
      <div class="section-label">Investimento do combo</div>
      <div class="resumo">
        ${produtos.filter(p => p.preco_avista > 0).map(p => `<div class="resumo-item"><span>${esc(p.nome)}</span><span>${fmtBRL(p.preco_avista)}</span></div>`).join('')}
        ${desconto > 0 ? `<div class="resumo-item"><span>Desconto do combo</span><span style="color:var(--neon)">− ${fmtBRL(desconto)}</span></div>` : ''}
        <div class="resumo-total">
          <div>
            <div class="resumo-total-label">Total à vista</div>
            <div class="resumo-total-value">${fmtBRL(t.avistaFinal)}</div>
          </div>
          ${t.economia > 0 ? `<div class="eco"><div class="eco-pill">✓ Economia</div><div class="eco-val">${fmtBRL(t.economia)}</div></div>` : ''}
        </div>
        <div class="resumo-prazo">
          <div>
            <div class="resumo-total-label">ou a prazo no cartão</div>
            <div class="resumo-prazo-value">10× de ${fmtBRL(t.parcela)}</div>
          </div>
          <div style="text-align:right">
            <div class="resumo-total-label">Total a prazo</div>
            <div style="font-size:15px;font-weight:700;color:#bbb">${fmtBRL(t.somaPrazo)}</div>
          </div>
        </div>
        ${t.temConsultar ? `<div class="nota">* Itens marcados como "sob consulta" não estão somados no total. Fale com o consultor para o valor completo.</div>` : ''}
      </div>
    </div>
  </div>

  <div class="cta-wrap">
    <a href="${waHref}" class="cta-btn" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Quero esse combo!
    </a>
    <p class="cta-note">Ao clicar, você abrirá o WhatsApp com um consultor BRAVE.</p>
  </div>

  <footer class="footer">
    <p><strong style="color:#aaa">BRAVE</strong> · Equipamentos Fitness Profissionais · CNPJ 33.167.844/0001-80</p>
  </footer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(html);
}
