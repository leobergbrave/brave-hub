import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const { origin, searchParams } = new URL(req.url);
    const client = searchParams.get('client') || '';

    // Utilizando objetos puros para evitar problemas de compilação JSX na Vercel
    const children = [
      {
        type: 'img',
        props: {
          src: `${origin}/logo-orcamento.png`,
          width: 280,
          height: 280,
          style: { objectFit: 'contain', marginBottom: '30px' }
        }
      },
      {
        type: 'h1',
        props: {
          style: {
            fontSize: '48px',
            fontWeight: '800',
            color: '#ffffff',
            marginBottom: '10px',
            textTransform: 'uppercase'
          },
          children: 'ORÇAMENTO EXCLUSIVO'
        }
      }
    ];

    if (client) {
      children.push({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            border: '2px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '16px',
            padding: '12px 32px',
            marginTop: '10px',
          },
          children: {
            type: 'span',
            props: {
              style: {
                fontSize: '42px',
                fontWeight: '900',
                color: '#f97316',
                textTransform: 'uppercase'
              },
              children: client
            }
          }
        }
      });
    }

    const element = {
      type: 'div',
      props: {
        style: {
          backgroundColor: '#09090b',
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          padding: '40px',
        },
        children: children
      }
    };

    return new ImageResponse(element, {
      width: 1200,
      height: 630,
    });
  } catch (e) {
    console.error('Erro na API OG:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
