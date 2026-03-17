import { NextResponse } from 'next/server';

/**
 * POST /api/alerts/subscribe  — save user email + wallet
 * POST /api/alerts/check      — check all positions and send alerts (called by cron)
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = process.env.FROM_EMAIL || 'alerts@redefi.finance';
const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://redefi-ihdw.vercel.app';

// Aave V3 Mainnet
const AAVE_POOL     = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const ETH_RPC       = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';

// ─── Send email via Resend ────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email not sent');
    return { ok: false, error: 'No API key' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok ? { ok: true } : { ok: false, error: await res.text() };
}

// ─── Fetch Aave health factor for a wallet ───────────────────────────────────
async function getAavePosition(walletAddress) {
  try {
    // Call getUserAccountData(address) on Aave pool
    const data = '0xbf92857c' + walletAddress.replace('0x','').padStart(64,'0');
    const res = await fetch(ETH_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: AAVE_POOL, data }, 'latest'],
      }),
    });
    const { result } = await res.json();
    if (!result || result === '0x') return null;
    // Decode 6 uint256 values
    const vals = [];
    for (let i = 2; i < result.length; i += 64) {
      vals.push(BigInt('0x' + result.slice(i, i + 64)));
    }
    const [collateral, debt, available, , , healthFactorRaw] = vals;
    const healthFactor = Number(healthFactorRaw) / 1e18;
    const collateralUSD = Number(collateral) / 1e8;
    const debtUSD = Number(debt) / 1e8;
    return { healthFactor, collateralUSD, debtUSD, hasPosition: debtUSD > 0 };
  } catch (e) {
    console.error('Aave fetch error:', e);
    return null;
  }
}

// ─── Fetch current ETH price ─────────────────────────────────────────────────
async function getEthPrice() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const d = await r.json();
    return d.ethereum?.usd || 3241;
  } catch { return 3241; }
}

// ─── Fetch current Aave borrow rate ──────────────────────────────────────────
async function getAaveRate() {
  try {
    const r = await fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(5000) });
    const { data } = await r.json();
    const pool = data.find(p => p.project === 'aave-v3' && p.chain === 'Ethereum' && p.symbol?.includes('USDC'));
    return pool ? +pool.apyBaseBorrow.toFixed(2) : 2.87;
  } catch { return 2.87; }
}

// ─── Email Templates ─────────────────────────────────────────────────────────
function emailBase(content) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#04060f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#04060f;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d1520;border-radius:16px;border:1px solid rgba(255,255,255,.08);overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4fffb0,#00d4ff);padding:24px 32px;">
          <h1 style="margin:0;font-size:24px;font-weight:900;color:#04060f;letter-spacing:-0.03em;">RefiFi ↻</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#04060f;opacity:.7;">DeFi Debt Refinance Platform</p>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,.06);">
          <p style="margin:0;font-size:11px;color:#2a3568;line-height:1.6;">
            You're receiving this because you signed up for RefiFi alerts.<br>
            <a href="${APP_URL}" style="color:#4fffb0;text-decoration:none;">Open RefiFi</a> · 
            <a href="${APP_URL}/unsubscribe" style="color:#4fffb0;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function healthWarningEmail({ wallet, healthFactor, collateralUSD, debtUSD, level }) {
  const isLiquidation = level === 'liquidation';
  const color   = isLiquidation ? '#ff4444' : '#f0b429';
  const icon    = isLiquidation ? '🚨' : '⚠️';
  const title   = isLiquidation ? 'LIQUIDATION DANGER' : 'Health Factor Warning';
  const message = isLiquidation
    ? 'Your position is in serious danger of liquidation. You must add collateral or repay debt immediately.'
    : 'Your health factor is getting low. Consider adding more collateral or partially repaying your debt.';

  return emailBase(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
      <h2 style="margin:0;font-size:22px;font-weight:900;color:${color};">${title}</h2>
    </div>
    <div style="background:rgba(255,255,255,.04);border:1px solid ${color}30;border-radius:12px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">
            <span style="font-size:13px;color:#4a5580;">Health Factor</span>
            <span style="float:right;font-family:monospace;font-size:18px;font-weight:800;color:${color};">${healthFactor.toFixed(2)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">
            <span style="font-size:13px;color:#4a5580;">Your Collateral</span>
            <span style="float:right;font-family:monospace;font-size:14px;color:#dde0f0;">$${Math.round(collateralUSD).toLocaleString()}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <span style="font-size:13px;color:#4a5580;">Your Debt</span>
            <span style="float:right;font-family:monospace;font-size:14px;color:#dde0f0;">$${Math.round(debtUSD).toLocaleString()}</span>
          </td>
        </tr>
      </table>
    </div>
    <p style="font-size:14px;color:#8090a0;line-height:1.7;margin:0 0 24px;">${message}</p>
    <div style="background:rgba(79,255,176,.06);border:1px solid rgba(79,255,176,.2);border-radius:10px;padding:14px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#4fffb0;font-weight:700;">💡 How to fix this:</p>
      <p style="margin:6px 0 0;font-size:13px;color:#6070a0;line-height:1.6;">Add more collateral to Aave, or repay part of your USDC debt to bring your health factor above 2.0.</p>
    </div>
    <a href="${APP_URL}" style="display:block;text-align:center;background:${color};color:#04060f;text-decoration:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;">
      Check My Position →
    </a>
  `);
}

function weeklyEmail({ wallet, healthFactor, collateralUSD, debtUSD, weeklySavings, annualSavings, rate }) {
  const hfColor = healthFactor > 2 ? '#4fffb0' : healthFactor > 1.5 ? '#f0b429' : '#ff4444';
  return emailBase(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#dde0f0;">📊 Your Weekly Summary</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#4a5580;">Here's how your RefiFi position is performing</p>
    <div style="display:grid;background:rgba(255,255,255,.04);border-radius:12px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${[
          ['Health Factor', healthFactor.toFixed(2), hfColor],
          ['Collateral Value', '$'+Math.round(collateralUSD).toLocaleString(), '#627EEA'],
          ['Debt Outstanding', '$'+Math.round(debtUSD).toLocaleString(), '#ff8080'],
          ['Borrow APR', rate+'%', '#4fffb0'],
          ['This Week Savings', '$'+Math.round(weeklySavings).toLocaleString(), '#4fffb0'],
          ['Annual Savings', '$'+Math.round(annualSavings).toLocaleString(), '#4fffb0'],
        ].map(([l,v,c]) => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);">
              <span style="font-size:13px;color:#4a5580;">${l}</span>
              <span style="float:right;font-family:monospace;font-size:14px;font-weight:700;color:${c};">${v}</span>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
    <a href="${APP_URL}" style="display:block;text-align:center;background:#4fffb0;color:#04060f;text-decoration:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;">
      View Full Dashboard →
    </a>
  `);
}

function rateAlertEmail({ oldRate, newRate, wallet }) {
  const up = newRate > oldRate;
  return emailBase(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:48px;margin-bottom:12px;">${up ? '📈' : '📉'}</div>
      <h2 style="margin:0;font-size:22px;font-weight:900;color:#dde0f0;">Borrow Rate ${up ? 'Increased' : 'Decreased'}</h2>
    </div>
    <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <div style="font-family:monospace;font-size:14px;color:#4a5580;margin-bottom:8px;">Previous Rate</div>
      <div style="font-family:monospace;font-size:32px;font-weight:900;color:#ff8080;text-decoration:line-through;">${oldRate}%</div>
      <div style="font-size:24px;margin:8px 0;">↓</div>
      <div style="font-family:monospace;font-size:14px;color:#4a5580;margin-bottom:8px;">New Rate</div>
      <div style="font-family:monospace;font-size:32px;font-weight:900;color:#4fffb0;">${newRate}%</div>
    </div>
    <p style="font-size:14px;color:#8090a0;line-height:1.7;margin:0 0 24px;">
      ${up ? 'The Aave V3 USDC borrow rate has increased. Your existing position keeps its current rate, but new borrows will cost more.' : 'Great news! The Aave V3 USDC borrow rate has dropped. You are now saving even more compared to your credit card.'}
    </p>
    <a href="${APP_URL}" style="display:block;text-align:center;background:#4fffb0;color:#04060f;text-decoration:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;">
      View My Position →
    </a>
  `);
}

function priceAlertEmail({ asset, oldPrice, newPrice, dropPct, wallet }) {
  return emailBase(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:48px;margin-bottom:12px;">📉</div>
      <h2 style="margin:0;font-size:22px;font-weight:900;color:#f0b429;">${asset} Price Drop Alert</h2>
    </div>
    <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <div style="font-family:monospace;font-size:14px;color:#4a5580;margin-bottom:4px;">Previous Price</div>
      <div style="font-family:monospace;font-size:28px;font-weight:900;color:#dde0f0;">$${Math.round(oldPrice).toLocaleString()}</div>
      <div style="font-family:monospace;font-size:18px;font-weight:800;color:#ff4444;margin:8px 0;">▼ ${dropPct.toFixed(1)}% drop</div>
      <div style="font-family:monospace;font-size:14px;color:#4a5580;margin-bottom:4px;">Current Price</div>
      <div style="font-family:monospace;font-size:28px;font-weight:900;color:#ff8080;">$${Math.round(newPrice).toLocaleString()}</div>
    </div>
    <p style="font-size:14px;color:#8090a0;line-height:1.7;margin:0 0 24px;">
      A significant price drop in your collateral asset can lower your health factor. Check your position now to make sure you are safe from liquidation.
    </p>
    <a href="${APP_URL}" style="display:block;text-align:center;background:#f0b429;color:#04060f;text-decoration:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;">
      Check My Health Factor →
    </a>
  `);
}

// ─── In-memory store (replace with DB in production) ─────────────────────────
// In production use Vercel KV, PlanetScale, or Supabase
const subscribers = new Map(); // wallet → { email, lastRate, lastPrice, lastWeekly }

// ─── API Route Handler ────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { action, wallet, email, oldRate, oldPrice, asset } = await request.json();

    // ── Subscribe ─────────────────────────────────────────────────────────────
    if (action === 'subscribe') {
      if (!wallet || !email) return NextResponse.json({ error: 'wallet and email required' }, { status: 400 });
      if (!email.includes('@')) return NextResponse.json({ error: 'invalid email' }, { status: 400 });

      subscribers.set(wallet.toLowerCase(), {
        email,
        subscribedAt: Date.now(),
        lastRate: null,
        lastPrice: null,
        lastWeekly: null,
      });

      // Send welcome email
      await sendEmail({
        to: email,
        subject: '✅ RefiFi Alerts Activated',
        html: emailBase(`
          <div style="text-align:center;margin-bottom:28px;">
            <div style="font-size:48px;margin-bottom:12px;">✅</div>
            <h2 style="margin:0;font-size:22px;font-weight:900;color:#4fffb0;">Alerts Activated!</h2>
          </div>
          <p style="font-size:14px;color:#8090a0;line-height:1.7;margin:0 0 20px;">
            You will now receive alerts for:
          </p>
          <ul style="padding-left:20px;color:#8090a0;font-size:14px;line-height:2;">
            <li>⚠️ Health factor warning (below 1.5)</li>
            <li>🚨 Liquidation danger (below 1.2)</li>
            <li>📊 Weekly position summary</li>
            <li>📈 Borrow rate changes</li>
            <li>📉 Collateral price drops</li>
          </ul>
          <a href="${APP_URL}" style="display:block;text-align:center;background:#4fffb0;color:#04060f;text-decoration:none;padding:14px;border-radius:10px;font-size:15px;font-weight:800;margin-top:24px;">
            Open RefiFi →
          </a>
        `),
      });

      return NextResponse.json({ ok: true, message: 'Subscribed! Check your email.' });
    }

    // ── Check all positions (called by Vercel cron) ───────────────────────────
    if (action === 'check') {
      const cronSecret = request.headers.get('x-cron-secret');
      if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const currentRate  = await getAaveRate();
      const currentPrice = await getEthPrice();
      const results = [];

      for (const [walletAddr, sub] of subscribers.entries()) {
        try {
          const position = await getAavePosition(walletAddr);
          if (!position || !position.hasPosition) continue;

          const { healthFactor, collateralUSD, debtUSD } = position;

          // 1. Liquidation danger (HF < 1.2)
          if (healthFactor < 1.2) {
            await sendEmail({
              to: sub.email,
              subject: '🚨 URGENT: Liquidation Danger — RefiFi',
              html: healthWarningEmail({ wallet: walletAddr, healthFactor, collateralUSD, debtUSD, level: 'liquidation' }),
            });
            results.push({ wallet: walletAddr, alert: 'liquidation' });
          }
          // 2. Health factor warning (HF < 1.5)
          else if (healthFactor < 1.5) {
            await sendEmail({
              to: sub.email,
              subject: '⚠️ Health Factor Warning — RefiFi',
              html: healthWarningEmail({ wallet: walletAddr, healthFactor, collateralUSD, debtUSD, level: 'warning' }),
            });
            results.push({ wallet: walletAddr, alert: 'hf_warning' });
          }

          // 3. Rate change alert (more than 0.5% change)
          if (sub.lastRate && Math.abs(currentRate - sub.lastRate) >= 0.5) {
            await sendEmail({
              to: sub.email,
              subject: `📈 Borrow Rate Changed to ${currentRate}% — RefiFi`,
              html: rateAlertEmail({ oldRate: sub.lastRate, newRate: currentRate, wallet: walletAddr }),
            });
            results.push({ wallet: walletAddr, alert: 'rate_change' });
          }

          // 4. Price drop alert (more than 10% drop)
          if (sub.lastPrice && currentPrice < sub.lastPrice * 0.9) {
            const dropPct = ((sub.lastPrice - currentPrice) / sub.lastPrice) * 100;
            await sendEmail({
              to: sub.email,
              subject: `📉 ETH Price Dropped ${dropPct.toFixed(1)}% — RefiFi`,
              html: priceAlertEmail({ asset: 'ETH', oldPrice: sub.lastPrice, newPrice: currentPrice, dropPct, wallet: walletAddr }),
            });
            results.push({ wallet: walletAddr, alert: 'price_drop' });
          }

          // 5. Weekly summary (every 7 days)
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (!sub.lastWeekly || sub.lastWeekly < weekAgo) {
            const annualSavings = debtUSD * (0.22 - currentRate / 100);
            await sendEmail({
              to: sub.email,
              subject: '📊 Your Weekly RefiFi Summary',
              html: weeklyEmail({
                wallet: walletAddr,
                healthFactor,
                collateralUSD,
                debtUSD,
                weeklySavings: annualSavings / 52,
                annualSavings,
                rate: currentRate,
              }),
            });
            sub.lastWeekly = Date.now();
            results.push({ wallet: walletAddr, alert: 'weekly' });
          }

          // Update last known values
          sub.lastRate  = currentRate;
          sub.lastPrice = currentPrice;

        } catch (e) {
          console.error(`Alert check failed for ${walletAddr}:`, e);
        }
      }

      return NextResponse.json({ ok: true, checked: subscribers.size, alerts: results });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('Alerts route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet')?.toLowerCase();
  if (!wallet) return NextResponse.json({ subscribed: false });
  return NextResponse.json({ subscribed: subscribers.has(wallet) });
}
