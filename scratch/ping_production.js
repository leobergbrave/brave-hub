
async function ping() {
  try {
    const url = 'https://brave-hub-two.vercel.app/api/disparo-sender';
    console.log(`Pinging ${url}...`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Text: ${await res.text()}`);
  } catch (err) {
    console.error('Error pinging:', err);
  }
}

ping();
