

async function getToken() {
  const clientId = '8d756b83ffeb052612698b6000b0975961dbabb7';
  const clientSecret = 'dc5de1bd869f30d49c522df76e8cf5bf55f86094ff9ad1a91d760b0a0616';
  const code = '0e84cc4d126ef813d994db43c5956fa53e517cef';

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const res = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code
      })
    });

    console.log(res.status);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
}

getToken();
