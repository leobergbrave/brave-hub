// api/_waha.js — transporte de SAÍDA pelo WAHA (WhatsApp HTTP API self-hosted no
// Railway). Substitui a BotConversa como canal de envio do HUB. Usa a MESMA sessão
// e o MESMO número do agente de atendimento (whatsapp/waha_client.py do brave-agente).
//
// Env na Vercel:
//   WAHA_BASE_URL  = https://<servico>.up.railway.app   (sem barra no fim)
//   WAHA_API_KEY   = a X-Api-Key do WAHA
//   WAHA_SESSION   = default   (opcional; default = "default")

const BASE = (process.env.WAHA_BASE_URL || '').replace(/\/$/, '');
const SESSION = process.env.WAHA_SESSION || 'default';
const API_KEY = process.env.WAHA_API_KEY || '';

export function wahaConfigurado() {
  return !!(BASE && API_KEY);
}

// Telefone -> chatId do WAHA. Se já vier um chatId (@c.us/@g.us/@lid), passa direto.
function chatId(tel) {
  const s = String(tel || '').trim();
  return s.includes('@') ? s : `${s.replace(/\D/g, '')}@c.us`;
}

async function wahaPost(path, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify({ session: SESSION, ...payload }),
  });
  let texto = '';
  let json = null;
  try { texto = await r.text(); json = JSON.parse(texto); } catch (_) { /* corpo não-JSON */ }
  return { ok: r.ok, status: r.status, json, texto };
}

export function wahaSendText(tel, texto) {
  return wahaPost('/api/sendText', { chatId: chatId(tel), text: texto });
}

const EXT_VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v', '3gp']);
const EXT_IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const extDe = (url) => (String(url || '').split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();

function mimeDe(ext) {
  if (EXT_VIDEO.has(ext)) return `video/${ext === '3gp' ? '3gpp' : ext}`;
  if (EXT_IMG.has(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

// Nome do arquivo que o cliente vê: o ultimo segmento da URL (ex: proposta-avista.pdf),
// senao arquivo.<ext>. O WhatsApp mostra o PDF pelo nome, entao isso importa.
function nomeArquivo(url, ext) {
  try {
    const seg = decodeURIComponent(String(url).split('?')[0].split('#')[0].split('/').pop() || '');
    if (seg && /\.[a-z0-9]{1,5}$/i.test(seg)) return seg;
  } catch (_) { /* segue pro fallback */ }
  return `arquivo.${ext || 'bin'}`;
}

// Manda uma mídia por URL pública. Foto -> sendImage; vídeo -> sendVideo (e cai pra
// sendFile se a imagem WEBJS "lite" recusar com 422 "use waha:chrome"); PDF/resto -> sendFile.
export async function wahaSendMidia(tel, url, caption = '') {
  const ext = extDe(url);
  const payload = {
    chatId: chatId(tel),
    file: { url, mimetype: mimeDe(ext), filename: nomeArquivo(url, ext) },
    caption,
  };
  if (EXT_IMG.has(ext)) return wahaPost('/api/sendImage', payload);
  if (EXT_VIDEO.has(ext)) {
    const v = await wahaPost('/api/sendVideo', payload);
    if (!v.ok && [404, 422, 501].includes(v.status)) return wahaPost('/api/sendFile', payload);
    return v;
  }
  return wahaPost('/api/sendFile', payload);
}
