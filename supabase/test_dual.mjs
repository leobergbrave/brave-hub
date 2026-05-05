import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDualProposals() {
  const res = await supabase.functions.invoke('sync-bling-proposal', {
    body: {
      cliente: 'CLIENTE TESTE AVISTA E PRAZO',
      consultor: 'Léo Berg',
      payload: {
        itens: [
          { codigo_sku: 'BIKE-001', nome: 'Bike Ergométrica', quantidade: 2, preco: 1000, preco_avista: 800, preco_prazo: 1100 },
          { codigo_sku: 'MED-001', nome: 'Med Ball 9kg', quantidade: 5, preco: 100 } // fallback to global discount
        ],
        condicoes: {
          descontoAvista: 10, // 10%
          descontoCartao: 0,
          parcelas: 12
        },
        frete: 50
      }
    }
  });
  console.log(JSON.stringify(res, null, 2));
}

testDualProposals();
