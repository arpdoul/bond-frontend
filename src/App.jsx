import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [address, setAddress] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bond_token'));
  const [user, setUser] = useState(null);
  const [rates, setRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [message, setMessage] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const canvasRef = useRef(null);

  const connectWallet = async () => {
    setConnecting(true);
    try {
      if (!window.ethereum) { setMessage('Install MetaMask or Rabby wallet'); setConnecting(false); return; }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      setAddress(addr);
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
      setMessage('');
    } catch (e) { setMessage('Connection failed: ' + e.message); }
    setConnecting(false);
  };

  const logout = () => { localStorage.removeItem('bond_token'); setToken(null); setUser(null); setAddress(null); };

  const fetchAll = async () => {
    if (!token) return;
    try {
      const [u, r, h, p] = await Promise.all([
        axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/api/rates`),
        axios.get(`${API}/api/auth/history`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/api/auth/pnl`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setUser(u.data);
      setRates(r.data);
      setHistory(h.data);
      setPnl(p.data);
    } catch { logout(); }
  };

  useEffect(() => {
    if (token) fetchAll();
    const interval = setInterval(() => { if (token) fetchAll(); }, 10000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) setAddress(accounts[0]);
      });
    }
  }, []);

  // Draw P&L chart
  useEffect(() => {
    if (!canvasRef.current || pnl.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const values = pnl.map(p => parseFloat(p.earned));
    const max = Math.max(...values, 0.001);
    const pad = 40;

    // Grid lines
    ctx.strokeStyle = '#1e2d3d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.font = '10px monospace';
      ctx.fillText(((max * (1 - i / 4))).toFixed(6), 2, y + 4);
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill
    ctx.lineTo(pad + (w - pad * 2), h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,255,136,0.05)';
    ctx.fill();

    // Dots
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
    });
  }, [pnl]);

  const deposit = async () => {
    if (!depositAmount) return;
    try {
      await axios.post(`${API}/api/auth/deposit`, { amount: depositAmount }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage(`✅ Deposited ${depositAmount} USDC`);
      setDepositAmount('');
      fetchAll();
    } catch { setMessage('❌ Deposit failed'); }
    setTimeout(() => setMessage(''), 4000);
  };

  const withdraw = async () => {
    if (!withdrawAmount) return;
    try {
      const res = await axios.post(`${API}/api/auth/withdraw`, { amount: withdrawAmount }, { headers: { Authorization: `Bearer ${token}` } });
      setWithdrawMsg(`✅ ${res.data.message}`);
      setWithdrawAmount('');
      fetchAll();
    } catch (e) { setWithdrawMsg('❌ ' + (e.response?.data?.error || 'Withdraw failed')); }
    setTimeout(() => setWithdrawMsg(''), 4000);
  };

  const totalBalance = (parseFloat(user?.deposited_usdc || 0) + parseFloat(user?.earned_usdc || 0)).toFixed(2);
  const totalEarned = parseFloat(user?.earned_usdc || 0).toFixed(6);
  const totalSettlements = history.length;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.logo}>BOND</div>
        <div style={s.subtitle}>Autonomous FX Settlement Agent</div>
        <div style={s.powered}>Circle Agent Stack · Arc Testnet · Chain ID: 5042002</div>
      </div>

      {!token ? (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <div style={{ color: '#00ff88', fontSize: 20, marginBottom: 12, fontWeight: 'bold' }}>Connect Wallet to Start</div>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>Bond autonomously settles FX on your behalf and earns micro-fees 24/7</div>
            <button onClick={connectWallet} disabled={connecting} style={{ ...s.btn, background: '#00ff88', color: '#000', maxWidth: 280, margin: '0 auto', display: 'block', fontSize: 14, padding: '14px 0' }}>
              {connecting ? 'CONNECTING...' : '🦊 CONNECT WALLET'}
            </button>
            {message && <div style={{ color: '#ff4444', fontSize: 12, marginTop: 16 }}>{message}</div>}
            <div style={{ color: '#333', fontSize: 11, marginTop: 24 }}>Works with MetaMask · Rabby · Any Web3 wallet</div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div style={s.statsRow}>
            <div style={s.statBox}>
              <div style={s.statVal}>{totalBalance}</div>
              <div style={s.statLabel}>TOTAL USDC</div>
            </div>
            <div style={s.statBox}>
              <div style={{ ...s.statVal, color: '#00ff88' }}>+{totalEarned}</div>
              <div style={s.statLabel}>EARNED</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statVal}>{totalSettlements}</div>
              <div style={s.statLabel}>SETTLEMENTS</div>
            </div>
            <div style={s.statBox}>
              <div style={{ ...s.statVal, color: '#00ff88', fontSize: 14 }}>● LIVE</div>
              <div style={s.statLabel}>AGENT</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            {['dashboard', 'deposit', 'withdraw', 'history', 'rates'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                ...s.tab, background: activeTab === tab ? '#00ff88' : '#0d1117',
                color: activeTab === tab ? '#000' : '#666',
                border: activeTab === tab ? 'none' : '1px solid #1e2d3d',
              }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div style={s.card}>
              <div style={s.cardTitle}>📈 P&L CHART — EARNINGS OVER TIME</div>
              {pnl.length === 0 ? (
                <div style={s.empty}>No earnings data yet. Agent is running — check back in 5 minutes.</div>
              ) : (
                <canvas ref={canvasRef} width={600} height={200} style={{ width: '100%', borderRadius: 8 }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                <div>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>{totalBalance} USDC</div>
                  <div style={s.small}>Total Balance</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>+{totalEarned}</div>
                  <div style={s.small}>Total Earned</div>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#0a1628', borderRadius: 8, border: '1px solid #00ff8833' }}>
                <div style={{ color: '#00ff88', fontSize: 11, letterSpacing: 2 }}>AGENT STATUS</div>
                <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: 18, marginTop: 4 }}>● RUNNING 24/7</div>
                <div style={s.small}>Monitoring FX every 5 minutes · Chain ID: 5042002</div>
              </div>
              <div style={s.mono}>{user?.wallet_address?.slice(0,10)}...{user?.wallet_address?.slice(-8)}</div>
              <button onClick={logout} style={{ ...s.btn, background: '#1e2d3d', color: '#666', marginTop: 12 }}>DISCONNECT</button>
            </div>
          )}

          {/* Deposit Tab */}
          {activeTab === 'deposit' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💰 DEPOSIT USDC</div>
              <div style={s.small}>Fund your Bond agent to start earning from FX spreads</div>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#0a1628', borderRadius: 8, border: '1px solid #1e2d3d', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={s.small}>Current Deposited</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{parseFloat(user?.deposited_usdc || 0).toFixed(2)} USDC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={s.small}>Total Earned</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>+{totalEarned} USDC</span>
                </div>
              </div>
              <input type="number" placeholder="Amount in USDC" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={s.input} />
              <button onClick={deposit} style={{ ...s.btn, background: '#00ff88', color: '#000', marginTop: 10 }}>DEPOSIT</button>
              {message && <div style={{ color: message.includes('✅') ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{message}</div>}
            </div>
          )}

          {/* Withdraw Tab */}
          {activeTab === 'withdraw' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💸 WITHDRAW USDC</div>
              <div style={s.small}>Withdraw your balance back to your wallet</div>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#0a1628', borderRadius: 8, border: '1px solid #1e2d3d', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={s.small}>Available to withdraw</span>
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{totalBalance} USDC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={s.small}>Earned fees</span>
                  <span style={{ color: '#00ff88' }}>+{totalEarned} USDC</span>
                </div>
              </div>
              <input type="number" placeholder="Amount to withdraw" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={s.input} />
              <button onClick={() => setWithdrawAmount(totalBalance)} style={{ ...s.btn, background: '#1e2d3d', color: '#00ff88', marginTop: 8, fontSize: 11 }}>MAX</button>
              <button onClick={withdraw} style={{ ...s.btn, background: '#ff4444', color: '#fff', marginTop: 8 }}>WITHDRAW</button>
              {withdrawMsg && <div style={{ color: withdrawMsg.includes('✅') ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{withdrawMsg}</div>}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div style={s.card}>
              <div style={s.cardTitle}>⚡ SETTLEMENT HISTORY</div>
              {history.length === 0 ? (
                <div style={s.empty}>No settlements yet. Agent is watching FX rates for you...</div>
              ) : history.map((rec, i) => (
                <div key={i} style={s.logRow}>
                  <div style={s.logTime}>{new Date(rec.created_at).toLocaleTimeString()}</div>
                  <div style={{ ...s.logAction, color: '#00ff88' }}>SETTLE</div>
                  <div style={s.logResult}>{rec.amount} USDC · Fee: +{rec.fee} USDC</div>
                </div>
              ))}
            </div>
          )}

          {/* Rates Tab */}
          {activeTab === 'rates' && (
            <div style={s.card}>
              <div style={s.cardTitle}>💱 MULTI-CURRENCY FX RATES</div>
              <div style={{ padding: '12px 0', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>USDC / USD</div>
                    <div style={s.small}>USD Coin</div>
                  </div>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>1.00000</div>
                </div>
              </div>
              <div style={{ padding: '12px 0', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>EURC / USD</div>
                    <div style={s.small}>Euro Coin</div>
                  </div>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>{rates?.EURC_USD?.toFixed(5) || '-'}</div>
                </div>
              </div>
              <div style={{ padding: '12px 0', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>GBPC / USD</div>
                    <div style={s.small}>GBP Coin</div>
                  </div>
                  <div style={{ color: '#00ff88', fontSize: 20, fontWeight: 'bold' }}>{rates?.GBPC_USD?.toFixed(5) || '-'}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#0a1628', borderRadius: 8, border: '1px solid #00ff8833' }}>
                <div style={s.small}>🏆 BEST RATE RIGHT NOW</div>
                <div style={{ color: '#00ff88', fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>
                  {rates?.best_currency || '-'} at {rates?.best_rate?.toFixed(5) || '-'}
                </div>
                <div style={s.small}>Bond agent is routing to this currency</div>
              </div>
              <div style={{ ...s.small, marginTop: 12 }}>Updated: {rates?.timestamp ? new Date(rates.timestamp).toLocaleTimeString() : '-'}</div>
            </div>
          )}
        </>
      )}
      <div style={s.footer}>BOND · Circle Agent Stack · Arc Testnet (Chain ID: 5042002) · arpdoul</div>
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
  statVal: { color: '#e2e8f0', fontSize: 16, fontWeight: 'bold' },
  statLabel: { color: '#444', fontSize: 9, letterSpacing: 2, marginTop: 4 },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: { flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 9, letterSpacing: 1, minWidth: 60 },
  card: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#444', marginTop: 12 },
  small: { fontSize: 12, color: '#666', marginTop: 4 },
  btn: { width: '100%', padding: '12px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', letterSpacing: 2, fontSize: 12 },
  input: { width: '100%', padding: '10px 12px', background: '#0a1628', border: '1px solid #1e2d3d', borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginTop: 12, boxSizing: 'border-box' },
  logRow: { display: 'grid', gridTemplateColumns: '75px 65px 1fr', gap: 8, padding: '10px 0', borderBottom: '1px solid #111', fontSize: 11 },
  logTime: { color: '#666' },
  logAction: { fontWeight: 'bold', letterSpacing: 1 },
  logResult: { color: '#aaa' },
  empty: { color: '#444', fontSize: 13, textAlign: 'center', padding: '40px 0' },
  footer: { textAlign: 'center', color: '#333', fontSize: 11, marginTop: 40, letterSpacing: 2 },
};
