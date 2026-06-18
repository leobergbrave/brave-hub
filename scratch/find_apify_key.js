import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

const casesK = ['k', 'K'];
const chars1 = ['I', 'l', '1'];
const chars2 = ['0', 'O'];
const chars3 = ['O', '0'];
const chars4 = ['l', 'I', '1'];

async function findKey() {
  console.log('Iniciando busca com k/K e outras variações...');
  
  for (const k of casesK) {
    for (const c1 of chars1) {
      for (const c2 of chars2) {
        for (const c3 of chars3) {
          for (const c4 of chars4) {
            const token = `apify_api_XdnA1RD${k}1fqaz5xGcr${c1}B${c2}NYV${c3}PbzPX4${c4}nHfY`;
            
            try {
              const res = await fetch(`https://api.apify.com/v2/acts/apify~google-maps-scraper/runs?token=${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  searchStrings: ['Crossfit em Sorocaba - SP'],
                  maxCrawledPlacesPerSearch: 1,
                  scrapeWebsite: false
                })
              });
              
              if (res.status === 201 || res.status === 200) {
                console.log('✅ CHAVE ENCONTRADA!');
                console.log('Chave correta:', token);
                
                const { error } = await supabase
                  .from('prospeccao_config')
                  .update({ apify_token: token })
                  .eq('id', 1);
                  
                if (error) console.error('Erro ao salvar no Supabase:', error);
                else console.log('Supabase atualizado com sucesso!');
                return;
              }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 150));
          }
        }
      }
    }
  }
  
  console.log('Nenhuma combinação para a primeira chave funcionou.');
}

findKey();
