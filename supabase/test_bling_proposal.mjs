import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBlingFull() {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) return;
  const token = data.access_token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': '1.0', 'Content-Type': 'application/json' };

  const idVendedor = 15596875725;
  const idContato = 18117973692;

  // 3. Criar Proposta Comercial
  const proposta = {
    contato: { id: idContato },
    itens: [
      {
        codigo: 'SKU-TESTE',
        descricao: 'Produto Teste Edge Function',
        quantidade: 1,
        valor: 150.00
      }
    ],
    vendedor: idVendedor ? { id: idVendedor } : undefined,
    transporte: {
      fretePorConta: 0,
      frete: 50.00
    }
  };

  console.log('Enviando proposta:', JSON.stringify(proposta));

  const postProp = await fetch('https://api.bling.com.br/v3/propostas-comerciais', {
    method: 'POST',
    headers,
    body: JSON.stringify(proposta)
  });

  console.log('Status Proposta:', postProp.status);
  console.log('Resposta Proposta:', await postProp.text());
}

testBlingFull();
