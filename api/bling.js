import importarBling from './_bling-importar.js';
import enviarPedido from './_bling-pedido.js';
import sincronizarContato from './_bling-contato.js';
import pedidosAtendidos from './_bling-pedidos-atendidos.js';
import { importar as importarModelos, gerarOrcamento, gerarProposta } from './_bling-modelos.js';
import { uploadPdf, baixarPdf, enviarPdfCliente, propostaPorTelefone } from './_proposta-pdf.js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Bling (função consolidada)
   Uma única função serverless roteando por ?acao=
   para respeitar o limite de 12 funções do plano Hobby.

   POST /api/bling?acao=importar_bling      → produtos/clientes (body: {type, mode, ...})
   POST /api/bling?acao=enviar_pedido       → cria proposta comercial (body: {clienteId, orcamentoSlug})
   POST /api/bling?acao=sincronizar_contato → cria/atualiza contato (body: {clienteId})
   POST /api/bling?acao=pedidos_atendidos   → avisa clientes de pedidos despachados (body: {modo:'listar'|'enviar'})
   POST /api/bling?acao=importar_modelos    → importa modelos (body: {numeros:[...]})
   POST /api/bling?acao=gerar_orcamento     → link de orçamento a partir de modelo
   POST /api/bling?acao=gerar_proposta      → proposta premium a partir de modelo
   POST /api/bling?acao=proposta_pdf_upload → userscript envia HTML oficial da impressão (body: {numero, html})
   GET  /api/bling?acao=proposta_pdf&slug=  → baixa o PDF oficial guardado
   POST /api/bling?acao=enviar_pdf_cliente  → manda os PDFs no WhatsApp do cliente (body: {slug})
   ═══════════════════════════════════════════════ */

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-hub-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const acao = req.query?.acao || req.body?.acao;
  switch (acao) {
    case 'importar_bling':      return importarBling(req, res);
    case 'enviar_pedido':       return enviarPedido(req, res);
    case 'sincronizar_contato': return sincronizarContato(req, res);
    case 'pedidos_atendidos':   return pedidosAtendidos(req, res);
    case 'importar_modelos':    return importarModelos(req, res);
    case 'gerar_orcamento':     return gerarOrcamento(req, res);
    case 'gerar_proposta':      return gerarProposta(req, res);
    case 'proposta_pdf_upload': return uploadPdf(req, res);
    case 'proposta_pdf':        return baixarPdf(req, res);
    case 'enviar_pdf_cliente':  return enviarPdfCliente(req, res);
    case 'proposta_por_telefone': return propostaPorTelefone(req, res);
    default:
      return res.status(400).json({ ok: false, error: `Ação Bling inválida: ${acao || '(vazia)'}` });
  }
}
