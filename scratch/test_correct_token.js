const token = 'apify_api_XdnA1RDK1fqaz5xGcrIB0NYVOPbzPX4lnHfY'; // Token corrigido com K maiúsculo e zero no lugar de O

async function testCorrectToken() {
  console.log('Testando chamada ao Apify com o token exato do print...');
  const res = await fetch(`https://api.apify.com/v2/acts/apify~google-maps-scraper/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStrings: ['Crossfit em Sorocaba - SP'],
      maxCrawledPlacesPerSearch: 1,
      scrapeWebsite: false
    })
  });
  console.log('Apify Status:', res.status);
  const text = await res.text();
  console.log('Apify Response:', text);
}

testCorrectToken();
