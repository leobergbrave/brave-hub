// api/orcamento-adicionado.js — avisa o Léo no WhatsApp quando um CLIENTE adiciona
// um produto ao próprio orçamento (sinal de compra quente). Usa o mesmo webhook de
// alertas do vigia/LPs (mensagem vai pro telefone do Léo, não pro cliente).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { slug, cliente, produto, valor, link } = req.body || {};
  if (!produto) return res.status(400).json({ ok: false, error: 'produto obrigatório' });

  const url = process.env.BOTCONVERSA_WEBHOOK
    || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/BKf6LUAsGAKO/';
  const telefone = process.env.ALERTA_TELEFONE || '5548996459791';
  const valorTxt = Number(valor) > 0
    ? ` (${Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
    : '';

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefone,
        nome: cliente || 'Cliente',
        titulo: 'Cliente adicionou produto',
        qtd_pendentes: 1,
        link: link || '',
        alerta: `🛒🔥 ${cliente || 'Cliente'} ADICIONOU "${produto}"${valorTxt} ao próprio orçamento (${slug || ''})! Sinal de compra — chama agora: ${link || ''}`,
      }),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
  return res.status(200).json({ ok: true });
}
