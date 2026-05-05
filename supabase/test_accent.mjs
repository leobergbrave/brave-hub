import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testVendedorSemAcento() {
  const res = await supabase.functions.invoke('sync-bling-proposal', {
    body: {
      cliente: 'CLIENTE LEO BERG SEM ACENTO',
      consultor: 'LEO BERG', // Sem acento
      payload: {
        itens: [{ codigo_sku: '123', nome: 'Teste', quantidade: 1, preco: 10 }],
        frete: 0
      }
    }
  });
  console.log(JSON.stringify(res, null, 2));
}

testVendedorSemAcento();
