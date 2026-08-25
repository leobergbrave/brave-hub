/* Helpers de navegação para o Bling (web).
   A diretoria exige que o cliente receba o PDF oficial gerado pelo Bling —
   este link abre a proposta direto na tela do Bling para Imprimir → PDF. */
export function urlPropostaBling(propostaId) {
  return `https://www.bling.com.br/propostas.comerciais.php#edit/${propostaId}`;
}
