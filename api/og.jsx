import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const client = searchParams.get('client') || 'Atleta';
    const hasClient = searchParams.has('client');

    return new ImageResponse(
      (
        <div
          style={{
            backgroundColor: '#09090b', // dark-950
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            padding: '40px',
            position: 'relative',
          }}
        >
          {/* Subtle Background Glows similar to App.jsx */}
          <div
            style={{
              position: 'absolute',
              top: '-20%',
              left: '-10%',
              width: '800px',
              height: '800px',
              borderRadius: '50%',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              filter: 'blur(100px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-20%',
              right: '-10%',
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              backgroundColor: 'rgba(217, 248, 57, 0.05)',
              filter: 'blur(80px)',
            }}
          />

          {/* Logo */}
          <img
            src="https://brave-hub.vercel.app/logo-orcamento.png"
            width="280"
            height="280"
            style={{ objectFit: 'contain', marginBottom: '30px' }}
          />
          
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <h1
              style={{
                fontSize: '48px',
                fontWeight: '800',
                color: '#ffffff',
                marginBottom: '10px',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '-1px',
              }}
            >
              ORÇAMENTO EXCLUSIVO
            </h1>
            
            {hasClient && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'rgba(249, 115, 22, 0.1)', // orange-accent/10
                  border: '2px solid rgba(249, 115, 22, 0.3)',
                  borderRadius: '16px',
                  padding: '12px 32px',
                  marginTop: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '42px',
                    fontWeight: '900',
                    color: '#f97316', // orange-accent
                    margin: 0,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  {client}
                </span>
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error('Erro gerando imagem OG:', e);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
