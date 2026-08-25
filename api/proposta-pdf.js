import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/proposta-pdf?slug=...
 * Baixa o PDF oficial do Bling guardado para o orçamento (bucket privado).
 * O arquivo é o que o Léo anexa no WhatsApp do cliente — cliente não recebe link.
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  const { slug } = req.query || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'slug é obrigatório.' });

  const { data: orc } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select('cliente, bling_proposta_numero, proposta_pdf_path')
    .eq('slug', slug)
    .maybeSingle();
  if (!orc?.proposta_pdf_path) {
    return res.status(404).json({ ok: false, error: 'PDF ainda não gerado para este orçamento.' });
  }

  const { data: file, error } = await supabaseAdmin.storage
    .from('propostas-pdf')
    .download(orc.proposta_pdf_path);
  if (error || !file) {
    return res.status(500).json({ ok: false, error: `Falha ao ler PDF: ${error?.message || 'vazio'}` });
  }

  const nomeCliente = (orc.cliente || 'Cliente').replace(/[^\p{L}\p{N} .-]/gu, '').trim();
  const nomeArquivo = `Proposta ${orc.bling_proposta_numero || ''} - ${nomeCliente}.pdf`.replace(/\s+/g, ' ');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  res.status(200).send(Buffer.from(await file.arrayBuffer()));
}
