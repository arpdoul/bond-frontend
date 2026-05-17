import { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [address, setAddress] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bond_token'));
  const [user, setUser] = useState(null);
  const [rates, setRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connectWallet = async () => {
    setConnecting(true);
    try {
      if (!window.ethereum) {
        setMessage('No wallet found. Install MetaMask or Rabby browser extension.');
        setConnecting(false);
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      setAddress(addr);

      // Auto-switch to Arc Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x4CEFA2' }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x4CEFA2',
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
              rpcUrls: ['https://rpc.testnet.arc.network'],
              blockExplorerUrls: ['https://testnet.arcscan.app'],
            }],
          });
        }
      }

      // Login to backend
      const res = await axios.post(`${API}/api/auth/login`, { walletAddress: addr });
      localStorage.setItem('bond_token', res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      setMessage('');
    } catch (e) {
      setMessage('Connection failed: ' + e.message);
    }
    setConnecting(false);
  };

  const logout = () => {
    localStorage.removeItem('bond_token');
    setToken(null);
    setUser(null);
    setAddress(null);
  };

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(res.data);
    } catch { logout(); }
  };

  const fetchRates = async () => {
    try {
      const res = await axios.get(`${API}/api/rates`);
      setRates(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/api/auth/history`, { headers: { Authorization: `Bearer ${token}` } });
      setHistory(res.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (token) { fetchUser(); fetchRates(); fetchHistory(); }
    const interval = setInterval(() => {
      fetchRates();
      if (token) { fetchUser(); fetchHistory(); }
    }, 10000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) setAddress(accounts[0]);
      });
    }
  }, []);

  const deposit = async () => {
    if (!depositAmount || !token) return;
    try {
      await axios.post(`${API}/api/auth/deposit`, { amount: depositAmount }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage(`✅ Deposited ${depositAmount} USDC`);
      setDepositAmount('');
      fetchUser();
    } catch { setMessage('❌ Deposit failed'); }
  };

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
            <div style={{ color: '#00ff88', fontSize: 20, marginBottom: 12, fontWeight: 'bold' }}>
              Connect Wallet to Start
            </div>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
              Bond autonomously settles FX on your behalf and earns micro-fees 24/7
            </div>
            <button onClick={connectWallet} disabled={connecting} style={{
              ...s.btn, background: '#00ff88', color: '#000',
              maxWidth: 280, margin: '0 auto', display: 'block', fontSize: 14, padding: '14px 0'
            }}>
              {connecting ? 'CONNECTING...' : '🦊 CONNECT WALLET'}
            </button>
            {message && <div style={{ color: '#ff4444', fontSize: 12, marginTop: 16 }}>{message}</div>}
            <div style={{ color: '#333', fontSize: 11, marginTop: 24 }}>
              Works with MetaMask · Rabby · Any Web3 wallet
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={s.grid}>
            <div style={s.card}>
              <div style={s.cardTitle}>YOUR ACCOUNT</div>
              <div style={s.mono}>
                {user?.wallet_address?.slice(0,8)}...{user?.wallet_address?.slice(-6)}
              </div>
              <div style={{ color: '#00ff88', fontSize: 26, marginTop: 12, fontWeight: 'bold' }}>
                {parseFloat(user?.deposited_usdc || 0).toFixed(2)} USDC
              </div>
              <div style={s.small}>Deposited Balance</div>
              <div style={{ color: '#00ff88', fontSize: 16, marginTop: 8 }}>
                +{parseFloat(user?.earned_usdc || 0).toFixed(6)} USDC
              </div>
              <div style={s.small}>Total Earned</div>
              <button onClick={logout} style={{ ...s.btn, background: '#1e2d3d', color: '#666', marginTop: 16 }}>
                DISCONNECT
              </button>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>DEPOSIT USDC</div>
              <div style={s.small}>Fund your Bond agent to start earning from FX spreads</div>
              <input
                type="number"
                placeholder="Amount in USDC"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                style={s.input}
              />
              <button onClick={deposit} style={{ ...s.btn, background: '#00ff88', color: '#000', marginTop: 10 }}>
                DEPOSIT
              </button>
              {message && <div style={{ color: message.includes('✅') ? '#00ff88' : '#ff4444', fontSize: 12, marginTop: 10 }}>{message}</div>}
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>LIVE FX RATES</div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 10 }}>
                <span style={s.small}>USDC/USD</span>
                <span style={{ color:'#e2e8f0', fontWeight:'bold' }}>{rates?.USDC_USD || '-'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 10 }}>
                <span style={s.small}>EURC/USD</span>
                <span style={{ color:'#e2e8f0', fontWeight:'bold' }}>{rates?.EURC_USD?.toFixed(5) || '-'}</span>
              </div>
              <div style={s.small}>Updated: {rates?.timestamp ? new Date(rates.timestamp).toLocaleTimeString() : '-'}</div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#0a1628', borderRadius: 8, border: '1px solid #00ff8833' }}>
                <div style={{ color: '#00ff88', fontSize: 11, letterSpacing: 2 }}>AGENT STATUS</div>
                <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: 18, marginTop: 4 }}>● RUNNING 24/7</div>
                <div style={s.small}>Monitoring FX every 5 minutes</div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>YOUR SETTLEMENT HISTORY</div>
            {history.length === 0 ? (
              <div style={s.empty}>No settlements yet. Agent is watching FX rates for you...</div>
            ) : history.map((rec, i) => (
              <div key={i} style={s.logRow}>
                <div style={s.logTime}>{new Date(rec.created_at).toLocaleTimeString()}</div>
                <div style={{ ...s.logAction, color: rec.action === 'SETTLE' ? '#00ff88' : '#888' }}>{rec.action}</div>
                <div style={s.logResult}>{rec.amount} USDC · Fee: {rec.fee} USDC</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={s.footer}>BOND · Circle Agent Stack · Arc Testnet (Chain ID: 5042002) · arpdoul</div>
    </div>
  );
}

const s = {
  container: { maxWidth: 960, margin: '0 auto', padding: '32px 16px' },
  header: { textAlign: 'center', marginBottom: 40 },
  logo: { fontSize: 52, letterSpacing: 8, color: '#00ff88', fontWeight: 'bold' },
  subtitle: { color: '#888', marginTop: 8, fontSize: 14, letterSpacing: 4, textTransform: 'uppercase' },
  powered: { color: '#444', marginTop: 4, fontSize: 11 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 },
  card: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' },
  mono: { fontFamily: 'monospace', fontSize: 13, color: '#888' },
  small: { fontSize: 12, color: '#666', marginTop: 4 },
  btn: { width: '100%', padding: '12px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', letterSpacing: 2, fontSize: 12 },
  input: { width: '100%', padding: '10px 12px', background: '#0a1628', border: '1px solid #1e2d3d', borderRadius: 8, color: '#e2e8f0', fontSize: 14, marginTop: 12, boxSizing: 'border-box' },
  logRow: { display: 'grid', gridTemplateColumns: '80px 80px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #111', fontSize: 12 },
  logTime: { color: '#666' },
  logAction: { fontWeight: 'bold', letterSpacing: 2 },
  logResult: { color: '#aaa' },
  empty: { color: '#444', fontSize: 13, textAlign: 'center', padding: '40px 0' },
  footer: { textAlign: 'center', color: '#333', fontSize: 11, marginTop: 40, letterSpacing: 2 },
};
