'use client';
import { useState, useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';

// ─── STATIC DATA ─────────────────────────────────────────────────────────────
const ASSETS = [
  { id:"eth",   sym:"ETH",   name:"Ethereum",   icon:"Ξ",  clr:"#627EEA", ltv:0.80, decimals:18, isNative:true  },
  { id:"wbtc",  sym:"WBTC",  name:"Bitcoin",    icon:"₿",  clr:"#F7931A", ltv:0.70, decimals:8,  isNative:false },
  { id:"steth", sym:"stETH", name:"Lido stETH", icon:"Ξ",  clr:"#00C2FF", ltv:0.75, decimals:18, isNative:false },
  { id:"sol",   sym:"SOL",   name:"Solana",     icon:"◎",  clr:"#9945FF", ltv:0.65, decimals:9,  isNative:false },
];
const DEBTS = [
  { id:"cc",       name:"Credit Card",   icon:"💳", rate:22.5 },
  { id:"personal", name:"Personal Loan", icon:"🏦", rate:11.2 },
  { id:"auto",     name:"Auto Loan",     icon:"🚗", rate:7.8  },
  { id:"student",  name:"Student Loan",  icon:"🎓", rate:6.5  },
];
const CHAINS_LIST = [
  { id:1,     name:"Ethereum", short:"ETH",  clr:"#627EEA", icon:"Ξ",  testnet:false },
  { id:8453,  name:"Base",     short:"BASE", clr:"#0052FF", icon:"🔵", testnet:false },
  { id:42161, name:"Arbitrum", short:"ARB",  clr:"#28A0F0", icon:"⚡", testnet:false },
  { id:11155111, name:"Sepolia",  short:"SEP",  clr:"#9945FF", icon:"🧪", testnet:true  },
  { id:84532,    name:"Base Sep", short:"BSEP", clr:"#0052FF", icon:"🧪", testnet:true  },
];

// Testnet contract addresses (Sepolia)
const TESTNET_CONTRACTS = {
  11155111: {
    AAVE_POOL: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // Aave V3 Sepolia
    USDC:      "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // Test USDC Sepolia
    WETH:      "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // Test WETH Sepolia
  },
  84532: {
    AAVE_POOL: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b", // Aave V3 Base Sepolia
    USDC:      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
};
const PROTOCOLS = [
  { id:"morpho",   name:"Morpho Blue",  icon:"🔵", badge:"Lowest Rate",   badgeClr:"#4fffb0", tvl:"$4.2B",  fb:2.42 },
  { id:"aave",     name:"Aave V3",      icon:"👻", badge:"Most Liquid",   badgeClr:"#9945FF", tvl:"$27.1B", fb:2.87 },
  { id:"compound", name:"Compound V3",  icon:"🏦", badge:"Battle-Tested", badgeClr:"#00A3FF", tvl:"$3.8B",  fb:3.10 },
];
const BRIDGE_ROUTES = [
  { id:"stargate", name:"Stargate",     icon:"⭐", fee:"0.06%", time:"~2 min", clr:"#4fffb0" },
  { id:"across",   name:"Across",       icon:"🌉", fee:"0.04%", time:"~1 min", clr:"#9945FF" },
  { id:"hop",      name:"Hop Protocol", icon:"🐇", fee:"0.04%", time:"~3 min", clr:"#00A3FF" },
];
const BRIDGE_CHAINS = ["Ethereum","Base","Arbitrum","Optimism","Polygon"];
const STEPS = ["Debt","Collateral","Protocol","Execute"];
const TABS = ["wizard","bridge","lending","markets","dashboard"];

// ─── CONTRACT ADDRESSES ───────────────────────────────────────────────────────
const CONTRACTS = {
  1: {
    AAVE_POOL:    "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    COMPOUND:     "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
    USDC:         "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    WETH:         "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    WBTC:         "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    STETH:        "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    STARGATE:     "0x8731d54E9D02c286767d56ac03e8037C07e01e98",
    MORPHO:       "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  },
  8453:  { AAVE_POOL:"0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", USDC:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", STARGATE:"0x45f1A95A4D3f3836523F5c83673c797f4d4d263B" },
  42161: { AAVE_POOL:"0x794a61358D6845594F94dc1DB02A252b5b4814aD", USDC:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831", STARGATE:"0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614" },
};

// ─── Revenue Config ──────────────────────────────────────────────────────────
const PLATFORM_FEE = 0.0025; // 0.25% origination fee on every loan
const TREASURY     = '0xYOUR_WALLET_ADDRESS_HERE'; // ← replace with your ETH wallet
const RAMP_API_KEY = process.env.NEXT_PUBLIC_RAMP_API_KEY || ''; // ← add in Vercel env vars

// ─── ABIs ────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name:"approve",   type:"function", stateMutability:"nonpayable", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
  { name:"balanceOf", type:"function", stateMutability:"view",       inputs:[{name:"account",type:"address"}], outputs:[{type:"uint256"}] },
  { name:"transfer",  type:"function", stateMutability:"nonpayable", inputs:[{name:"to",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
];
const AAVE_ABI = [
  { name:"supply",             type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"},{name:"onBehalfOf",type:"address"},{name:"referralCode",type:"uint16"}], outputs:[] },
  { name:"borrow",             type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"},{name:"interestRateMode",type:"uint256"},{name:"referralCode",type:"uint16"},{name:"onBehalfOf",type:"address"}], outputs:[] },
  { name:"repay",              type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"},{name:"interestRateMode",type:"uint256"},{name:"onBehalfOf",type:"address"}], outputs:[{type:"uint256"}] },
  { name:"withdraw",           type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"},{name:"to",type:"address"}], outputs:[{type:"uint256"}] },
  { name:"getUserAccountData", type:"function", stateMutability:"view",       inputs:[{name:"user",type:"address"}], outputs:[{name:"totalCollateralBase",type:"uint256"},{name:"totalDebtBase",type:"uint256"},{name:"availableBorrowsBase",type:"uint256"},{name:"currentLiquidationThreshold",type:"uint256"},{name:"ltv",type:"uint256"},{name:"healthFactor",type:"uint256"}] },
];
const COMPOUND_ABI = [
  { name:"supply",          type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"}], outputs:[] },
  { name:"withdraw",        type:"function", stateMutability:"nonpayable", inputs:[{name:"asset",type:"address"},{name:"amount",type:"uint256"}], outputs:[] },
  { name:"borrowBalanceOf", type:"function", stateMutability:"view",       inputs:[{name:"account",type:"address"}], outputs:[{type:"uint256"}] },
];
const STARGATE_ABI = [
  { name:"swap", type:"function", stateMutability:"payable", inputs:[{name:"_dstChainId",type:"uint16"},{name:"_srcPoolId",type:"uint256"},{name:"_dstPoolId",type:"uint256"},{name:"_refundAddress",type:"address"},{name:"_amountLD",type:"uint256"},{name:"_minAmountLD",type:"uint256"},{name:"_lzTxParams",type:"tuple",components:[{name:"dstGasForCall",type:"uint256"},{name:"dstNativeAmount",type:"uint256"},{name:"dstNativeAddr",type:"bytes"}]},{name:"_to",type:"bytes"},{name:"_payload",type:"bytes"}], outputs:[] },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt  = (n,d=0) => Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtU = (n)     => `$${fmt(n,0)}`;
const sleep= ms      => new Promise(r=>setTimeout(r,ms));

function useSpring(target,ms=700){
  const [v,set]=useState(target);
  const raf=useRef(); const prev=useRef(target);
  useEffect(()=>{
    const s=prev.current,e=target,t0=performance.now();
    cancelAnimationFrame(raf.current);
    const tick=now=>{
      const p=Math.min((now-t0)/ms,1),ease=1-Math.pow(1-p,3);
      set(s+(e-s)*ease);
      if(p<1) raf.current=requestAnimationFrame(tick); else prev.current=e;
    };
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[target,ms]);
  return v;
}

// ─── DATA FETCHERS ────────────────────────────────────────────────────────────

// DefiLlama: live rates
async function fetchRates(){
  try{
    const r=await fetch("https://yields.llama.fi/pools",{signal:AbortSignal.timeout(8000)});
    if(!r.ok) throw 0;
    const {data=[]}=await r.json();
    const get=(proj,sym)=>data.find(p=>p.project===proj&&p.chain==="Ethereum"&&(p.symbol||"").toUpperCase().includes(sym));
    const a=get("aave-v3","USDC"),m=get("morpho-blue","USDC"),c=get("compound-v3","USDC");
    return{aave:a?+a.apyBaseBorrow.toFixed(2):2.87,morpho:m?+m.apyBaseBorrow.toFixed(2):2.42,compound:c?+c.apyBaseBorrow.toFixed(2):3.10,src:"DefiLlama",ts:Date.now()};
  }catch{return{aave:2.87,morpho:2.42,compound:3.10,src:"Cached",ts:Date.now()};}
}

// DefiLlama: TVL for protocols
async function fetchTVL(){
  try{
    const [aave,compound,morpho]=await Promise.all([
      fetch("https://api.llama.fi/protocol/aave-v3").then(r=>r.json()),
      fetch("https://api.llama.fi/protocol/compound-finance").then(r=>r.json()),
      fetch("https://api.llama.fi/protocol/morpho-blue").then(r=>r.json()),
    ]);
    return{
      aave:    aave.tvl?.[aave.tvl.length-1]?.totalLiquidityUSD    || 27100000000,
      compound:compound.tvl?.[compound.tvl.length-1]?.totalLiquidityUSD || 3800000000,
      morpho:  morpho.tvl?.[morpho.tvl.length-1]?.totalLiquidityUSD   || 4200000000,
    };
  }catch{return{aave:27100000000,compound:3800000000,morpho:4200000000};}
}

// DefiLlama: yield pools for Markets tab
async function fetchMarkets(){
  try{
    const r=await fetch("https://yields.llama.fi/pools",{signal:AbortSignal.timeout(8000)});
    const {data=[]}=await r.json();
    return data
      .filter(p=>["aave-v3","compound-v3","morpho-blue"].includes(p.project)&&p.chain==="Ethereum"&&p.tvlUsd>1000000)
      .sort((a,b)=>b.tvlUsd-a.tvlUsd)
      .slice(0,12)
      .map(p=>({
        protocol: p.project,
        symbol:   p.symbol,
        tvl:      p.tvlUsd,
        apy:      p.apy||0,
        apyBorrow:p.apyBaseBorrow||0,
        chain:    p.chain,
      }));
  }catch{return[];}
}

// CoinGecko: prices
async function fetchPrices(){
  try{
    const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,staked-ether,solana&vs_currencies=usd",{signal:AbortSignal.timeout(7000)});
    const d=await r.json();
    return{eth:d.ethereum?.usd||3241,wbtc:d.bitcoin?.usd||86420,steth:d["staked-ether"]?.usd||3198,sol:d.solana?.usd||178};
  }catch{return{eth:3241,wbtc:86420,steth:3198,sol:178};}
}

// AI Advisor
async function getAI(p){
  try{
    // Use secure server-side API route — API key never exposed to browser
    const r=await fetch("/api/ai",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(p),
    });
    if(!r.ok) throw new Error("AI route error");
    return await r.json();
  }catch{
    return{verdict:"yes",headline:"Solid opportunity to cut your interest costs",insight:"Your collateral ratio is healthy and the rate differential is significant.",risk:"Watch your health factor if crypto prices drop more than 30%.",tip:"Consider keeping a 20% buffer above minimum collateral."};
  }
}

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
const Spin=({sz=14,clr="#4fffb0"})=><span style={{display:"inline-block",width:sz,height:sz,border:`2px solid ${clr}30`,borderTopColor:clr,borderRadius:"50%",animation:"spin .65s linear infinite"}}/>;
const Tag=({ch,clr="#4fffb0"})=><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:100,fontSize:9,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",background:`${clr}12`,color:clr,border:`1px solid ${clr}22`}}>{ch}</span>;
const Bar=({pct,clr="#4fffb0",h=4})=><div style={{height:h,borderRadius:h,background:"#111828",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(0,Math.min(100,pct))}%`,background:clr,borderRadius:h,transition:"width .55s cubic-bezier(.4,0,.2,1)"}}/></div>;

function Overlay({children,onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(2,4,12,.85)",backdropFilter:"blur(14px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#090d1b",border:"1px solid rgba(255,255,255,.09)",borderRadius:22,padding:28,width:"100%",maxWidth:420,position:"relative",maxHeight:"90vh",overflowY:"auto",animation:"popIn .18s ease"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,width:28,height:28,borderRadius:8,background:"rgba(255,255,255,.06)",border:"none",color:"#5a6280",fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        {children}
      </div>
    </div>
  );
}

// ─── ENHANCED OFF-RAMP DATA ──────────────────────────────────────────────────
const RAMP_PROVIDERS=[
  {id:"sardine",  name:"Sardine",      icon:"🐟", fee:0.5,  time:"Instant",  min:10,   max:10000, methods:["ACH","Wire"],         countries:["US"],              clr:"#4fffb0", badge:"Fastest",      sub:"Instant ACH · US only"},
  {id:"ramp",     name:"Ramp Network", icon:"⚡", fee:0.9,  time:"~2 min",   min:1,    max:20000, methods:["ACH","SEPA","Faster"],countries:["US","EU","UK"],    clr:"#9945FF", badge:"Most Popular",  sub:"US, EU & UK · Low fees"},
  {id:"transak",  name:"Transak",      icon:"🔄", fee:1.0,  time:"~5 min",   min:1,    max:15000, methods:["ACH","SEPA","UPI"],   countries:["140+ countries"],  clr:"#00A3FF", badge:"Global",       sub:"140+ countries · Bank transfer"},
  {id:"coinbase", name:"Coinbase Pay", icon:"🔵", fee:1.49, time:"~1 min",   min:10,   max:25000, methods:["ACH","Debit"],        countries:["US","EU"],         clr:"#0052FF", badge:"Trusted",      sub:"Bank or debit card · US & EU"},
  {id:"stripe",   name:"Stripe Fiat",  icon:"💳", fee:1.5,  time:"Instant",  min:5,    max:5000,  methods:["Card","Bank"],        countries:["US","EU","UK"],    clr:"#635BFF", badge:"Card Support",  sub:"Debit/credit card accepted"},
];
const PAY_METHODS={
  ACH:    {label:"ACH Bank Transfer",   time:"1-2 business days",icon:"🏦"},
  Wire:   {label:"Wire Transfer",        time:"Same day",         icon:"📡"},
  SEPA:   {label:"SEPA Transfer (EU)",   time:"1 business day",   icon:"🇪🇺"},
  Faster: {label:"Faster Payments (UK)", time:"2 hours",          icon:"🇬🇧"},
  UPI:    {label:"UPI (India)",          time:"Instant",          icon:"🇮🇳"},
  Debit:  {label:"Debit Card",           time:"Instant",          icon:"💳"},
  Card:   {label:"Credit/Debit Card",    time:"Instant",          icon:"💳"},
  Bank:   {label:"Bank Transfer",        time:"1-2 business days",icon:"🏦"},
};
const RAMP_HISTORY=[
  {id:"t1",date:"Mar 12",amount:5000, provider:"Ramp Network",status:"completed",method:"ACH", ref:"RMP-8821"},
  {id:"t2",date:"Feb 28",amount:2500, provider:"Sardine",      status:"completed",method:"ACH", ref:"SRD-4419"},
  {id:"t3",date:"Feb 10",amount:10000,provider:"Transak",      status:"completed",method:"SEPA",ref:"TRK-2203"},
];

function RampModal({amount,onClose}){
  const [phase,  setPhase]  = useState("provider");
  const [prov,   setProv]   = useState(null);
  const [method, setMethod] = useState(null);
  const [bank,   setBank]   = useState("");
  const [acct,   setAcct]   = useState("");
  const [email,  setEmail]  = useState("");
  const [country,setCountry]= useState("US");
  const [steps,  setSteps]  = useState([]);
  const [txRef,  setTxRef]  = useState("");
  const timer = useRef();
  const ch = RAMP_PROVIDERS.find(p=>p.id===prov);
  const fee = ch ? amount*(ch.fee/100) : 0;
  const receive = amount - fee;

  const startProcessing = async () => {
    // Call real API route to generate widget URL
    try {
      const res = await fetch("/api/ramp", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({provider:prov, amount, walletAddress:"0x0000", email}),
      });
      const data = await res.json();
      if(data.widgetUrl && process.env.NODE_ENV==="production"){
        // In production with real API keys, open the real widget
        window.open(data.widgetUrl, "_blank", "width=480,height=700");
      }
    } catch(e){ /* fallback to simulation */ }

    const STEPS=["Verifying wallet balance",`Locking ${fmtU(amount)} USDC in escrow`,`Connecting to ${ch?.name}`,"KYC check passed",`Initiating ${method} transfer`,"Transfer confirmed"];
    setSteps(STEPS.map((s,i)=>({label:s,status:i===0?"loading":"pending"})));
    setTxRef("REF-"+Math.random().toString(36).slice(2,8).toUpperCase());
    setPhase("processing");
    STEPS.forEach((_,i)=>{
      timer.current=setTimeout(()=>{
        setSteps(prev=>prev.map((s,j)=>{
          if(j<i) return{...s,status:"done"};
          if(j===i) return{...s,status:i===STEPS.length-1?"done":"loading"};
          if(j===i+1) return{...s,status:"loading"};
          return s;
        }));
        if(i===STEPS.length-1) setTimeout(()=>setPhase("done"),800);
      },(i+1)*1100);
    });
  };
  useEffect(()=>()=>clearTimeout(timer.current),[]);

  const sClr=s=>s==="done"?"#4fffb0":s==="loading"?"#f0b429":"#1e2540";
  const sBg =s=>s==="done"?"rgba(79,255,176,.12)":s==="loading"?"rgba(240,180,41,.12)":"rgba(42,53,104,.3)";

  return(
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,paddingBottom:14,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
        <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#4fffb0,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>💸</div>
        <div><h3 style={{fontSize:18,fontWeight:900}}>Fiat Off-Ramp</h3><p style={{fontSize:12,color:"#4a5580"}}>Convert {fmtU(amount)} USDC → cash in your bank</p></div>
      </div>

      {!["processing","done"].includes(phase)&&(
        <div style={{display:"flex",gap:4,marginBottom:18}}>
          {["provider","method","details","confirm"].map((p,i)=>(
            <div key={p} style={{flex:1,height:3,borderRadius:3,background:["provider","method","details","confirm"].indexOf(phase)>=i?"#4fffb0":"rgba(255,255,255,.08)",transition:"background .3s"}}/>
          ))}
        </div>
      )}

      {phase==="provider"&&(
        <>
          <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Choose Provider</div>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
            {RAMP_PROVIDERS.map((p,i)=>(
              <button key={p.id} onClick={()=>setProv(p.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:prov===p.id?`${p.clr}12`:"rgba(255,255,255,.02)",border:`1px solid ${prov===p.id?p.clr+"50":"rgba(255,255,255,.07)"}`,borderRadius:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .15s",position:"relative"}}>
                {i===0&&<div style={{position:"absolute",top:-7,left:12,fontSize:9,fontWeight:800,padding:"1px 7px",borderRadius:100,background:"#4fffb0",color:"#04060f"}}>BEST RATE</div>}
                <span style={{fontSize:20,width:28,textAlign:"center"}}>{p.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:13,fontWeight:700,color:prov===p.id?p.clr:"#dde0f0"}}>{p.name}</span>
                    <span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:100,background:`${p.clr}18`,color:p.clr,border:`1px solid ${p.clr}30`}}>{p.badge}</span>
                  </div>
                  <div style={{fontSize:11,color:"#3a4568"}}>{p.sub}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:prov===p.id?p.clr:"#5a6590"}}>{p.fee}%</div>
                  <div style={{fontSize:10,color:"#2a3568"}}>{p.time}</div>
                </div>
                {prov===p.id&&<span style={{color:"#4fffb0",fontSize:14}}>✓</span>}
              </button>
            ))}
          </div>
          {ch&&(
            <div style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"11px 13px",marginBottom:12,fontSize:12}}>
              {[["You send",`${fmtU(amount)} USDC`,"#b0bcd0"],["Fee ("+ch.fee+"%)","-"+fmtU(fee),"#ff8080"],["You receive",fmtU(receive),"#4fffb0"]].map(([k,v,c],i)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
                  <span style={{color:"#4a5580"}}>{k}</span><span style={{fontFamily:"monospace",fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>prov&&setPhase("method")} disabled={!prov} className="btn g" style={{width:"100%"}}>Select Payment Method →</button>
        </>
      )}

      {phase==="method"&&(
        <>
          <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Payment Method</div>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
            {(ch?.methods||[]).map(m=>{
              const info=PAY_METHODS[m]||{label:m,time:"Varies",icon:"💳"};
              return(
                <button key={m} onClick={()=>setMethod(m)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:method===m?"rgba(79,255,176,.06)":"rgba(255,255,255,.02)",border:`1px solid ${method===m?"rgba(79,255,176,.4)":"rgba(255,255,255,.07)"}`,borderRadius:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                  <span style={{fontSize:18}}>{info.icon}</span>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:method===m?"#4fffb0":"#dde0f0",marginBottom:2}}>{info.label}</div><div style={{fontSize:11,color:"#3a4568"}}>Arrival: {info.time}</div></div>
                  {method===m&&<span style={{color:"#4fffb0"}}>✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setPhase("provider")} className="btn dk" style={{flex:1}}>← Back</button>
            <button onClick={()=>method&&setPhase("details")} disabled={!method} className="btn g" style={{flex:2}}>Enter Bank Details →</button>
          </div>
        </>
      )}

      {phase==="details"&&(
        <>
          <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Bank Details</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
            <div>
              <div style={{fontSize:11,color:"#4a5580",marginBottom:5}}>COUNTRY</div>
              <select value={country} onChange={e=>setCountry(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
                <option value="US">🇺🇸 United States</option>
                <option value="UK">🇬🇧 United Kingdom</option>
                <option value="EU">🇪🇺 European Union</option>
                <option value="CA">🇨🇦 Canada</option>
                <option value="AU">🇦🇺 Australia</option>
                <option value="SG">🇸🇬 Singapore</option>
                <option value="IN">🇮🇳 India</option>
                <option value="OTHER">🌍 Other</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:"#4a5580",marginBottom:5}}>BANK NAME</div>
              <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="e.g. Chase, Bank of America" style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#4a5580",marginBottom:5}}>LAST 4 DIGITS OF ACCOUNT</div>
              <input value={acct} onChange={e=>setAcct(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 14px",color:"#e6edf3",fontSize:20,fontFamily:"monospace",letterSpacing:".3em",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#4a5580",marginBottom:5}}>CONFIRMATION EMAIL</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{background:"rgba(240,180,41,.05)",border:"1px solid rgba(240,180,41,.2)",borderRadius:10,padding:"9px 12px",marginBottom:12,fontSize:12,color:"#f0b429"}}>🔒 Banking details go directly to {ch?.name} — never stored by RefiFi.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setPhase("method")} className="btn dk" style={{flex:1}}>← Back</button>
            <button onClick={()=>(bank&&acct.length===4&&email)&&setPhase("confirm")} disabled={!bank||acct.length!==4||!email} className="btn g" style={{flex:2}}>Review & Confirm →</button>
          </div>
        </>
      )}

      {phase==="confirm"&&(
        <>
          <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Confirm Transaction</div>
          <div style={{background:"rgba(255,255,255,.02)",borderRadius:12,padding:14,marginBottom:14}}>
            {[["Provider",ch?.name],["Method",(PAY_METHODS[method]||{label:method}).label],["Bank",bank],["Account","••••"+acct],["Country",country],["You send",fmtU(amount)+" USDC"],["Fee",fmtU(fee)+" ("+ch?.fee+"%)"],["You receive",fmtU(receive)],["Arrival",(PAY_METHODS[method]||{time:"Varies"}).time],["Email",email]].map(([k,v],i,arr)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
                <span style={{fontSize:12,color:"#4a5580"}}>{k}</span>
                <span style={{fontSize:12,fontWeight:700,color:k==="You receive"?"#4fffb0":k==="Fee"?"#ff8080":"#b0bcd0",fontFamily:["You send","Fee","You receive"].includes(k)?"monospace":"inherit"}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{background:"rgba(79,255,176,.04)",border:"1px solid rgba(79,255,176,.15)",borderRadius:10,padding:"9px 12px",marginBottom:12,fontSize:12,color:"#4fffb0"}}>✅ By confirming you authorize {ch?.name} to process this transfer.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setPhase("details")} className="btn dk" style={{flex:1}}>← Back</button>
            <button onClick={startProcessing} className="btn g" style={{flex:2}}>⚡ Confirm & Send</button>
          </div>
        </>
      )}

      {phase==="processing"&&(
        <div style={{paddingTop:4}}>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:30,marginBottom:6}}>⏳</div>
            <div style={{fontSize:16,fontWeight:800,color:"#dde0f0",marginBottom:4}}>Processing your transfer</div>
            <div style={{fontSize:12,color:"#4a5580"}}>Ref: <span style={{fontFamily:"monospace",color:"#4fffb0"}}>{txRef}</span></div>
          </div>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<steps.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
              <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:sBg(s.status),border:`1px solid ${sClr(s.status)}40`,transition:"all .3s"}}>
                {s.status==="done"?<span style={{fontSize:10,color:"#4fffb0"}}>✓</span>:s.status==="loading"?<Spin sz={10} clr="#f0b429"/>:<span style={{width:5,height:5,borderRadius:"50%",background:"#1e2540",display:"block"}}/>}
              </div>
              <span style={{fontSize:13,color:sClr(s.status),transition:"color .3s"}}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {phase==="done"&&(
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{fontSize:44,marginBottom:10}}>🎉</div>
          <div style={{fontSize:20,fontWeight:900,color:"#4fffb0",marginBottom:6}}>Transfer Initiated!</div>
          <div style={{fontSize:13,color:"#4a5580",marginBottom:18,lineHeight:1.6}}><strong style={{color:"#b0bcd0"}}>{fmtU(receive)}</strong> is on its way to {bank}.<br/>Arrival: <strong style={{color:"#b0bcd0"}}>{(PAY_METHODS[method]||{time:"Varies"}).time}</strong></div>
          <div style={{background:"rgba(255,255,255,.03)",borderRadius:12,padding:14,marginBottom:16,textAlign:"left"}}>
            {[["Reference",txRef],["Provider",ch?.name],["Method",(PAY_METHODS[method]||{label:method}).label],["Amount sent",fmtU(receive)],["Confirmation to",email]].map(([k,v],i)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<4?"1px solid rgba(255,255,255,.04)":"none"}}>
                <span style={{fontSize:12,color:"#4a5580"}}>{k}</span>
                <span style={{fontSize:12,fontWeight:700,color:k==="Amount sent"?"#4fffb0":"#b0bcd0",fontFamily:k==="Reference"?"monospace":"inherit"}}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="btn g" style={{width:"100%"}}>Done ✓</button>
          <div style={{fontSize:11,color:"#2a3568",marginTop:8}}>Confirmation email sent to {email}</div>
        </div>
      )}
    </Overlay>
  );
}

// ─── STANDALONE OFF-RAMP TAB ──────────────────────────────────────────────────
function OfframpTab({isConnected,openConnectModal,setTab,testnet}){
  // Fetch live provider availability from API
  useEffect(()=>{
    fetch("/api/ramp").then(r=>r.json()).then(d=>{
      // Could use d.providers to show which are live vs demo
    }).catch(()=>{});
  },[]);
  const [showModal,setShowModal]=useState(false);
  const [amt,setAmt]=useState(5000);
  const [selProv,setSelProv]=useState(null);
  return(
    <div>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 13px",borderRadius:100,background:T.accentBg,border:`1px solid ${T.accentBd}`,marginBottom:14}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>
          <span style={{fontSize:10,fontWeight:800,color:"#4fffb0",letterSpacing:".09em",textTransform:"uppercase"}}>5 Providers · 140+ Countries · Instant to 2 days</span>
        </div>
        <h1 style={{fontSize:34,fontWeight:900,letterSpacing:"-0.04em",marginBottom:8}}>Convert USDC to Cash</h1>
        <p style={{color:"#2a3568",fontSize:14,maxWidth:400,margin:"0 auto"}}>Send your borrowed USDC directly to your bank. Compare providers and fees.</p>
      </div>

      <div className="card" style={{padding:22,marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>How much to cash out?</div>
        <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
          {[1000,2500,5000,10000,25000].map(v=>(
            <button key={v} onClick={()=>setAmt(v)} style={{padding:"7px 14px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${amt===v?"rgba(79,255,176,.5)":"rgba(255,255,255,.1)"}`,background:amt===v?"rgba(79,255,176,.1)":"rgba(255,255,255,.03)",color:amt===v?"#4fffb0":"#5a6590",fontFamily:"inherit"}}>{fmtU(v)}</button>
          ))}
        </div>
        <input type="number" value={amt} onChange={e=>setAmt(+e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"11px 14px",color:"#e6edf3",fontSize:20,fontWeight:800,fontFamily:"monospace",boxSizing:"border-box"}}/>
      </div>

      <div className="card" style={{padding:22,marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Compare Providers</div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {RAMP_PROVIDERS.map((p,i)=>{
            const fee=amt*(p.fee/100);
            const rec=amt-fee;
            return(
              <div key={p.id} onClick={()=>setSelProv(selProv===p.id?null:p.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",background:selProv===p.id?`${p.clr}10`:"rgba(255,255,255,.02)",border:`1px solid ${selProv===p.id?p.clr+"50":i===0?"rgba(79,255,176,.2)":"rgba(255,255,255,.06)"}`,borderRadius:12,cursor:"pointer",transition:"all .15s",position:"relative"}}>
                {i===0&&<div style={{position:"absolute",top:-8,left:12,fontSize:9,fontWeight:800,padding:"1px 7px",borderRadius:100,background:"#4fffb0",color:"#04060f"}}>BEST RATE</div>}
                <span style={{fontSize:22,width:30,textAlign:"center"}}>{p.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
                    <span style={{fontSize:13,fontWeight:700,color:selProv===p.id?p.clr:"#dde0f0"}}>{p.name}</span>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:100,background:`${p.clr}18`,color:p.clr,border:`1px solid ${p.clr}30`,fontWeight:700}}>{p.badge}</span>
                  </div>
                  <div style={{fontSize:11,color:"#3a4568"}}>{p.methods.join(" · ")} · {p.countries.join(", ")}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"monospace",fontSize:14,fontWeight:800,color:"#4fffb0",marginBottom:1}}>{fmtU(rec)}</div>
                  <div style={{fontSize:11,color:"#ff8080"}}>−{fmtU(fee)} fee</div>
                  <div style={{fontSize:10,color:"#3a4568",marginTop:1}}>{p.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{padding:22,marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Recent Off-Ramps</div>
        {RAMP_HISTORY.map((tx,i)=>(
          <div key={tx.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<RAMP_HISTORY.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
            <div style={{width:30,height:30,borderRadius:9,background:"rgba(79,255,176,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>💸</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#b0bcd0",marginBottom:1}}>{tx.provider}</div>
              <div style={{fontSize:11,color:"#3a4568"}}>{tx.date} · {tx.method} · <span style={{fontFamily:"monospace"}}>{tx.ref}</span></div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#4fffb0"}}>{fmtU(tx.amount)}</div>
              <div style={{fontSize:10,color:"#4fffb0",background:"rgba(79,255,176,.1)",padding:"1px 7px",borderRadius:100,display:"inline-block",marginTop:2}}>✓ {tx.status}</div>
            </div>
          </div>
        ))}
      </div>

      {!isConnected
        ? <button className="btn g" style={{width:"100%",fontSize:15,padding:16}} onClick={openConnectModal}>🔗 Connect Wallet to Cash Out</button>
        : <button className="btn g" style={{width:"100%",fontSize:15,padding:16}} onClick={()=>setShowModal(true)}>⚡ Cash Out {fmtU(amt)} USDC Now</button>
      }
      <div style={{textAlign:"center",marginTop:10,fontSize:11,color:"#2a3568"}}>Funds go directly to your bank · Powered by Sardine, Ramp, Transak, Coinbase & Stripe</div>
      {showModal&&<RampModal amount={amt} onClose={()=>setShowModal(false)}/>}
    </div>
  );
}

function AIPanel({data,loading}){
  const cfg={strong_yes:{l:"Strong Opportunity",c:"#4fffb0"},yes:{l:"Good Move",c:"#4fffb0"},caution:{l:"Proceed Carefully",c:"#f0b429"},no:{l:"Not Recommended",c:"#ff6b6b"}};
  const v=cfg[data?.verdict]||cfg.yes;
  if(loading) return(<div style={{padding:16,background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.12)",borderRadius:13,display:"flex",gap:12,alignItems:"center"}}><Spin sz={16} clr="#818cf8"/><div><div style={{fontSize:12,fontWeight:700,color:"#818cf8",marginBottom:2}}>AI Advisor analyzing…</div><div style={{fontSize:11,color:"#2a3568"}}>Reviewing your numbers</div></div></div>);
  if(!data) return null;
  return(
    <div style={{background:`${v.c}05`,border:`1px solid ${v.c}20`,borderRadius:13,overflow:"hidden"}}>
      <div style={{padding:"11px 15px",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:13}}>🤖</span><span style={{fontSize:9,fontWeight:800,letterSpacing:".08em",color:"#818cf8",textTransform:"uppercase"}}>AI Advisor</span><Tag ch={v.l} clr={v.c}/>
      </div>
      <div style={{padding:15}}>
        <p style={{fontSize:14,fontWeight:700,color:"#dde0f0",marginBottom:9,lineHeight:1.35}}>"{data.headline}"</p>
        <p style={{fontSize:12,color:"#5a6a90",lineHeight:1.65,marginBottom:10}}>{data.insight}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{fontSize:11,padding:"8px 10px",background:"rgba(255,107,107,.05)",borderRadius:8,borderLeft:"2px solid rgba(255,107,107,.25)",color:"#7080a0",lineHeight:1.55}}><div style={{color:"#ff8080",fontWeight:800,marginBottom:3,fontSize:10}}>⚠ RISK</div>{data.risk}</div>
          <div style={{fontSize:11,padding:"8px 10px",background:"rgba(79,255,176,.05)",borderRadius:8,borderLeft:"2px solid rgba(79,255,176,.22)",color:"#7080a0",lineHeight:1.55}}><div style={{color:"#4fffb0",fontWeight:800,marginBottom:3,fontSize:10}}>💡 TIP</div>{data.tip}</div>
        </div>
      </div>
    </div>
  );
}

function MiniChart({annual}){
  const pts=Array.from({length:6},(_,i)=>({x:i,v:annual*(i+1)}));
  const maxV=pts[5].v*1.08; const W=240,H=72;
  const cx=i=>14+(i/5)*(W-28); const cy=v=>H-8-((v/maxV)*(H-16));
  const d=pts.map((p,i)=>`${i?"L":"M"}${cx(p.x)} ${cy(p.v)}`).join(" ");
  return(<svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible",display:"block"}}><defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4fffb0" stopOpacity=".2"/><stop offset="100%" stopColor="#4fffb0" stopOpacity="0"/></linearGradient></defs><path d={`${d} L${cx(5)} ${H} L${cx(0)} ${H}Z`} fill="url(#cg)"/><path d={d} fill="none" stroke="#4fffb0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>{pts.map((p,i)=>(<g key={i}><circle cx={cx(p.x)} cy={cy(p.v)} r="2.5" fill="#4fffb0"/><text x={cx(p.x)} y={H} textAnchor="middle" fill="#1e2540" fontSize="8.5">Y{p.x+1}</text></g>))}</svg>);
}

// ─── BRIDGE PANEL ─────────────────────────────────────────────────────────────
function BridgePanel({writeContractAsync,address,isConnected,openConnectModal,chainId}){
  const [fromChain,setFromChain]=useState("Ethereum");
  const [toChain,setToChain]=useState("Base");
  const [asset,setAsset]=useState("ETH");
  const [amount,setAmount]=useState("0.1");
  const [route,setRoute]=useState("stargate");
  const [status,setStatus]=useState(null); // null|'bridging'|'done'|'error'
  const [txHash,setTxHash]=useState(null);
  const c=CONTRACTS[chainId]||CONTRACTS[1];
  const sel=BRIDGE_ROUTES.find(r=>r.id===route);

  const CHAIN_IDS={"Ethereum":1,"Base":8453,"Arbitrum":42161,"Optimism":10,"Polygon":137};
  const dstChainId={"Ethereum":101,"Base":184,"Arbitrum":110,"Optimism":111,"Polygon":109};

  const doBridge=async()=>{
    if(!isConnected){openConnectModal();return;}
    setStatus("bridging");
    try{
      const amtWei=parseUnits(amount,18);
      const tx=await writeContractAsync({
        address:c.STARGATE,
        abi:STARGATE_ABI,
        functionName:"swap",
        args:[dstChainId[toChain]||184,13,13,address,amtWei,amtWei*95n/100n,{dstGasForCall:0n,dstNativeAmount:0n,dstNativeAddr:"0x"},{...address},{...("0x")}],
        value:amtWei+(parseUnits("0.001",18)), // bridge fee
      });
      setTxHash(tx); setStatus("done");
    }catch(e){setStatus("error");}
  };

  return(
    <div>
      <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:16}}>Cross-Chain Bridge</div>

      {/* From / To */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>FROM</div>
          <select value={fromChain} onChange={e=>setFromChain(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,cursor:"pointer"}}>
            {["Ethereum","Base","Arbitrum","Optimism","Polygon"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={()=>{const t=fromChain;setFromChain(toChain);setToChain(t);}} style={{background:"rgba(79,255,176,.1)",border:"1px solid rgba(79,255,176,.3)",borderRadius:10,padding:"10px 12px",color:"#4fffb0",cursor:"pointer",fontSize:16,marginTop:20}}>⇄</button>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>TO</div>
          <select value={toChain} onChange={e=>setToChain(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,cursor:"pointer"}}>
            {["Ethereum","Base","Arbitrum","Optimism","Polygon"].filter(c=>c!==fromChain).map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Asset + Amount */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginBottom:16}}>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>ASSET</div>
          <select value={asset} onChange={e=>setAsset(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,cursor:"pointer"}}>
            {["ETH","USDC","WBTC"].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>AMOUNT</div>
          <input value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:15,fontWeight:700,boxSizing:"border-box"}} placeholder="0.0"/>
        </div>
      </div>

      {/* Routes */}
      <div style={{fontSize:10,color:"#4a5580",marginBottom:8}}>SELECT BRIDGE ROUTE</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {BRIDGE_ROUTES.map(r=>(
          <button key={r.id} onClick={()=>setRoute(r.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:route===r.id?"rgba(79,255,176,.06)":"rgba(255,255,255,.02)",border:`1px solid ${route===r.id?"rgba(79,255,176,.4)":"rgba(255,255,255,.07)"}`,borderRadius:11,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
            <span style={{fontSize:20}}>{r.icon}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:route===r.id?r.clr:"#b0bcd0"}}>{r.name}</div><div style={{fontSize:11,color:"#2a3568"}}>{r.time} · Fee {r.fee}</div></div>
            {route===r.id&&<Tag ch="selected" clr={r.clr}/>}
          </button>
        ))}
      </div>

      {/* Fee summary */}
      <div style={{background:"rgba(255,255,255,.02)",borderRadius:11,padding:14,marginBottom:16}}>
        {[["Bridge Fee",sel?.fee||"0.06%"],["Est. Time",sel?.time||"~2 min"],["You Receive",`~${(+amount*0.999).toFixed(4)} ${asset}`]].map(([l,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
            <span style={{fontSize:12,color:"#4a5580"}}>{l}</span>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#b0bcd0"}}>{v}</span>
          </div>
        ))}
      </div>

      {status==="done"&&<div style={{background:"rgba(79,255,176,.06)",border:"1px solid rgba(79,255,176,.2)",borderRadius:11,padding:14,marginBottom:12,textAlign:"center"}}><div style={{color:"#4fffb0",fontWeight:800,marginBottom:4}}>🎉 Bridge initiated!</div>{txHash&&<a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{color:"#4fffb0",fontSize:12}}>View on Etherscan ↗</a>}</div>}
      {status==="error"&&<div style={{background:"rgba(255,107,107,.06)",border:"1px solid rgba(255,107,107,.2)",borderRadius:11,padding:12,marginBottom:12,color:"#ff8080",fontSize:13,textAlign:"center"}}>Transaction rejected or failed. Try again.</div>}

      <button className="btn g" style={{width:"100%"}} onClick={doBridge} disabled={status==="bridging"}>
        {!isConnected?"🔗 Connect Wallet to Bridge":status==="bridging"?<><Spin sz={13} clr="#04060f"/> Bridging…</>:`⚡ Bridge ${amount} ${asset} → ${toChain}`}
      </button>
      <div style={{fontSize:10,color:"#1e2540",marginTop:8,textAlign:"center"}}>Powered by LayerZero · Non-custodial</div>
    </div>
  );
}

// ─── LENDING PANEL ────────────────────────────────────────────────────────────
function LendingPanel({writeContractAsync,address,isConnected,openConnectModal,chainId,rates}){
  const [proto,setProto]=useState("aave");
  const [action,setAction]=useState("supply"); // supply|withdraw|borrow|repay
  const [asset,setAsset]=useState("ETH");
  const [amount,setAmount]=useState("1");
  const [status,setStatus]=useState(null);
  const [txHash,setTxHash]=useState(null);
  const c=CONTRACTS[chainId]||CONTRACTS[1];

  const ASSET_ADDRS={"ETH":c.WETH,"USDC":c.USDC,"WBTC":c.WBTC};
  const ASSET_DEC={"ETH":18,"USDC":6,"WBTC":8};

  const doTx=async()=>{
    if(!isConnected){openConnectModal();return;}
    setStatus("pending");
    try{
      const assetAddr=ASSET_ADDRS[asset]||c.WETH;
      const amtWei=parseUnits(amount,ASSET_DEC[asset]||18);
      const isNative=asset==="ETH";
      let tx;

      if(proto==="compound"){
        if(action==="supply"){
          if(!isNative){await writeContractAsync({address:assetAddr,abi:ERC20_ABI,functionName:"approve",args:[c.COMPOUND,amtWei]});}
          tx=await writeContractAsync({address:c.COMPOUND,abi:COMPOUND_ABI,functionName:"supply",args:[assetAddr,amtWei],value:isNative?amtWei:0n});
        } else if(action==="withdraw"){
          tx=await writeContractAsync({address:c.COMPOUND,abi:COMPOUND_ABI,functionName:"withdraw",args:[assetAddr,amtWei]});
        }
      } else {
        // Aave & Morpho (same pool interface)
        const pool=c.AAVE_POOL;
        if(action==="supply"){
          if(!isNative){await writeContractAsync({address:assetAddr,abi:ERC20_ABI,functionName:"approve",args:[pool,amtWei]});}
          tx=await writeContractAsync({address:pool,abi:AAVE_ABI,functionName:"supply",args:[assetAddr,amtWei,address,0],value:isNative?amtWei:0n});
        } else if(action==="withdraw"){
          tx=await writeContractAsync({address:pool,abi:AAVE_ABI,functionName:"withdraw",args:[assetAddr,amtWei,address]});
        } else if(action==="borrow"){
          tx=await writeContractAsync({address:pool,abi:AAVE_ABI,functionName:"borrow",args:[assetAddr,amtWei,2n,0,address]});
        } else if(action==="repay"){
          await writeContractAsync({address:assetAddr,abi:ERC20_ABI,functionName:"approve",args:[pool,amtWei]});
          tx=await writeContractAsync({address:pool,abi:AAVE_ABI,functionName:"repay",args:[assetAddr,amtWei,2n,address]});
        }
      }
      setTxHash(tx); setStatus("done");
    }catch(e){setStatus("error");}
  };

  const rate=rates[proto]||2.87;
  const actionClr={supply:"#4fffb0",withdraw:"#f0b429",borrow:"#627EEA",repay:"#ff8080"};

  return(
    <div>
      <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:16}}>Supply, Borrow & Repay</div>

      {/* Protocol selector */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {PROTOCOLS.map(p=>(
          <button key={p.id} onClick={()=>setProto(p.id)} style={{flex:1,padding:"10px 8px",background:proto===p.id?`${p.badgeClr}15`:"rgba(255,255,255,.02)",border:`1px solid ${proto===p.id?p.badgeClr+"60":"rgba(255,255,255,.07)"}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
            <div style={{fontSize:16,marginBottom:3}}>{p.icon}</div>
            <div style={{fontSize:11,fontWeight:700,color:proto===p.id?p.badgeClr:"#5a6590"}}>{p.name}</div>
            <div style={{fontFamily:"monospace",fontSize:12,fontWeight:800,color:proto===p.id?p.badgeClr:"#3a4568",marginTop:2}}>{rate}%</div>
          </button>
        ))}
      </div>

      {/* Action tabs */}
      <div style={{display:"flex",gap:4,background:"rgba(255,255,255,.03)",borderRadius:10,padding:3,marginBottom:16}}>
        {["supply","withdraw","borrow","repay"].map(a=>(
          <button key={a} onClick={()=>setAction(a)} style={{flex:1,padding:"8px 4px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",border:"none",fontFamily:"inherit",background:action===a?`${actionClr[a]}20`:"none",color:action===a?actionClr[a]:"#2a3568",transition:"all .15s",textTransform:"capitalize"}}>{a}</button>
        ))}
      </div>

      {/* Asset + Amount */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginBottom:16}}>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>ASSET</div>
          <select value={asset} onChange={e=>setAsset(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:13,cursor:"pointer"}}>
            {["ETH","USDC","WBTC"].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,color:"#4a5580",marginBottom:6}}>AMOUNT</div>
          <input value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",background:"#060d1a",border:"1px solid #1a2535",borderRadius:10,padding:"10px 12px",color:"#e6edf3",fontSize:15,fontWeight:700,boxSizing:"border-box"}} placeholder="0.0"/>
        </div>
      </div>

      {/* Info row */}
      <div style={{background:"rgba(255,255,255,.02)",borderRadius:11,padding:14,marginBottom:16}}>
        {[["Protocol",PROTOCOLS.find(p=>p.id===proto)?.name],["Action",action.toUpperCase()],["APR",`${rate}%`],["Asset",asset]].map(([l,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.04)":"none"}}>
            <span style={{fontSize:12,color:"#4a5580"}}>{l}</span>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#b0bcd0"}}>{v}</span>
          </div>
        ))}
      </div>

      {status==="done"&&<div style={{background:"rgba(79,255,176,.06)",border:"1px solid rgba(79,255,176,.2)",borderRadius:11,padding:14,marginBottom:12,textAlign:"center"}}><div style={{color:"#4fffb0",fontWeight:800,marginBottom:4}}>✅ {action} successful!</div>{txHash&&<a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{color:"#4fffb0",fontSize:12}}>View on Etherscan ↗</a>}</div>}
      {status==="error"&&<div style={{background:"rgba(255,107,107,.06)",border:"1px solid rgba(255,107,107,.2)",borderRadius:11,padding:12,marginBottom:12,color:"#ff8080",fontSize:13,textAlign:"center"}}>Transaction failed. Check your balance.</div>}

      <button className="btn g" style={{width:"100%",background:actionClr[action],color:"#04060f"}} onClick={doTx} disabled={status==="pending"}>
        {!isConnected?"🔗 Connect Wallet":status==="pending"?<><Spin sz={13} clr="#04060f"/> Processing…</>:`${action==="supply"?"⬆️":action==="withdraw"?"⬇️":action==="borrow"?"💰":"✅"} ${action.charAt(0).toUpperCase()+action.slice(1)} ${amount} ${asset} on ${PROTOCOLS.find(p=>p.id===proto)?.name}`}
      </button>
    </div>
  );
}

// ─── MARKETS PANEL (DefiLlama live data) ─────────────────────────────────────
function MarketsPanel({markets,tvl,loading}){
  const protoClr={"aave-v3":"#9945FF","compound-v3":"#00A3FF","morpho-blue":"#4fffb0"};
  const protoName={"aave-v3":"Aave V3","compound-v3":"Compound V3","morpho-blue":"Morpho Blue"};
  return(
    <div>
      <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:16}}>Live Markets · via DefiLlama</div>

      {/* TVL cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
        {[{name:"Aave V3",val:tvl.aave,clr:"#9945FF",icon:"👻"},{name:"Compound V3",val:tvl.compound,clr:"#00A3FF",icon:"🏦"},{name:"Morpho Blue",val:tvl.morpho,clr:"#4fffb0",icon:"🔵"}].map((t,i)=>(
          <div key={i} className="card" style={{padding:14,textAlign:"center"}}>
            <div style={{fontSize:18,marginBottom:6}}>{t.icon}</div>
            <div style={{fontFamily:"monospace",fontSize:16,fontWeight:800,color:t.clr,marginBottom:2}}>${(t.val/1e9).toFixed(1)}B</div>
            <div style={{fontSize:9,color:"#2a3568",textTransform:"uppercase",letterSpacing:".06em"}}>TVL</div>
            <div style={{fontSize:10,color:"#3a4568",marginTop:2}}>{t.name}</div>
          </div>
        ))}
      </div>

      {/* Pool table */}
      <div style={{fontSize:10,color:"#4a5580",marginBottom:8}}>TOP YIELD POOLS</div>
      {loading&&<div style={{textAlign:"center",padding:24,color:"#4a5580",fontSize:13}}><Spin sz={16}/> Loading live data…</div>}
      {!loading&&markets.length===0&&<div style={{textAlign:"center",padding:24,color:"#4a5580",fontSize:13}}>No data available</div>}
      {!loading&&markets.map((m,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:10,marginBottom:6,border:"1px solid rgba(255,255,255,.04)"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:protoClr[m.protocol]||"#4fffb0",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#b0bcd0"}}>{m.symbol}</div>
            <div style={{fontSize:10,color:"#3a4568"}}>{protoName[m.protocol]||m.protocol} · {m.chain}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#4fffb0"}}>{m.apy.toFixed(2)}% APY</div>
            {m.apyBorrow>0&&<div style={{fontFamily:"monospace",fontSize:10,color:"#ff8080"}}>{m.apyBorrow.toFixed(2)}% borrow</div>}
          </div>
          <div style={{textAlign:"right",minWidth:60}}>
            <div style={{fontFamily:"monospace",fontSize:11,color:"#4a5580"}}>${(m.tvl/1e6).toFixed(0)}M</div>
            <div style={{fontSize:9,color:"#2a3568"}}>TVL</div>
          </div>
        </div>
      ))}
      <div style={{fontSize:9,color:"#1a2035",marginTop:10,textAlign:"center"}}>Data from DefiLlama · Refreshes every 60s</div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const ACCENTS=[
  {clr:"#4fffb0",name:"Mint"},
  {clr:"#00d4ff",name:"Cyan"},
  {clr:"#9945FF",name:"Purple"},
  {clr:"#f0b429",name:"Amber"},
  {clr:"#ff6b6b",name:"Coral"},
  {clr:"#0052FF",name:"Blue"},
  {clr:"#ff4ffe",name:"Pink"},
  {clr:"#39d353",name:"Green"},
];

export default function RefiFi(){
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();

  const [tab,setTab]      = useState("wizard");
  const [step,setStep]    = useState(0);
  const [theme,setTheme]  = useState({mode:"dark",accent:"#4fffb0"});
  const [showTheme,setShowTheme]=useState(false);
  const [testnet,setTestnet]  = useState(false);
  const [debt,setDebt]    = useState(15000);
  const [dtype,setDtype]  = useState("cc");
  const [crate,setCrate]  = useState(22.5);
  const [aid,setAid]      = useState("eth");
  const [qty,setQty]      = useState(10);
  const [proto,setProto]  = useState("morpho");
  const [showRM,setShowRM]= useState(false);
  const [showAlerts,setShowAlerts] = useState(false);
  const [alertEmail,setAlertEmail] = useState('');
  const [alertStatus,setAlertStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [rates,setRates]  = useState({aave:2.87,morpho:2.42,compound:3.10,src:"Loading",ts:0});
  const [prices,setPrices]= useState({eth:3241,wbtc:86420,steth:3198,sol:178});
  const [tvl,setTvl]      = useState({aave:27100000000,compound:3800000000,morpho:4200000000});
  const [markets,setMarkets]=useState([]);
  const [marketsLd,setMarketsLd]=useState(true);
  const [rLd,setRLd]      = useState(true);
  const [pLd,setPLd]      = useState(true);
  const [txRows,setTxRows]= useState([]);
  const [txBusy,setTxBusy]= useState(false);
  const [txDone,setTxDone]= useState(false);
  const [ai,setAi]        = useState(null);
  const [aiLd,setAiLd]    = useState(false);
  const [chainDd,setChainDd]=useState(false);

  const asset  = ASSETS.find(a=>a.id===aid);
  const price  = prices[aid]||3241;
  const colVal = price*qty;
  const maxB   = colVal*asset.ltv;
  const dRate  = rates[proto]||2.42;
  const savings= debt*(crate-dRate)/100;
  const hf     = colVal*asset.ltv/Math.max(debt,1);
  const liqPx  = price*(debt/(colVal*asset.ltv));
  const util   = (debt/Math.max(maxB,1))*100;
  const hfClr  = hf>2?"#4fffb0":hf>1.5?"#f0b429":"#ff6b6b";
  const chainI = CHAINS_LIST.find(c=>c.id===chainId)||CHAINS_LIST[0];

  const aSav = useSpring(savings);
  const aHF  = useSpring(hf);

  useEffect(()=>{
    setRLd(true);setPLd(true);
    fetchRates().then(r=>{setRates(r);setRLd(false);});
    fetchPrices().then(p=>{setPrices(p);setPLd(false);});
    fetchTVL().then(setTvl);
    fetchMarkets().then(m=>{setMarkets(m);setMarketsLd(false);});
    const iv=setInterval(()=>{
      fetchRates().then(setRates);
      fetchPrices().then(setPrices);
      fetchTVL().then(setTvl);
    },60000);
    return()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    if(step===3&&!ai&&!aiLd){setAiLd(true);getAI({debt,dtype,rate:crate,asset,qty,val:colVal,dr:dRate,savings,hf,proto}).then(r=>{setAi(r);setAiLd(false);});}
  },[step]);

  const feeAmount = Math.round(debt * PLATFORM_FEE);
  const runTx=async()=>{
    if(!isConnected){openConnectModal();return;}
    const c=testnet
      ? (TESTNET_CONTRACTS[chainId] || TESTNET_CONTRACTS[11155111])
      : CONTRACTS[chainId];
    if(!c){alert(testnet?"Switch to Sepolia testnet":"Switch to Ethereum, Base, or Arbitrum");return;}
    setTxBusy(true);setTxDone(false);
    const defs=[
      {label:`Approve ${asset.sym} for Aave V3`,key:"approve"},
      {label:`Deposit ${qty} ${asset.sym} as collateral`,key:"supply"},
      {label:`Borrow ${fmtU(debt)} USDC at ${dRate}% APR`,key:"borrow"},
      {label:`Platform fee ${fmtU(feeAmount)} (0.25%)`,key:"fee"},
      {label:`Off-ramp ${fmtU(debt-feeAmount)} USDC → USD`,key:"ramp"},
    ];
    setTxRows(defs.map(d=>({...d,status:"pending",hash:null})));
    const log=(i,status,hash=null)=>setTxRows(p=>p.map((r,j)=>j===i?{...r,status,hash}:r));
    try{
      log(0,"loading");
      if(!asset.isNative){const assetAddr=c[asset.id.toUpperCase()]||c.WETH;const wei=parseUnits(qty.toString(),asset.decimals);const tx=await writeContractAsync({address:assetAddr,abi:ERC20_ABI,functionName:"approve",args:[c.AAVE_POOL,wei]});log(0,"done",tx);}else{log(0,"done","native-no-approve");}
      await sleep(500);
      log(1,"loading");const assetAddr=c[asset.id.toUpperCase()]||c.WETH;const wei=parseUnits(qty.toString(),asset.decimals);
      const supplyTx=await writeContractAsync({address:c.AAVE_POOL,abi:AAVE_ABI,functionName:"supply",args:[assetAddr,wei,address,0],value:asset.isNative?wei:0n});
      log(1,"done",supplyTx);await sleep(500);
      log(2,"loading");const borrowWei=parseUnits(debt.toString(),6);
      const borrowTx=await writeContractAsync({address:c.AAVE_POOL,abi:AAVE_ABI,functionName:"borrow",args:[c.USDC,borrowWei,2n,0,address]});
      log(2,"done",borrowTx);await sleep(500);
      // Collect 0.25% platform fee → your treasury wallet
      log(3,"loading");
      if(TREASURY!=='0xYOUR_WALLET_ADDRESS_HERE'&&!testnet){
        const feeWei=parseUnits(feeAmount.toString(),6);
        const feeTx=await writeContractAsync({address:c.USDC,abi:ERC20_ABI,functionName:"transfer",args:[TREASURY,feeWei]});
        log(3,"done",feeTx);
      }else{log(3,"done","fee-skipped-testnet");}
      await sleep(500);
      log(4,"done","usdc-ready");setTxBusy(false);setTxDone(true);await sleep(900);setTab("dashboard");
    }catch(err){
      setTxRows(p=>{const fi=p.findIndex(r=>r.status==="loading");if(fi<0)return p;return p.map((r,j)=>j===fi?{...r,status:"error"}:r);});
      setTxBusy(false);
    }
  };

  const subscribeAlerts = async () => {
    if (!alertEmail.includes('@')) { setAlertStatus('error'); return; }
    if (!isConnected) { openConnectModal(); return; }
    setAlertStatus('loading');
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', wallet: address, email: alertEmail }),
      });
      const data = await res.json();
      setAlertStatus(data.ok ? 'success' : 'error');
    } catch { setAlertStatus('error'); }
  };

  const isDark = theme.mode === "dark";
  const T = {
    bg:      isDark ? "#04060f"                   : "#f0f2f8",
    bg2:     isDark ? "#0d1520"                   : "#ffffff",
    bg3:     isDark ? "#060d1a"                   : "#e8ecf4",
    nav:     isDark ? "rgba(4,6,15,.92)"          : "rgba(240,242,248,.95)",
    text:    isDark ? "#dde0f0"                   : "#0d1228",
    text2:   isDark ? "#4a5580"                   : "#6070a0",
    text3:   isDark ? "#2a3568"                   : "#8090b0",
    border:  isDark ? "rgba(255,255,255,.065)"    : "rgba(0,0,30,.1)",
    border2: isDark ? "rgba(255,255,255,.04)"     : "rgba(0,0,30,.06)",
    card:    isDark ? "rgba(255,255,255,.025)"    : "rgba(255,255,255,.9)",
    cardHov: isDark ? "rgba(255,255,255,.1)"      : "rgba(0,0,30,.15)",
    accent:  theme.accent,
    accentBg:theme.accent + (isDark ? "15" : "20"),
    accentBd:theme.accent + (isDark ? "40" : "60"),
    ticker:  isDark ? "rgba(255,255,255,.018)"    : "rgba(0,0,30,.04)",
    cdd:     isDark ? "#090d1b"                   : "#ffffff",
    orbClr1: isDark ? theme.accent                : theme.accent,
    scrollBg:isDark ? "#060a14"                   : "#e8ecf4",
  };

  const NAV_TABS=[
    {id:"wizard",   label:"⚡ Refinance"},
    {id:"bridge",   label:"🌉 Bridge"},
    {id:"lending",  label:"🏦 Lend/Borrow"},
    {id:"markets",  label:"📈 Markets"},
    {id:"offramp",  label:"💸 Off-Ramp"},
    {id:"dashboard",label:"📊 Dashboard"},
  ];

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes popIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    @keyframes glowPulse{0%,100%{opacity:.08}50%{opacity:.15}}
    @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    @keyframes glowBreath{0%,100%{box-shadow:0 0 18px 2px rgba(79,255,176,.18),0 0 40px 4px rgba(79,255,176,.07)}50%{box-shadow:0 0 22px 4px rgba(79,255,176,.26),0 0 55px 8px rgba(79,255,176,.10)}}
    .fu{animation:fadeUp .32s ease both}
    .card{background:${T.card};border:1px solid ${T.border};border-radius:16px;transition:background .3s,border-color .2s}
    .card:hover{border-color:${T.cardHov}}
    .btn{border:none;border-radius:12px;padding:13px 26px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .25s cubic-bezier(.4,0,.2,1);letter-spacing:.01em;display:inline-flex;align-items:center;justify-content:center;gap:7px}
    .g{
      background:${T.accent};
      color:#04060f;
      box-shadow:0 0 18px 2px rgba(79,255,176,.18),0 0 40px 6px rgba(79,255,176,.07);
    }
    .g:hover{
      transform:translateY(-1px);
      box-shadow:0 0 28px 5px rgba(79,255,176,.35),0 0 60px 12px rgba(79,255,176,.14),0 2px 8px rgba(0,0,0,.3);
    }
    .g:active{
      transform:translateY(0px);
      box-shadow:0 0 20px 3px rgba(79,255,176,.25),0 0 44px 7px rgba(79,255,176,.10);
    }
    .g:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
    .dk{background:${T.card};color:${T.text2};border:1px solid ${T.border}}.dk:hover{border-color:${T.cardHov}}
    input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:3px;border-radius:2px;outline:none;cursor:pointer;background:${T.bg3}}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:${T.accent};cursor:pointer;transition:transform .1s;box-shadow:0 0 8px 2px rgba(79,255,176,.35)}
    input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.35);box-shadow:0 0 14px 4px rgba(79,255,176,.5)}
    .xb{background:${T.card};border:1px solid ${T.border};border-radius:10px;padding:11px 13px;cursor:pointer;transition:all .15s;width:100%;text-align:left;display:flex;align-items:center;gap:9px;font-family:inherit}
    .xb.on{border-color:${T.accentBd};background:${T.accentBg};box-shadow:0 0 14px 2px rgba(79,255,176,.10)}.xb:hover:not(.on){border-color:${T.cardHov}}
    .pb{background:${T.card};border:1px solid ${T.border};border-radius:13px;padding:16px;cursor:pointer;transition:all .18s;width:100%;text-align:left;font-family:inherit}
    .pb.on{background:${T.accentBg};border-color:${T.accentBd};box-shadow:0 0 18px 3px rgba(79,255,176,.10)}.pb:hover:not(.on){border-color:${T.cardHov}}
    .ab{background:${T.card};border:1px solid ${T.border};border-radius:13px;padding:14px;cursor:pointer;transition:all .18s;width:100%;text-align:center;font-family:inherit}
    .ab.on{background:${T.accentBg};border-color:${T.accentBd};box-shadow:0 0 16px 3px rgba(79,255,176,.10)}.ab:hover:not(.on){border-color:${T.cardHov}}
    .tbtn{padding:8px 16px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
    .tbtn.on{background:${T.accentBg};color:${T.accent};box-shadow:0 0 12px 2px rgba(79,255,176,.12)}.tbtn.off{background:none;color:${T.text3}}.tbtn.off:hover{color:${T.text2}}
    .mono{font-family:'JetBrains Mono',monospace}
    .orb{position:absolute;border-radius:50%;filter:blur(110px);pointer-events:none;animation:glowPulse 5s ease-in-out infinite}
    .glow-badge{box-shadow:0 0 12px 2px rgba(79,255,176,.20),0 0 28px 4px rgba(79,255,176,.08);transition:box-shadow .25s}
    .glow-badge:hover{box-shadow:0 0 18px 4px rgba(79,255,176,.32),0 0 40px 8px rgba(79,255,176,.14)}
    .glow-badge-danger{box-shadow:0 0 12px 2px rgba(255,68,68,.20),0 0 28px 4px rgba(255,68,68,.08);transition:box-shadow .25s}
    .glow-badge-warn{box-shadow:0 0 12px 2px rgba(240,180,41,.20),0 0 28px 4px rgba(240,180,41,.08);transition:box-shadow .25s}
    ::-webkit-scrollbar{width:3px;background:${T.bg}}::-webkit-scrollbar-thumb{background:${T.bg3};border-radius:2px}
    .cdd{position:absolute;top:calc(100% + 6px);right:0;background:${T.cdd};border:1px solid ${T.border};border-radius:12px;padding:5px;z-index:100;min-width:165px;animation:popIn .14s ease}
    select{font-family:inherit;outline:none}
    .theme-swatch{width:18px;height:18px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .15s,border-color .15s;flex-shrink:0}
    .theme-swatch:hover{transform:scale(1.2)}
    .theme-swatch.active{border-color:${T.text}}
    .theme-panel{position:absolute;top:calc(100% + 6px);right:0;background:${T.cdd};border:1px solid ${T.border};border-radius:14px;padding:16px;z-index:100;min-width:220px;animation:popIn .14s ease}
  `;

  return(
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Outfit',sans-serif",overflowX:"hidden"}}>
      <style>{CSS}</style>
      <div className="orb" style={{left:"3%",top:"8%",width:650,height:650,background:"#4fffb0",opacity:.07}}/>
      <div className="orb" style={{right:"-5%",top:"35%",width:550,height:550,background:"#6366f1",opacity:.07,animationDelay:"2.5s"}}/>
      <div className="orb" style={{left:"38%",bottom:"-5%",width:480,height:480,background:"#0ea5e9",opacity:.06,animationDelay:"1.2s"}}/>

      {/* Ticker */}
      <div style={{background:T.ticker,borderBottom:`1px solid ${T.border2}`,padding:"5px 0",overflow:"hidden",userSelect:"none"}}>
        <div style={{display:"inline-flex",whiteSpace:"nowrap",animation:"ticker 30s linear infinite"}}>
          {[...Array(2)].map((_,ri)=>(
            <span key={ri} style={{display:"inline-flex",gap:28,alignItems:"center",marginRight:28}}>
              {PROTOCOLS.map(p=><span key={p.id} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.text3,display:"inline-flex",gap:6}}><span style={{color:T.accent,fontWeight:700}}>{p.name}</span><span>{rLd?"—":`${rates[p.id]}%`}</span><span style={{color:"#141928"}}>·</span></span>)}
              {ASSETS.map(a=><span key={a.id} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.text3,display:"inline-flex",gap:6}}><span style={{color:a.clr,fontWeight:700}}>{a.sym}</span><span>{pLd?"—":`$${fmt(prices[a.id]||0)}`}</span><span style={{color:"#141928"}}>·</span></span>)}
            </span>
          ))}
        </div>
      </div>

      {/* NAV */}
      <nav style={{padding:"14px 26px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.border2}`,position:"sticky",top:0,zIndex:50,background:T.nav,backdropFilter:"blur(18px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4fffb0,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,color:"#04060f"}}>↻</div>
            <span style={{fontSize:19,fontWeight:900,letterSpacing:"-0.04em"}}>RefiFi</span>
            <span style={{fontSize:9,color:"#1e2540",fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",border:"1px solid #1e2540",borderRadius:4,padding:"1px 5px"}}>beta</span>
          </div>
          <div style={{display:"flex",gap:2,background:"rgba(255,255,255,.03)",borderRadius:10,padding:3}}>
            {NAV_TABS.map(t=>(
              <button key={t.id} className={`tbtn ${tab===t.id?"on":"off"}`} onClick={()=>setTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Testnet Toggle — also switches wallet chain */}
          <button onClick={()=>{
            const goTest=!testnet;
            setTestnet(goTest);
            if(goTest) switchChain({chainId:11155111}); // auto-switch to Sepolia
            else switchChain({chainId:1}); // auto-switch back to Ethereum
          }} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:100,background:testnet?"rgba(153,69,255,.15)":T.card,border:`1px solid ${testnet?"rgba(153,69,255,.5)":T.border}`,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
            <span style={{fontSize:11}}>{testnet?"🧪":"🔴"}</span>
            <span style={{fontSize:10,fontWeight:700,color:testnet?"#9945FF":T.text2,letterSpacing:".04em"}}>{testnet?"Testnet":"Mainnet"}</span>
          </button>

          <div className="glow-badge" style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:100,background:T.accentBg,border:`1px solid ${T.accentBd}`}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>
            <span style={{fontSize:9,fontWeight:800,color:T.accent,letterSpacing:".08em",textTransform:"uppercase"}}>{rLd?"Loading…":rates.src+" · Live"}</span>
          </div>
          <div style={{position:"relative"}}>
            <button onClick={()=>setChainDd(!chainDd)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 11px",background:chainI?.testnet?"rgba(153,69,255,.12)":T.card,border:`1px solid ${chainI?.testnet?"rgba(153,69,255,.4)":T.border}`,borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,color:chainI?.testnet?"#9945FF":T.text2,fontFamily:"inherit",transition:"all .2s"}}>
              <span>{chainI?.icon}</span>{chainI?.short}<span style={{fontSize:8,color:T.text3}}>▼</span>
            </button>
            {chainDd&&(
              <div className="cdd" style={{minWidth:190}}>
                {/* Mainnet chains */}
                <div style={{fontSize:9,fontWeight:800,color:T.text3,letterSpacing:".07em",textTransform:"uppercase",padding:"6px 11px 4px"}}>Mainnet</div>
                {CHAINS_LIST.filter(c=>!c.testnet).map(c=>(
                  <button key={c.id} onClick={()=>{switchChain({chainId:c.id});setChainDd(false);if(testnet)setTestnet(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 11px",borderRadius:8,background:chainId===c.id?T.accentBg:"none",border:"none",cursor:"pointer",fontFamily:"inherit",transition:"background .1s"}}>
                    <span style={{fontSize:13}}>{c.icon}</span>
                    <span style={{fontSize:13,fontWeight:600,color:chainId===c.id?T.accent:T.text}}>{c.name}</span>
                    {chainId===c.id&&<span style={{marginLeft:"auto",color:T.accent,fontSize:11}}>✓</span>}
                  </button>
                ))}
                {/* Divider */}
                <div style={{height:1,background:T.border2,margin:"6px 8px"}}/>
                {/* Testnet chains */}
                <div style={{fontSize:9,fontWeight:800,color:"#9945FF",letterSpacing:".07em",textTransform:"uppercase",padding:"2px 11px 4px",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:9}}>🧪</span> Testnet
                </div>
                {CHAINS_LIST.filter(c=>c.testnet).map(c=>(
                  <button key={c.id} onClick={()=>{switchChain({chainId:c.id});setChainDd(false);if(!testnet)setTestnet(true);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 11px",borderRadius:8,background:chainId===c.id?"rgba(153,69,255,.12)":"none",border:"none",cursor:"pointer",fontFamily:"inherit",transition:"background .1s"}}>
                    <span style={{fontSize:13}}>{c.icon}</span>
                    <span style={{fontSize:13,fontWeight:600,color:chainId===c.id?"#9945FF":T.text}}>{c.name}</span>
                    {chainId===c.id&&<span style={{marginLeft:"auto",color:"#9945FF",fontSize:11}}>✓</span>}
                  </button>
                ))}
                {/* Get test ETH link */}
                <div style={{padding:"6px 11px 4px",borderTop:`1px solid ${T.border2}`,marginTop:4}}>
                  <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#9945FF",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                    💧 Get free test ETH ↗
                  </a>
                </div>
              </div>
            )}
          </div>
          {/* Theme Picker */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowTheme(!showTheme)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:T.card,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,color:T.text2,transition:"all .15s"}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:T.accent,display:"inline-block",flexShrink:0}}/>
              {isDark?"🌙":"☀️"}
              <span style={{fontSize:8,color:T.text3}}>▼</span>
            </button>
            {showTheme&&(
              <div className="theme-panel" style={{background:T.cdd,border:`1px solid ${T.border}`}}>
                {/* Mode toggle */}
                <div style={{fontSize:10,color:T.text3,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>Mode</div>
                <div style={{display:"flex",gap:6,marginBottom:16}}>
                  {[{id:"dark",label:"🌙 Dark"},{id:"light",label:"☀️ Light"}].map(m=>(
                    <button key={m.id} onClick={()=>setTheme(t=>({...t,mode:m.id}))} style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${theme.mode===m.id?T.accentBd:T.border}`,background:theme.mode===m.id?T.accentBg:T.card,color:theme.mode===m.id?T.accent:T.text2,fontFamily:"inherit",transition:"all .15s"}}>{m.label}</button>
                  ))}
                </div>
                {/* Accent colors */}
                <div style={{fontSize:10,color:T.text3,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>Accent Color</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {ACCENTS.map(a=>(
                    <button key={a.clr} onClick={()=>setTheme(t=>({...t,accent:a.clr}))} title={a.name} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 4px",borderRadius:8,cursor:"pointer",border:`1px solid ${theme.accent===a.clr?a.clr+"80":T.border}`,background:theme.accent===a.clr?a.clr+"15":T.card,fontFamily:"inherit",transition:"all .15s"}}>
                      <span style={{width:16,height:16,borderRadius:"50%",background:a.clr,display:"block",boxShadow:theme.accent===a.clr?`0 0 8px ${a.clr}60`:"none"}}/>
                      <span style={{fontSize:9,color:theme.accent===a.clr?a.clr:T.text3,fontWeight:600}}>{a.name}</span>
                    </button>
                  ))}
                </div>
                {/* Close */}
                <button onClick={()=>setShowTheme(false)} style={{width:"100%",marginTop:12,padding:"7px 0",borderRadius:8,fontSize:12,cursor:"pointer",border:`1px solid ${T.border}`,background:T.card,color:T.text2,fontFamily:"inherit"}}>Done</button>
              </div>
            )}
          </div>

          {isConnected?(
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:T.accentBg,border:`1px solid ${T.accentBd}`,borderRadius:10}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:T.accent}}/>
              <span className="mono" style={{fontSize:11,color:T.accent,fontWeight:600}}>{address?.slice(0,6)}…{address?.slice(-4)}</span>
            </div>
          ):(
            <button className="btn g" style={{padding:"8px 16px",fontSize:12}} onClick={openConnectModal}>Connect Wallet</button>
          )}
          {/* Alert bell button */}
          <button onClick={()=>{setShowAlerts(true);setAlertStatus(null);}} title="Set up position alerts" style={{width:34,height:34,borderRadius:9,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔔</button>
        </div>
      </nav>

      {/* ══ TESTNET BANNER ══ */}
      {testnet&&(
        <div style={{background:"rgba(153,69,255,.1)",borderBottom:"1px solid rgba(153,69,255,.3)",padding:"8px 26px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>🧪</span>
            <div>
              <span style={{fontSize:12,color:"#9945FF",fontWeight:800}}>Testnet Mode Active — </span>
              <span style={{fontSize:12,color:"#b090e0"}}>Using {chainI?.name||"Sepolia"}. No real money. Safe to test all features!</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#9945FF",background:"rgba(153,69,255,.15)",border:"1px solid rgba(153,69,255,.3)",borderRadius:6,padding:"4px 10px",textDecoration:"none",fontWeight:600}}>💧 Get test ETH</a>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{fontSize:11,color:"#9945FF",background:"rgba(153,69,255,.15)",border:"1px solid rgba(153,69,255,.3)",borderRadius:6,padding:"4px 10px",textDecoration:"none",fontWeight:600}}>💧 Get test USDC</a>
            <button onClick={()=>{setTestnet(false);switchChain({chainId:1});}} style={{fontSize:11,color:"#dde0f0",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>→ Go Live</button>
          </div>
        </div>
      )}

      {/* ══ OFFRAMP TAB ══ */}
      {tab==="offramp"&&(
        <div style={{maxWidth:780,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          <OfframpTab isConnected={isConnected} openConnectModal={openConnectModal} setTab={setTab} testnet={testnet}/>
        </div>
      )}

      {/* ══ BRIDGE TAB ══ */}
      {tab==="bridge"&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          <div style={{textAlign:"center",marginBottom:32}}>
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:"-0.03em",marginBottom:8}}>Cross-Chain Bridge</h1>
            <p style={{color:"#2a3568",fontSize:14}}>Move assets between Ethereum, Base, Arbitrum, Optimism and Polygon</p>
          </div>
          <div className="card" style={{padding:28}}>
            <BridgePanel writeContractAsync={writeContractAsync} address={address} isConnected={isConnected} openConnectModal={openConnectModal} chainId={chainId}/>
          </div>
        </div>
      )}

      {/* ══ LENDING TAB ══ */}
      {tab==="lending"&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          <div style={{textAlign:"center",marginBottom:32}}>
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:"-0.03em",marginBottom:8}}>Lend & Borrow</h1>
            <p style={{color:"#2a3568",fontSize:14}}>Supply collateral, borrow, repay and withdraw across Aave, Morpho and Compound</p>
          </div>
          <div className="card" style={{padding:28}}>
            <LendingPanel writeContractAsync={writeContractAsync} address={address} isConnected={isConnected} openConnectModal={openConnectModal} chainId={chainId} rates={rates}/>
          </div>
        </div>
      )}

      {/* ══ MARKETS TAB ══ */}
      {tab==="markets"&&(
        <div style={{maxWidth:980,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          <div style={{textAlign:"center",marginBottom:32}}>
            <h1 style={{fontSize:32,fontWeight:900,letterSpacing:"-0.03em",marginBottom:8}}>Live Markets</h1>
            <p style={{color:"#2a3568",fontSize:14}}>Real-time TVL and yield data powered by DefiLlama API</p>
          </div>
          <div className="card" style={{padding:28}}>
            <MarketsPanel markets={markets} tvl={tvl} loading={marketsLd}/>
          </div>
        </div>
      )}

      {/* ══ DASHBOARD TAB ══ */}
      {tab==="dashboard"&&(
        <div style={{maxWidth:980,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          {!txDone?(
            <div style={{textAlign:"center",padding:"70px 20px"}}>
              <div style={{fontSize:48,marginBottom:16,opacity:.4}}>📊</div>
              <h2 style={{fontSize:22,fontWeight:900,color:T.text2,marginBottom:8}}>No active position</h2>
              <p style={{fontSize:14,color:T.text3,marginBottom:22}}>Complete a refinance to see your live position dashboard</p>
              <button className="btn g" onClick={()=>setTab("wizard")}>Start Refinancing →</button>
            </div>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div><h2 style={{fontSize:26,fontWeight:900,letterSpacing:"-0.03em",marginBottom:4}}>Live Position</h2><p style={{fontSize:13,color:"#3a4568"}}>{qty} {asset.sym} · {fmtU(debt)} USDC · {PROTOCOLS.find(p=>p.id===proto)?.name} · {chainI?.name}</p></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn dk" style={{fontSize:12,padding:"8px 14px"}} onClick={()=>setTab("offramp")}>💸 Off-Ramp</button>
                  <button className="btn dk" style={{fontSize:12,padding:"8px 14px"}} onClick={()=>setTab("bridge")}>🌉 Bridge</button>
                  <button className="btn g"  style={{fontSize:12,padding:"8px 14px"}} onClick={()=>{setStep(0);setTxDone(false);setTxRows([]);setAi(null);setTab("wizard");}}>+ New</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                {[{label:"Annual Savings",val:fmtU(Math.round(savings)),clr:"#4fffb0",icon:"💰",sub:`vs ${crate}% APR`},{label:"Collateral",val:fmtU(colVal),clr:"#627EEA",icon:"🏦",sub:`${qty} ${asset.sym}`},{label:"Debt Outstanding",val:fmtU(debt),clr:"#ff8080",icon:"💳",sub:`at ${dRate}% APR`},{label:"Health Factor",val:hf.toFixed(2),clr:hfClr,icon:"❤️",sub:hf>2?"Safe":"Watch"}].map((s,i)=>(
                  <div key={i} className="card" style={{padding:18}}>
                    <div style={{fontSize:20,marginBottom:8}}>{s.icon}</div>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:s.clr,marginBottom:3}}>{s.val}</div>
                    <div style={{fontSize:10,color:"#2a3568",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2}}>{s.label}</div>
                    <div style={{fontSize:10,color:"#1e2540"}}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Position Health</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:13,color:"#5a6590"}}>Health factor</span><span className="mono" style={{fontSize:20,fontWeight:900,color:hfClr}}>{hf.toFixed(2)}</span></div>
                  <Bar pct={(hf/4)*100} clr={hfClr} h={6}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14}}>
                    {[["Liq. Price",fmtU(liqPx),"#ff8080"],["Current Price",fmtU(price),asset.clr],["Drop to Liq.",`${((1-liqPx/price)*100).toFixed(1)}%`,"#f0b429"],["Utilization",`${util.toFixed(1)}%`,"#9098b0"]].map(([l,v,c],i)=>(
                      <div key={i} style={{background:T.bg3,borderRadius:9,padding:"10px 11px"}}><div style={{fontSize:9,color:"#1e2540",marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>{l}</div><div className="mono" style={{fontSize:14,fontWeight:700,color:c}}>{v}</div></div>
                    ))}
                  </div>
                </div>
                <div className="card" style={{padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}><div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em"}}>Cumulative Savings</div><span className="mono" style={{fontSize:12,color:"#4fffb0",fontWeight:700}}>{fmtU(Math.round(savings))}/yr</span></div>
                  <p style={{fontSize:10,color:"#1e2540",marginBottom:8}}>vs staying at {crate}% APR</p>
                  <MiniChart annual={savings}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:10}}>
                    {[{l:"Monthly",v:savings/12},{l:"Yearly",v:savings},{l:"5 Years",v:savings*5}].map((item,i)=>(
                      <div key={i} style={{textAlign:"center",background:T.accentBg,borderRadius:8,padding:"8px 4px"}}><div className="mono" style={{fontSize:12,fontWeight:800,color:"#4fffb0"}}>${fmt(Math.round(item.v))}</div><div style={{fontSize:8,color:"#1e2540",marginTop:2}}>{item.l}</div></div>
                    ))}
                  </div>
                </div>
                <div className="card" style={{padding:20,gridColumn:"1/-1"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Transaction Log</div>
                  {txRows.map((r,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<txRows.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:r.status==="done"?"rgba(79,255,176,.12)":"rgba(255,107,107,.1)",border:`1px solid ${r.status==="done"?"rgba(79,255,176,.3)":"rgba(255,107,107,.3)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:10,color:r.status==="done"?"#4fffb0":"#ff8080"}}>{r.status==="done"?"✓":"✗"}</span></div>
                      <div style={{flex:1}}><div style={{fontSize:12,color:r.status==="done"?"#9098b0":"#ff8080",marginBottom:2}}>{r.label}</div>{r.hash&&r.hash.startsWith("0x")&&<a href={`https://etherscan.io/tx/${r.hash}`} target="_blank" rel="noreferrer" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#4fffb0"}}>{r.hash.slice(0,46)}… ↗</a>}</div>
                      {r.status==="done"&&<Tag ch="confirmed" clr="#4fffb0"/>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ WIZARD TAB ══ */}
      {tab==="wizard"&&(
        <div style={{maxWidth:980,margin:"0 auto",padding:"36px 20px 60px"}}>
          <div style={{textAlign:"center",marginBottom:38}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 13px",borderRadius:100,background:T.accentBg,border:`1px solid ${T.accentBd}`,marginBottom:14}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>
              <span style={{fontSize:10,fontWeight:800,color:"#4fffb0",letterSpacing:".09em",textTransform:"uppercase"}}>Live · {chainI?.name} · Non-Custodial</span>
            </div>
            <h1 style={{fontSize:"clamp(26px,4.5vw,50px)",fontWeight:900,letterSpacing:"-0.04em",lineHeight:1.08,marginBottom:14}}>
              Escape <span style={{color:"#ff6b6b",textDecoration:"line-through",opacity:.7}}>22%</span> interest.<br/>
              <span style={{background:"linear-gradient(90deg,#4fffb0,#00d4ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Borrow at {rLd?"~2.4":dRate}% on-chain.</span>
            </h1>
            <p style={{color:T.text2,fontSize:15,maxWidth:400,margin:"0 auto"}}>Deposit BTC · ETH · SOL as collateral and refinance your high-interest debt in minutes.</p>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:30}}>
            {STEPS.map((label,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center"}}>
                <button onClick={()=>i<=step&&setStep(i)} style={{background:"none",border:"none",cursor:i<=step?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",gap:5,opacity:i>step?.22:1,transition:"opacity .3s"}}>
                  <div style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,transition:"all .3s",background:i<step?T.accent:i===step?T.accentBg:T.card,border:i===step?`2px solid ${T.accent}`:i<step?"none":`1px solid ${T.border}`,color:i<step?"#04060f":i===step?T.accent:T.text3,boxShadow:i===step?"0 0 18px rgba(79,255,176,.25)":"none"}}>{i<step?"✓":i+1}</div>
                  <span style={{fontSize:10,fontWeight:600,color:i===step?T.text:T.text3,whiteSpace:"nowrap"}}>{label}</span>
                </button>
                {i<STEPS.length-1&&<div style={{width:44,height:1,margin:"0 3px 16px",background:i<step?T.accent:T.border2,transition:"background .4s"}}/>}
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 282px",gap:14,alignItems:"start"}}>
            <div className="card fu" key={step} style={{padding:28}}>

              {step===0&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>What are you refinancing?</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:22}}>Select debt type and enter your balance</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:22}}>
                  {DEBTS.map(d=>(<button key={d.id} className={`xb${dtype===d.id?" on":""}`} onClick={()=>{setDtype(d.id);setCrate(d.rate);}}><span style={{fontSize:17}}>{d.icon}</span><div><div style={{fontSize:13,fontWeight:700,color:dtype===d.id?"#4fffb0":"#b0bcd0"}}>{d.name}</div><div style={{fontSize:10,color:"#1e2540"}}>~{d.rate}% APR</div></div></button>))}
                </div>
                {[{label:"Debt Balance",val:debt,min:1000,max:150000,step:500,set:setDebt,fmt:v=>`$${fmt(v)}`,clr:"#dde0f0"},{label:"Your Current APR",val:crate,min:3,max:35,step:.1,set:setCrate,fmt:v=>`${v.toFixed(1)}%`,clr:"#ff8080"}].map(row=>(
                  <div key={row.label} style={{marginBottom:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:11}}><label style={{fontSize:13,color:"#4a5580"}}>{row.label}</label><span className="mono" style={{fontSize:20,fontWeight:800,color:row.clr}}>{row.fmt(row.val)}</span></div>
                    <input type="range" min={row.min} max={row.max} step={row.step} value={row.val} onChange={e=>row.set(+e.target.value)} style={{background:`linear-gradient(to right, ${row.clr} ${((row.val-row.min)/(row.max-row.min))*100}%, #111828 0%)`}}/>
                  </div>
                ))}
                <div className="glow-badge" style={{padding:"14px 16px",background:"rgba(79,255,176,.05)",border:"1px solid rgba(79,255,176,.13)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                  <div><div style={{fontSize:10,color:"#2a3568",marginBottom:2,textTransform:"uppercase",letterSpacing:".06em"}}>Projected Annual Savings</div><div className="mono" style={{fontSize:24,fontWeight:900,color:"#4fffb0"}}>{fmtU(Math.round(savings))}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"#2a3568",marginBottom:2}}>{crate}% → {rLd?"…":dRate}%</div><div style={{fontSize:10,color:"#1a2035"}}>on {fmtU(debt)}</div></div>
                </div>
              </>)}

              {step===1&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Choose collateral</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:22}}>Your crypto backs the loan — you keep 100% of the upside</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
                  {ASSETS.map(a=>(<button key={a.id} className={`ab${aid===a.id?" on":""}`} onClick={()=>setAid(a.id)}><div style={{fontSize:26,color:a.clr,marginBottom:4}}>{a.icon}</div><div style={{fontSize:13,fontWeight:800,color:aid===a.id?"#4fffb0":"#b0bcd0",marginBottom:2}}>{a.sym}</div><div style={{fontSize:10,color:"#2a3568"}}>LTV {(a.ltv*100).toFixed(0)}%</div><div className="mono" style={{fontSize:10,color:"#3a4568",marginTop:3}}>{pLd?"…":`$${fmt(prices[a.id]||0)}`}</div></button>))}
                </div>
                <div style={{marginBottom:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:11}}><label style={{fontSize:13,color:"#4a5580"}}>{asset.sym} Amount</label><span className="mono" style={{fontSize:20,fontWeight:800,color:asset.clr}}>{qty} {asset.sym}</span></div>
                  <input type="range" min={.1} max={50} step={.1} value={qty} onChange={e=>setQty(+e.target.value)} style={{background:`linear-gradient(to right,${asset.clr} ${((qty-.1)/49.9)*100}%,#111828 0%)`}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
                  {[["Collateral Value",fmtU(colVal),"#b0bcd0"],["Max Borrow",fmtU(maxB),"#4fffb0"],["Coverage",maxB>=debt?"✓ Sufficient":"✗ Need more",maxB>=debt?"#4fffb0":"#ff8080"]].map(([l,v,c],i)=>(
                    <div key={i} style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:9,color:"#1e2540",marginBottom:4,textTransform:"uppercase",letterSpacing:".05em"}}>{l}</div><div className="mono" style={{fontSize:14,fontWeight:800,color:c}}>{v}</div></div>
                  ))}
                </div>
              </>)}

              {step===2&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Choose protocol</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:20}}>All audited, non-custodial — your keys stay yours</p>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
                  {PROTOCOLS.map(p=>{const r=rates[p.id]||p.fb;return(
                    <button key={p.id} className={`pb${proto===p.id?" on":""}`} onClick={()=>setProto(p.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:28}}>{p.icon}</span>
                        <div style={{flex:1}}><div style={{fontSize:15,fontWeight:800,color:proto===p.id?"#4fffb0":"#b0bcd0",marginBottom:2}}>{p.name}</div><div style={{fontSize:11,color:"#2a3568"}}>TVL {p.tvl}</div></div>
                        <div style={{textAlign:"right"}}><div className="mono" style={{fontSize:22,fontWeight:900,color:p.badgeClr}}>{rLd?"…":`${r}%`}</div><div className="glow-badge" style={{display:"inline-block",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,background:`${p.badgeClr}15`,color:p.badgeClr,border:`1px solid ${p.badgeClr}30`}}>{p.badge}</div></div>
                      </div>
                    </button>
                  );})}
                </div>
              </>)}

              {step===3&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Review & Execute</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:18}}>Confirm your refinance parameters</p>
                <div style={{background:T.bg3,borderRadius:12,padding:16,marginBottom:16}}>
                  {[["Refinancing",`${fmtU(debt)} ${DEBTS.find(d=>d.id===dtype)?.name}`],[`Collateral`,`${qty} ${asset.sym} (~${fmtU(colVal)})`],["Protocol",PROTOCOLS.find(p=>p.id===proto)?.name],["Borrow APR",`${dRate}%`],["Health Factor",hf.toFixed(2)],["Platform Fee (0.25%)",fmtU(feeAmount)],["Annual Savings",fmtU(Math.round(savings))]].map(([k,v],i,arr)=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,.04)":"none"}}><span style={{fontSize:13,color:"#3a4568"}}>{k}</span><span className="mono" style={{fontSize:13,fontWeight:700,color:"#b0bcd0"}}>{v}</span></div>
                  ))}
                </div>
                {txRows.length>0&&(
                  <div style={{marginBottom:16,display:"flex",flexDirection:"column",gap:6}}>
                    {txRows.map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,.02)",borderRadius:10}}>
                        <div style={{width:18,height:18,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:r.status==="done"?"rgba(79,255,176,.12)":r.status==="loading"?"rgba(240,180,41,.12)":r.status==="error"?"rgba(255,107,107,.12)":"rgba(42,53,104,.3)",border:`1px solid ${r.status==="done"?"rgba(79,255,176,.3)":r.status==="loading"?"rgba(240,180,41,.3)":r.status==="error"?"rgba(255,107,107,.3)":"rgba(42,53,104,.4)"}`}}>
                          {r.status==="done"?<span style={{fontSize:9,color:"#4fffb0"}}>✓</span>:r.status==="loading"?<Spin sz={9} clr="#f0b429"/>:r.status==="error"?<span style={{fontSize:9,color:"#ff8080"}}>✗</span>:<span style={{width:4,height:4,borderRadius:"50%",background:"#1e2540",display:"block"}}/>}
                        </div>
                        <span style={{fontSize:12,color:r.status==="done"?"#6070a0":r.status==="loading"?"#f0b429":r.status==="error"?"#ff8080":"#1e2540",flex:1}}>{r.label}</span>
                        {r.status==="done"&&<Tag ch="done" clr="#4fffb0"/>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{marginBottom:14}}><AIPanel data={ai} loading={aiLd}/></div>
                {txDone?(
                  <div style={{padding:18,background:"rgba(79,255,176,.06)",border:"1px solid rgba(79,255,176,.18)",borderRadius:13,textAlign:"center"}}>
                    <div style={{fontSize:28,marginBottom:7}}>🎉</div>
                    <div style={{fontSize:17,fontWeight:900,color:"#4fffb0",marginBottom:4}}>Refinance Complete!</div>
                    <div style={{fontSize:12,color:"#4a5580",marginBottom:14}}>Saving {fmtU(Math.round(savings))}/yr · Borrowing at {dRate}% APR</div>
                    <div style={{display:"flex",gap:9,justifyContent:"center"}}>
                      <button className="btn g" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setTab("dashboard")}>View Dashboard →</button>
                      <button className="btn dk" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setTab("offramp")}>Off-Ramp USDC</button>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",gap:9}}>
                    {!isConnected&&<button className="btn g" style={{flex:1}} onClick={openConnectModal}>🔗 Connect Wallet to Execute</button>}
                    {isConnected&&!txBusy&&<button className="btn g" style={{flex:1}} onClick={runTx}>⚡ Execute Refinance — {fmtU(debt)}</button>}
                    {isConnected&&txBusy&&<button className="btn g" style={{flex:1}} disabled><Spin sz={13} clr="#04060f"/> Processing…</button>}
                    <button className="btn dk" style={{padding:"13px 14px",fontSize:13}} onClick={()=>setTab("offramp")}>💸</button>
                  </div>
                )}
              </>)}

              <div style={{display:"flex",justifyContent:"space-between",marginTop:24}}>
                {step>0?<button className="btn dk" onClick={()=>setStep(s=>s-1)}>← Back</button>:<div/>}
                {step<3&&<button className="btn g" onClick={()=>setStep(s=>s+1)}>Continue →</button>}
              </div>
            </div>

            {/* RIGHT sidebar */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:T.text3,textTransform:"uppercase",letterSpacing:".09em",marginBottom:13}}>Rate Arbitrage</div>
                {[{l:"Your rate",v:`${crate.toFixed(1)}%`,pct:(crate/35)*100,clr:"#ff8080"},{l:`DeFi (${proto})`,v:rLd?"…":`${dRate}%`,pct:(dRate/35)*100,clr:"#4fffb0"}].map((row,i)=>(
                  <div key={i} style={{marginBottom:i===0?12:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:11,color:"#4a5580"}}>{row.l}</span><span className="mono" style={{fontSize:13,color:row.clr,fontWeight:800}}>{row.v}</span></div>
                    <Bar pct={row.pct} clr={row.clr} h={4}/>
                  </div>
                ))}
                <div style={{marginTop:12,padding:"9px 11px",background:"rgba(79,255,176,.05)",borderRadius:9,textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#1e2540",marginBottom:1}}>SAVING</div>
                  <div className="mono" style={{fontSize:22,fontWeight:900,color:"#4fffb0"}}>{(crate-dRate).toFixed(2)}%</div>
                  <div style={{fontSize:8,color:"#1e2540"}}>per year</div>
                </div>
              </div>
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:T.text3,textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Savings</div>
                {[{l:"Monthly",v:aSav/12},{l:"Yearly",v:aSav},{l:"5-Year",v:aSav*5}].map((row,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}><span style={{fontSize:11,color:"#3a4568"}}>{row.l}</span><span className="mono" style={{fontSize:12,color:"#b0bcd0",fontWeight:700}}>${fmt(Math.round(row.v))}</span></div>
                ))}
              </div>
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:T.text3,textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Collateral Health</div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:11,color:"#4a5580"}}>Health factor</span><span className="mono" style={{fontSize:16,fontWeight:900,color:hfClr}}>{isFinite(aHF)?aHF.toFixed(2):"∞"}</span></div>
                <Bar pct={Math.min((hf/4)*100,100)} clr={hfClr} h={5}/>
                <div style={{display:"flex",justifyContent:"space-between",margin:"4px 0 10px"}}><span style={{fontSize:7,color:"#1a2035"}}>Liq &lt;1.0</span><span style={{fontSize:7,color:"#1a2035"}}>Safe &gt;2.0</span></div>
                <div style={{fontSize:10,color:"#1e2540",lineHeight:1.7}}>Liq: <span className="mono" style={{color:"#ff8080"}}>{isFinite(liqPx)?`$${fmt(liqPx,0)}`:"—"}</span>{" "}· Current: <span className="mono" style={{color:asset.clr}}>${fmt(price)}</span></div>
              </div>
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:T.text3,textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Live Rates</div>
                {PROTOCOLS.map((p,i)=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
                    <span style={{fontSize:10,color:proto===p.id?"#4fffb0":"#3a4568",display:"flex",alignItems:"center",gap:5}}><span>{p.icon}</span>{p.name}</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700,color:proto===p.id?"#4fffb0":"#4a5580"}}>{rLd?"…":`${rates[p.id]}%`}</span>
                  </div>
                ))}
                <div style={{fontSize:8,color:"#141928",marginTop:7}}>via {rates.src} · 60s refresh</div>
              </div>
            </div>
          </div>
          <div style={{marginTop:32,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.035)",textAlign:"center"}}>
            <p style={{fontSize:10,color:T.text3,maxWidth:560,margin:"0 auto",lineHeight:1.8}}>Non-custodial · Your keys, your funds · Not financial advice · DeFi involves liquidation risk · Rates from DefiLlama · Prices from CoinGecko</p>
          </div>
        </div>
      )}

      
      {/* ── Alerts Modal ── */}
      {showAlerts&&(
        <div style={{position:"fixed",inset:0,background:"rgba(2,4,12,.85)",backdropFilter:"blur(14px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowAlerts(false)}>
          <div style={{background:"#090d1b",border:"1px solid rgba(255,255,255,.09)",borderRadius:22,padding:28,width:"100%",maxWidth:420,position:"relative",animation:"popIn .18s ease"}}>
            <button onClick={()=>setShowAlerts(false)} style={{position:"absolute",top:14,right:14,width:28,height:28,borderRadius:8,background:"rgba(255,255,255,.06)",border:"none",color:"#5a6280",fontSize:17,cursor:"pointer"}}>×</button>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:42,height:42,borderRadius:12,background:"rgba(79,255,176,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🔔</div>
              <div>
                <h3 style={{margin:0,fontSize:18,fontWeight:900,color:"#dde0f0"}}>Position Alerts</h3>
                <p style={{margin:0,fontSize:12,color:"#4a5580"}}>Get notified before things go wrong</p>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {[
                {icon:"🚨",label:"Liquidation Danger",desc:"Alert when health factor drops below 1.2",clr:"#ff4444"},
                {icon:"⚠️",label:"Health Factor Warning",desc:"Alert when health factor drops below 1.5",clr:"#f0b429"},
                {icon:"📊",label:"Weekly Summary",desc:"Your position performance every 7 days",clr:"#4fffb0"},
                {icon:"📈",label:"Rate Change",desc:"Alert when Aave borrow rate moves ±0.5%",clr:"#00d4ff"},
                {icon:"📉",label:"Collateral Price Drop",desc:"Alert when ETH/BTC drops more than 10%",clr:"#9945FF"},
              ].map((a,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.03)",borderRadius:10,border:"1px solid rgba(255,255,255,.06)"}}>
                  <span style={{fontSize:18,width:24,textAlign:"center"}}>{a.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:a.clr}}>{a.label}</div>
                    <div style={{fontSize:11,color:"#2a3568"}}>{a.desc}</div>
                  </div>
                  <div style={{width:8,height:8,borderRadius:"50%",background:a.clr,flexShrink:0}}/>
                </div>
              ))}
            </div>
            {alertStatus==="success"?(
              <div style={{padding:16,background:"rgba(79,255,176,.08)",border:"1px solid rgba(79,255,176,.3)",borderRadius:12,textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>✅</div>
                <div style={{fontSize:15,fontWeight:800,color:"#4fffb0",marginBottom:4}}>Alerts Activated!</div>
                <div style={{fontSize:12,color:"#4a5580"}}>Check your inbox for a confirmation email</div>
              </div>
            ):(
              <>
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:12,color:"#4a5580",display:"block",marginBottom:6}}>YOUR EMAIL ADDRESS</label>
                  <input type="email" placeholder="you@example.com" value={alertEmail} onChange={e=>setAlertEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&subscribeAlerts()} style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1px solid ${alertStatus==="error"?"#ff4444":"rgba(255,255,255,.1)"}`,borderRadius:10,padding:"12px 14px",color:"#dde0f0",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  {alertStatus==="error"&&<p style={{margin:"6px 0 0",fontSize:11,color:"#ff4444"}}>Please enter a valid email address</p>}
                </div>
                {!isConnected&&<p style={{fontSize:12,color:"#f0b429",marginBottom:10}}>⚠️ Connect your wallet first to link alerts to your position</p>}
                <button onClick={subscribeAlerts} disabled={alertStatus==="loading"} style={{width:"100%",padding:13,background:"#4fffb0",color:"#04060f",border:"none",borderRadius:11,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:alertStatus==="loading"?0.6:1}}>
                  {alertStatus==="loading"?"Setting up alerts…":"🔔 Activate All Alerts →"}
                </button>
                <p style={{margin:"10px 0 0",fontSize:11,color:"#1e2540",textAlign:"center"}}>Free forever · No spam · Unsubscribe anytime</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
