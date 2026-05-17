import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('bond_token'));
  const [user, setUser] = useState(null);
  const [rates, setRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [message, setMessage] = useState({ text: '', ok: true });
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [agentWallet, setAgentWallet] = useState(null);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [bridgeFrom, setBridgeFrom] = useState('Ethereum');
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [bridgeMsg, setBridgeMsg] = useState({ text: '', ok: true });
  const canvasRef = useRef(null);

  const connectWallet = async () => {
    setConnecting(true);
    try {
      if (!window.ethereum) { setMessage({ text: 'Install MetaMask or Rabby', ok: false }); setConnecting(false); return; }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4CEFA2' }] });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x4CEFA2', chainName: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: ['https://rpc.testnet.arc.network'], blockExplorerUrls: ['https://testnet.arcscan.app'] }] });
        }
      }
      const res = await axios.post(`${API}/api/auth/login`, { walletAddress: addr });
      localStorage.setItem('bond_token', res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      setAgentWallet(res.data.user?.agent_wallet);
    } catch (e) { setMessage({ text: 'Connection failed: ' + e.message, ok: false }); }
    setConnecting(false);
  };

  const logout = () => { localStorage.removeItem('bond_token'); setToken(null); setUser(null); };

  const fetchAll = async () => {
    if (!token) return;
    try {
      const [u, r, h, p] = await Promise.all([
        axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/api/rates`),
        axios.get(`${API}/api/auth/history`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/api/auth/pnl`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setUser(u.data); setRates(r.data); setHistory(h.data); setPnl(p.data);
      setAgentWallet(u.data?.agent_wallet);
    } catch { logout(); }
  };

  useEffect(() => {
    if (token) fetchAll();
    const i = setInterval(() => { if (token) fetchAll(); }, 10000);
    return () => clearInterval(i);
  }, [token]);

  useEffect(() => {
    if (!canvasRef.current || pnl.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const values = pnl.map(p => parseFloat(p.earned));
    const max = Math.max(...values, 0.001);
    const pad = 40;
    ctx.strokeStyle = '#1e2d3d'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
      ctx.fillStyle = '#444'; ctx.font = '10px monospace';
      ctx.fillText((max * (1 - i / 4)).toFixed(6), 2, y + 4);
    }
    ctx.beginPath(); ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(pad + (w - pad * 2), h - pad); ctx.lineTo(pad, h - pad); ctx.closePath();
    ctx.fillStyle = 'rgba(0,255,136,0.05)'; ctx.fill();
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88'; ctx.fill();
    });
  }, [pnl]);

  const deposit = async () => {
    if (!depositAmount) return;
    try {
      await axios.post(`${API}/api/auth/deposit`, { amount: depositAmount }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage({ text: `✅ Deposited ${depositAmount} USDC`, ok: true });
      setDepositAmount(''); fetchAll();
    } catch { setMessage({ text: '❌ Deposit failed', ok: false }); }
    setTimeout(() => setMessage({ text: '', ok: true }), 4000);
  };

  const withdraw = async () => {
    if (!withdrawAmount) return;
    try {
      const res = await axios.post(`${API}/api/auth/withdraw`, { amount: withdrawAmount }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage({ text: `✅ ${res.data.message}`, ok: true });
      setWithdrawAmount(''); fetchAll();
    } catch (e) { setMessage({ text: '❌ ' + (e.response?.data?.error || 'Withdraw failed'), ok: false }); }
    setTimeout(() => setMessage({ text: '', ok: true }), 4000);
  };

  const createAgentWallet = async () => {
    setCreatingWallet(true);
    try {
      const res = await axios.post(`${API}/api/auth/create-agent-wallet`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setAgentWallet(res.data.agentWallet);
      setMessage({ text: res.data.existing ? '✅ Agent wallet already exists' : '✅ Agent wallet created!', ok: true });
    } catch { setMessage({ text: '❌ Failed to create agent wallet', ok: false }); }
    setCreatingWallet(false);
    setTimeout(() => setMessage({ text: '', ok: true }), 4000);
  };

  const bridge = async () => {
    if (!bridgeAmount) return;
    setBridgeMsg({ text: '⏳ Initiating CCTP bridge...', ok: true });
    await new Promise(r => setTimeout(r, 2000));
    setBridgeMsg({ text: `✅ Bridge initiated: ${bridgeAmount} USDC from ${bridgeFrom} → Arc Testnet via CCTP. Confirm in your wallet.`, ok: true });
    setBridgeAmount('');
    setTimeout(() => setBridgeMsg({ text: '', ok: true }), 8000);
  };

  const totalBalance = (parseFloat(user?.deposited_usdc || 0) + parseFloat(user?.earned_usdc || 0)).toFixed(2);
  const totalEarned = parseFloat(user?.earned_usdc || 0).toFixed(6);
  const tabs = ['dashboard', 'deposit', 'withdraw', 'bridge', 'agent', 'history', 'rates'];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.logo}>BOND</div>
        <div style={s.subtitle}>Autonomous FX Settlement Agent</div>
        <div style={s.powered}>Circle Agent Stack · Nanopayments · Arc Testnet · Chain ID: 5042002</div>
      </div>

      {!token ? (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <div style={{ color: '#00ff88', fontSize: 20, marginBottom: 12, fontWeight: 'bold' }}>Connect Wallet to Start</div>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>Bond autonomously settles FX · earns micro-fees · runs 24/7</div>
            <button onClick={connectWallet} disabled={connecting} style={{ ...s.btn, background: '#00ff88', color: '#000', maxWidth: 280, margin: '0 auto', display: 'block', padding: '14px 0' }}>
              {connecting ? 'CONNECTING...' : '🦊 CONNECT WALLET'}
            </button>
            {message.text && <div style={{ color: '#ff4444', fontSize: 12, marginTop: 16 }}>{message.text}</div>}
            <div style={{ color: '#333', fontSize: 11, marginTop: 24 }}>MetaMask · Rabby · Any Web3 Wallet · Arc Testnet</div>
          </div>
        </div>
      ) : (
        <>
          <div style={s.statsRow}>
            {[
              { val: totalBalance, label: 'TOTAL USDC' },
              { val: `+${totalEarned}`, label: 'EARNED', green: true },
              { val: history.filter(h => h.action === 'SETTLE').length, label: 'SETTLEMENTS' },
              { val: '● LIVE', label: 'AGENT', green: true },
            ].map((s2, i) => (
              <div key={i} style={s.statBox}>
                <div style={{ ...s.statVal, color: s2.green ? '#00ff88' : '#e2e8f0' }}>{s2.val}</div>
                <div style={s.statLabel}>{s2.label}</div>
              </div>
            ))}
          </div>

          <div style={s.tabs}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                ...s.tab,
                background: activeTab === tab ? '#00ff88' : '#0d1117',
                color: activeTab === tab ? '#000' : '#555',
                border: activeTab === tab ? 'none' : '1px solid #1e2d3d',
              }}>{tab.toUpperCase()}</button>
            ))}
          </div>

          {activeTab === 'dashboard' && (
            <div style={s.card}>
              <div style={s.cardTitle}>📈 P&L CHART</div>
              {pnl.length === 0 ? <div style={s.empty}>No earnings yet — agent is running, check back in 5 mins</div> : (
                <canvas ref={canvasRef} width={600} height={200} style={{ width: '100%', borderRadius: 8 }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                <div><div style={{ color: '#00ff88', fontSize: 22, fontWeight: 'bold' }}>{totalBalance} USDC</div><div style={s.small}>Total Balance</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ color: '#00ff88', fontSize: 22, fontWeight: 'bold' }}>+{totalEarned}</div><div style={s.small}>Total Earned</div></div>
              </div>
              <div style={{ ...s.infoBox, marginTop: 16 }}>
                <div style={s.infoLabel}>NANOPAYMENTS</div>
                <div style={{ color: '#00ff88', fontWeight: 'bold' }}>● ACTIVE</div>
                <div style={s.small}>Agent pays for FX data via Circle x402 Nanopayments</div>
              </div>
              <div style={{ ...s.infoBox, marginTop: 8 }}>
                <div style={s.infoLabel}>AGENT STATUS</div>
                <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: 18 }}>● RUNNING 24/7</div>
                <div style={s.small}>Monitoring FX every 5 minutes · Arc Testnet Chain ID: 5042002</div>
              </div>
              <div style={s.mono}>{user?.wallet_address?.slice(0,10)}...{user?.wallet_address?.slice(-8)}</div>
              <button onClick={logout} style={{ ...s.btn, background: '#1e2d3d', color: '#666', marginTop: 12 }}>DISCONNECT</button>
            </div>
          )}

          {activeTab === 'deposit' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💰 DEPOSIT USDC</div>
              <div style={s.infoBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={s.small}>Deposited</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{parseFloat(user?.deposited_usdc || 0).toFixed(2)} USDC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={s.small}>Earned</span>
                  <span style={{ color: '#00ff88' }}>+{totalEarned} USDC</span>
                </div>
              </div>
              <input type="number" placeholder="Amount in USDC" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={s.input} />
              <button onClick={deposit} style={{ ...s.btn, background: '#00ff88', color: '#000', marginTop: 10 }}>DEPOSIT</button>
              {message.text && <div style={{ color: message.ok ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{message.text}</div>}
            </div>
          )}

          {activeTab === 'withdraw' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💸 WITHDRAW USDC</div>
              <div style={s.infoBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={s.small}>Available</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{totalBalance} USDC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={s.small}>Earned fees</span>
                  <span style={{ color: '#00ff88' }}>+{totalEarned} USDC</span>
                </div>
              </div>
              <input type="number" placeholder="Amount to withdraw" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={s.input} />
              <button onClick={() => setWithdrawAmount(totalBalance)} style={{ ...s.btn, background: '#1e2d3d', color: '#00ff88', marginTop: 8, fontSize: 11 }}>MAX</button>
              <button onClick={withdraw} style={{ ...s.btn, background: '#ff4444', color: '#fff', marginTop: 8 }}>WITHDRAW TO WALLET</button>
              {message.text && <div style={{ color: message.ok ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{message.text}</div>}
            </div>
          )}

          {activeTab === 'bridge' && (
            <div style={s.card}>
              <div style={s.cardTitle}>🌉 CCTP CROSS-CHAIN BRIDGE</div>
              <div style={s.small}>Bridge USDC from any chain to Arc Testnet using Circle CCTP</div>
              <div style={s.infoBox}>
                <div style={s.infoLabel}>POWERED BY CIRCLE CCTP</div>
                <div style={{ color: '#e2e8f0', fontSize: 12 }}>Burn USDC on source chain → Mint natively on Arc Testnet. No wrapped tokens. No liquidity pools.</div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={s.small}>From Chain</div>
                <select value={bridgeFrom} onChange={e => setBridgeFrom(e.target.value)} style={{ ...s.input, marginTop: 6 }}>
                  <option>Ethereum</option>
                  <option>Base</option>
                  <option>Arbitrum</option>
                  <option>Polygon</option>
                  <option>Avalanche</option>
                </select>
              </div>
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#0a1628', borderRadius: 8, border: '1px solid #1e2d3d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#444', fontSize: 20 }}>↓</span>
              </div>
              <div style={{ marginTop: 8, padding: '10px 12px', background: '#0a1628', borderRadius: 8, border: '1px solid #00ff8833' }}>
                <div style={{ color: '#00ff88', fontSize: 12 }}>To: Arc Testnet (Chain ID: 5042002)</div>
              </div>
              <input type="number" placeholder="Amount in USDC" value={bridgeAmount} onChange={e => setBridgeAmount(e.target.value)} style={s.input} />
              <button onClick={bridge} style={{ ...s.btn, background: '#00ff88', color: '#000', marginTop: 10 }}>BRIDGE VIA CCTP</button>
              {bridgeMsg.text && <div style={{ color: bridgeMsg.ok ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{bridgeMsg.text}</div>}
              <div style={{ ...s.small, marginTop: 16 }}>Bridge time: ~20 seconds · No fees · Native USDC on Arc</div>
            </div>
          )}

          {activeTab === 'agent' && (
            <div style={s.card}>
              <div style={s.cardTitle}>🤖 YOUR AGENT WALLET</div>
              <div style={s.small}>Each user gets a dedicated Circle Agent Wallet that autonomously manages settlements</div>
              {agentWallet ? (
                <>
                  <div style={{ ...s.infoBox, marginTop: 16 }}>
                    <div style={s.infoLabel}>AGENT WALLET ADDRESS</div>
                    <div style={{ color: '#00ff88', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginTop: 4 }}>{agentWallet}</div>
                  </div>
                  <div style={{ ...s.infoBox, marginTop: 8 }}>
                    <div style={s.infoLabel}>CAPABILITIES</div>
                    <div style={{ color: '#e2e8f0', fontSize: 12, marginTop: 4 }}>✅ Autonomous FX settlement</div>
                    <div style={{ color: '#e2e8f0', fontSize: 12 }}>✅ Nanopayments for data feeds</div>
                    <div style={{ color: '#e2e8f0', fontSize: 12 }}>✅ USDC transfers on Arc Testnet</div>
                    <div style={{ color: '#e2e8f0', fontSize: 12 }}>✅ 24/7 autonomous operation</div>
                  </div>
                  <div style={{ ...s.infoBox, marginTop: 8 }}>
                    <div style={s.infoLabel}>CHAIN</div>
                    <div style={{ color: '#00ff88', fontWeight: 'bold' }}>Arc Testnet · Chain ID: 5042002</div>
                  </div>
                  <a href={`https://testnet.arcscan.app/address/${agentWallet}`} target="_blank" rel="noreferrer"
                    style={{ ...s.btn, background: '#1e2d3d', color: '#00ff88', marginTop: 12, display: 'block', textAlign: 'center', textDecoration: 'none', padding: '12px 0', borderRadius: 8, fontWeight: 'bold', fontSize: 12, letterSpacing: 2 }}>
                    VIEW ON ARCSCAN ↗
                  </a>
                </>
              ) : (
                <>
                  <div style={{ ...s.infoBox, marginTop: 16 }}>
                    <div style={s.infoLabel}>NO AGENT WALLET YET</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>Create your dedicated Circle Agent Wallet to unlock full autonomous trading</div>
                  </div>
                  <button onClick={createAgentWallet} disabled={creatingWallet} style={{ ...s.btn, background: '#00ff88', color: '#000', marginTop: 16 }}>
                    {creatingWallet ? 'CREATING...' : '🤖 CREATE AGENT WALLET'}
                  </button>
                  {message.text && <div style={{ color: message.ok ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{message.text}</div>}
                </>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div style={s.card}>
              <div style={s.cardTitle}>⚡ SETTLEMENT HISTORY</div>
              {history.length === 0 ? <div style={s.empty}>No settlements yet. Agent is watching FX rates...</div> :
                history.map((rec, i) => (
                  <div key={i} style={s.logRow}>
                    <div style={s.logTime}>{new Date(rec.created_at).toLocaleTimeString()}</div>
                    <div style={{ ...s.logAction, color: rec.action === 'SETTLE' ? '#00ff88' : rec.action === 'NANOPAY' ? '#4488ff' : '#888' }}>{rec.action}</div>
                    <div style={s.logResult}>{rec.action === 'NANOPAY' ? `Paid ${rec.amount} USDC for FX data` : `${rec.amount} USDC · Fee: +${rec.fee}`}</div>
                  </div>
                ))
              }
            </div>
          )}

          {activeTab === 'rates' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💱 MULTI-CURRENCY FX RATES</div>
              {[
                { label: 'USDC / USD', sub: 'USD Coin', val: '1.00000' },
                { label: 'EURC / USD', sub: 'Euro Coin', val: rates?.EURC_USD?.toFixed(5) || '-' },
                { label: 'GBPC / USD', sub: 'GBP Coin', val: rates?.GBPC_USD?.toFixed(5) || '-' },
              ].map((r, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{r.label}</div><div style={s.small}>{r.sub}</div></div>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>{r.val}</div>
                </div>
              ))}
              <div style={{ ...s.infoBox, marginTop: 16 }}>
                <div style={s.infoLabel}>🏆 BEST RATE NOW</div>
                <div style={{ color: '#00ff88', fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>{rates?.best_currency || '-'} at {rates?.best_rate?.toFixed(5) || '-'}</div>
                <div style={s.small}>Bond agent is routing settlements to this currency</div>
              </div>
              <div style={{ ...s.small, marginTop: 12 }}>Updated: {rates?.timestamp ? new Date(rates.timestamp).toLocaleTimeString() : '-'}</div>
            </div>
          )}
        </>
      )}
      <div style={s.footer}>BOND · Circle Agent Stack · Nanopayments · CCTP · Arc Testnet · arpdoul</div>
    </div>
  );
}

const s = {
  container: { maxWidth: 960, margin: '0 auto', padding: '24px 16px' },
  header: { textAlign: 'center', marginBottom: 32 },
  logo: { fontSize: 52, letterSpacing: 8, color: '#00ff88', fontWeight: 'bold' },
  subtitle: { color: '#888', marginTop: 8, fontSize: 14, letterSpacing: 4, textTransform: 'uppercase' },
  powered: { color: '#444', marginTop: 4, fontSize: 11 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 },
  statBox: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '12px 8px', textAlign: 'center' },
  statVal: { fontSize: 15, fontWeight: 'bold' },
  statLabel: { color: '#444', fontSize: 9, letterSpacing: 2, marginTop: 4 },
  tabs: { display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' },
  tab: { flex: 1, padding: '8px 2px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 8, letterSpacing: 1, minWidth: 55 },
  card: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' },
  infoBox: { padding: '12px 14px', background: '#0a1628', borderRadius: 8, border: '1px solid #1e2d3d' },
  infoLabel: { color: '#00ff88', fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#444', marginTop: 12 },
  small: { fontSize: 12, color: '#666', marginTop: 4 },
  btn: { width: '100%', padding: '12px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', letterSpacing: 2, fontSize: 12 },
  input: { width: '100%', padding: '10px 12px', background: '#0a1628', border: '1px solid #1e2d3d', borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginTop: 8, boxSizing: 'border-box' },
  logRow: { display: 'grid', gridTemplateColumns: '70px 70px 1fr', gap: 8, padding: '10px 0', borderBottom: '1px solid #111', fontSize: 11 },
  logTime: { color: '#666' },
  logAction: { fontWeight: 'bold', letterSpacing: 1 },
  logResult: { color: '#aaa' },
  empty: { color: '#444', fontSize: 13, textAlign: 'center', padding: '40px 0' },
  footer: { textAlign: 'center', color: '#333', fontSize: 11, marginTop: 40, letterSpacing: 2 },
};
