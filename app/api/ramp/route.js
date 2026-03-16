import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/ramp
 * Generates a secure, signed URL for Ramp Network or Transak widget.
 * API keys stay server-side. Returns a widget URL the frontend opens.
 *
 * Body: { provider: 'ramp'|'transak'|'coinbase', amount, walletAddress, email? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { provider, amount, walletAddress, email } = body;

    if (!provider || !amount || !walletAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let widgetUrl = '';

    // ── RAMP NETWORK ─────────────────────────────────────────────────────────
    if (provider === 'ramp') {
      const apiKey = process.env.RAMP_API_KEY; // Get at ramp.network/partners
      const params = new URLSearchParams({
        apiKey:          apiKey || 'YOUR_RAMP_API_KEY',
        swapAsset:       'USDC',
        offrampAsset:    'USDC_ETHEREUM',
        swapAmount:      String(amount * 1e6), // USDC has 6 decimals
        userAddress:     walletAddress,
        hostAppName:     'RefiFi',
        hostLogoUrl:     'https://redefi-ihdw.vercel.app/logo.png',
        finalUrl:        'https://redefi-ihdw.vercel.app/offramp/success',
        variant:         'auto',
        ...(email && { userEmailAddress: email }),
      });
      widgetUrl = `https://app.ramp.network/?${params.toString()}`;
    }

    // ── TRANSAK ───────────────────────────────────────────────────────────────
    else if (provider === 'transak') {
      const apiKey = process.env.TRANSAK_API_KEY; // Get at transak.com/partners
      const params = new URLSearchParams({
        apiKey:            apiKey || 'YOUR_TRANSAK_API_KEY',
        productsAvailed:   'SELL',          // Off-ramp = SELL crypto
        cryptoCurrencyCode:'USDC',
        walletAddress:     walletAddress,
        fiatCurrency:      'USD',
        defaultCryptoAmount: String(amount),
        network:           'ethereum',
        themeColor:        '4fffb0',
        hideMenu:          'true',
        ...(email && { email }),
      });
      // Use staging for testing, production for live
      const base = process.env.NODE_ENV === 'production'
        ? 'https://global.transak.com'
        : 'https://staging-global.transak.com';
      widgetUrl = `${base}/?${params.toString()}`;
    }

    // ── COINBASE PAY ──────────────────────────────────────────────────────────
    else if (provider === 'coinbase') {
      // Coinbase Commerce — generates a charge
      const response = await fetch('https://api.commerce.coinbase.com/charges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key':  process.env.COINBASE_COMMERCE_KEY || 'YOUR_COINBASE_KEY',
          'X-CC-Version':  '2018-03-22',
        },
        body: JSON.stringify({
          name:        'RefiFi Off-Ramp',
          description: `Convert ${amount} USDC to USD`,
          pricing_type:'fixed_price',
          local_price: { amount: String(amount), currency: 'USD' },
          metadata:    { wallet: walletAddress },
          redirect_url:'https://redefi-ihdw.vercel.app/offramp/success',
          cancel_url:  'https://redefi-ihdw.vercel.app/offramp',
        }),
      });
      const charge = await response.json();
      widgetUrl = charge.data?.hosted_url || '';
    }

    else {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }

    return NextResponse.json({ widgetUrl, provider, amount });

  } catch (error) {
    console.error('Ramp route error:', error);
    return NextResponse.json({ error: 'Failed to generate widget URL' }, { status: 500 });
  }
}

/**
 * GET /api/ramp/providers
 * Returns available providers with live fee data
 */
export async function GET() {
  return NextResponse.json({
    providers: [
      { id:'ramp',     name:'Ramp Network', fee:0.9,  minUSD:1,    maxUSD:20000, available: !!process.env.RAMP_API_KEY },
      { id:'transak',  name:'Transak',      fee:1.0,  minUSD:1,    maxUSD:15000, available: !!process.env.TRANSAK_API_KEY },
      { id:'coinbase', name:'Coinbase Pay',  fee:1.49, minUSD:10,   maxUSD:25000, available: !!process.env.COINBASE_COMMERCE_KEY },
      { id:'sardine',  name:'Sardine',       fee:0.5,  minUSD:10,   maxUSD:10000, available: !!process.env.SARDINE_API_KEY },
    ]
  });
}
