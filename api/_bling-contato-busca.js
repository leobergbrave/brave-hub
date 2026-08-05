/**
 * Busca de contato no Bling — ponto único de verdade.
 *
 * CUIDADO: a API v3 IGNORA o filtro `?cpf_cnpj=` (comprovado: um documento
 * inexistente devolve a primeira página inteira de contatos). Como o código
 * antigo usava esse filtro, a busca nunca casava, o sistema achava que o
 * contato não existia e tentava criar um duplicado — e o Bling recusava com
 * "O CPF já está cadastrado no contato X".
 *
 * Filtros que a v3 realmente respeita: `numeroDocumento=` e `pesquisa=`.
 *
 * @param {(path: string) => Promise<Response>} get  fetch já autenticado, recebe o path a partir de /v3
 * @param {{documento?: string, nome?: string, email?: string}} alvo
 * @returns {Promise<{id: any, nome: string, via: string} | null>}
 */
export async function buscarContatoBling(get, { documento = '', nome = '', email = '' } = {}) {
  const soDigitos = (v) => String(v || '').replace(/\D/g, '');
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const doc = soDigitos(documento);

  const lerLista = async (query) => {
    try {
      const r = await get(`/contatos?${query}&limite=100`);
      if (!r?.ok) return [];
      const j = await r.json();
      return j?.data || [];
    } catch (_) { return []; }
  };

  // 1) documento — o identificador confiável
  if (doc) {
    for (const q of [`numeroDocumento=${doc}`, `pesquisa=${doc}`]) {
      const lista = await lerLista(q);
      const match = lista.find(c => soDigitos(c.numeroDocumento || c.cpfCnpj || c.cpf || c.cnpj) === doc);
      if (match) return { id: match.id, nome: match.nome, via: q.split('=')[0] };
    }
  }

  // 2) email exato
  if (email) {
    const alvo = String(email).toLowerCase();
    const lista = await lerLista(`pesquisa=${encodeURIComponent(email)}`);
    const match = lista.find(c => String(c.email || '').toLowerCase() === alvo);
    if (match) return { id: match.id, nome: match.nome, via: 'email' };
  }

  // 3) nome — só aceita match exato (sem acento) ou resultado único.
  // O código antigo pegava data[0] cegamente, o que podia pendurar a proposta
  // no contato errado quando a busca retornava vários homônimos parciais.
  if (nome) {
    const alvo = semAcento(nome);
    const lista = await lerLista(`pesquisa=${encodeURIComponent(nome)}`);
    const exato = lista.find(c => semAcento(c.nome) === alvo);
    const match = exato || (lista.length === 1 ? lista[0] : null);
    if (match) return { id: match.id, nome: match.nome, via: 'nome' };
  }

  return null;
}
