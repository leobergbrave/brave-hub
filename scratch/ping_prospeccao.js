async function ping() {
  try {
    const url = 'https://brave-hub-two.vercel.app/api/prospeccao-proxy';
    console.log(`Pinging prospeccao-proxy em ${url}...`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service: 'apify',
        nicho: 'Box de Crossfit',
        cidade: 'betim',
        estado: 'MG',
        limite: 1
      })
    });
    
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Text: ${await res.text()}`);
  } catch (err) {
    console.error('Error pinging:', err);
  }
}

ping();
