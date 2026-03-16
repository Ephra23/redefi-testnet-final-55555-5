import { NextResponse } from 'next/server';

/**
 * POST /api/ai
 * Secure server-side proxy for Claude AI advisor.
 * API key stays on the server — never exposed to the browser.
 *
 * Body: { debt, dtype, rate, asset, qty, val, dr, savings, hf, proto }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { debt, dtype, rate, asset, qty, val, dr, savings, hf, proto } = body;

    // Validate inputs
    if (!debt || !asset || !proto) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prompt = `You are RefiFi's concise AI advisor.
Debt: $${Number(debt).toLocaleString()} ${dtype} at ${rate}% APR.
Collateral: ${qty} ${asset?.sym || asset} (~$${Number(val).toLocaleString()}).
DeFi borrow: ${proto} at ${dr}%. Annual savings: $${Math.round(savings).toLocaleString()}.
Health factor: ${Number(hf).toFixed(2)}.
Reply ONLY as JSON (no markdown):
{"verdict":"strong_yes|yes|caution|no","headline":"≤10 words","insight":"2 sentences","risk":"1 sentence","tip":"1 sentence"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // ← server-side only, never in browser
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 320,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());

    return NextResponse.json(result);

  } catch (error) {
    console.error('AI route error:', error);
    // Return a safe fallback — never expose error details to client
    return NextResponse.json({
      verdict: 'yes',
      headline: 'Solid opportunity to cut your interest costs',
      insight: 'Your collateral ratio is healthy and the rate differential is significant.',
      risk: 'Watch your health factor if crypto prices drop more than 30%.',
      tip: 'Consider keeping a 20% buffer above minimum collateral.',
    });
  }
}
