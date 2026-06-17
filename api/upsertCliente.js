/**
 * upsertCliente.js
 * Helper compartilhado para criar/atualizar um cliente na tabela `clientes`.
 * Deduplicação: tenta match por CPF/CNPJ primeiro, depois por telefone.
 */

/**
 * @param {object} supabase - cliente Supabase admin
 * @param {object} dados
 * @param {string} dados.nome
 * @param {string} [dados.telefone]
 * @param {string} [dados.email]
 * @param {string} [dados.cpfCnpj]
 * @param {string} [dados.tipoPessoa]  'F' | 'J'
 * @param {string} [dados.tipoNegocio]
 * @param {object} [dados.dadosFiscais]
 * @param {string} [dados.origem]
 * @param {number} [dados.blingContatoId]
 * @param {number} [dados.valorCompra]   -- valor da compra (para somar ao total_gasto)
 * @returns {Promise<string|null>}  ID do cliente upsertado
 */
export async function upsertCliente(supabase, dados) {
  const telLimpo = (dados.telefone || '').replace(/\D/g, '') || null;
  const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '') || null;

  // Tentar encontrar cliente existente
  let clienteExistente = null;

  if (cpfLimpo) {
    const { data } = await supabase
      .from('clientes')
      .select('id, total_compras, total_gasto, data_primeira_compra')
      .eq('cpf_cnpj', cpfLimpo)
      .maybeSingle();
    clienteExistente = data;
  }

  if (!clienteExistente && telLimpo) {
    const { data } = await supabase
      .from('clientes')
      .select('id, total_compras, total_gasto, data_primeira_compra')
      .eq('telefone', telLimpo)
      .maybeSingle();
    clienteExistente = data;
  }

  const agora = new Date().toISOString();
  const isCompra = !!(dados.valorCompra && dados.valorCompra > 0);

  if (clienteExistente) {
    // Atualizar cliente existente
    const updateData = {
      atualizado_em: agora,
      ...(dados.nome && { nome: dados.nome }),
      ...(dados.email && { email: dados.email }),
      ...(telLimpo && { telefone: telLimpo }),
      ...(cpfLimpo && { cpf_cnpj: cpfLimpo }),
      ...(dados.tipoPessoa && { tipo_pessoa: dados.tipoPessoa }),
      ...(dados.tipoNegocio && { tipo_negocio: dados.tipoNegocio }),
      ...(dados.dadosFiscais && { dados_fiscais: dados.dadosFiscais }),
      ...(dados.blingContatoId && { bling_contato_id: dados.blingContatoId }),
    };

    if (isCompra) {
      updateData.data_ultima_compra = agora;
      updateData.total_compras = (clienteExistente.total_compras || 0) + 1;
      updateData.total_gasto = (parseFloat(clienteExistente.total_gasto) || 0) + (dados.valorCompra || 0);
      if (!clienteExistente.data_primeira_compra) {
        updateData.data_primeira_compra = agora;
      }
    }

    await supabase.from('clientes').update(updateData).eq('id', clienteExistente.id);
    return clienteExistente.id;
  } else {
    // Criar novo cliente
    const insertData = {
      nome: dados.nome,
      telefone: telLimpo,
      email: dados.email || null,
      cpf_cnpj: cpfLimpo,
      tipo_pessoa: dados.tipoPessoa || 'F',
      tipo_negocio: dados.tipoNegocio || null,
      dados_fiscais: dados.dadosFiscais || {},
      origem: dados.origem || 'manual',
      bling_contato_id: dados.blingContatoId || null,
      total_compras: isCompra ? 1 : 0,
      total_gasto: isCompra ? (dados.valorCompra || 0) : 0,
      data_primeira_compra: isCompra ? agora : null,
      data_ultima_compra: isCompra ? agora : null,
      criado_em: agora,
      atualizado_em: agora,
    };

    const { data } = await supabase.from('clientes').insert(insertData).select('id').single();
    return data?.id || null;
  }
}
