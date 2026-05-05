import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testItemName() {
  const { data } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  const token = data.access_token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': '1.0', 'Content-Type': 'application/json' };

  const idVendedor = 15596875725;
  const idContato = 18117973692;

  const proposta = {
    contato: { id: idContato },
    itens: [
      {
        codigo: 'SKU-TESTE-2',
        descricao: 'ESTE É O NOME DO PRODUTO',
        descricaoDetalhada: 'Detalhes extras',
        unidade: 'UN',
        quantidade: 1,
        valor: 150.00,
        produto: {
          descricao: 'ESTE É O NOME DO PRODUTO'
        }
      }
    ],
    vendedor: { id: idVendedor },
    transporte: {
      fretePorConta: 0,
      frete: 50.00
    }
  };

  const postProp = await fetch('https://api.bling.com.br/v3/propostas-comerciais', {
    method: 'POST',
    headers,
    body: JSON.stringify(proposta)
  });

  const body = await postProp.json();
  console.log('Criou:', body.data?.id);
  
  if (body.data?.id) {
    const res = await fetch('https://api.bling.com.br/v3/propostas-comerciais/' + body.data.id, { headers });
    console.log(await res.text());
  } else {
    console.log(JSON.stringify(body, null, 2));
  }
}

testItemName();
