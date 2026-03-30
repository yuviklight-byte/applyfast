export default async (req, context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { url, goal } = await req.json();
    const API_KEY = Netlify.env.get('TINYFISH_API_KEY');

    const tfRes = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, goal }),
    });

    // Read the full SSE stream and collect result
    const reader = tfRes.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let finalResult = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullText += chunk;

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(line.slice(6));
          const content =
            d.resultJson || d.result || d.output ||
            d.content || d.text ||
            d?.data?.resultJson || d?.data?.result || '';
          if (content && content.length > finalResult.length) {
            finalResult = content;
          }
        } catch {}
      }
    }

    // Fallback: extract any JSON block from the full stream
    if (!finalResult) {
      const match = fullText.match(/\{[\s\S]*\}/);
      if (match) finalResult = match[0];
    }

    return new Response(
      JSON.stringify({ result: finalResult, raw: fullText.slice(0, 2000) }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
};

export const config = { path: '/api/agent' };
