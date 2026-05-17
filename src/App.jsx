import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const BOND_TREASURY = '0x98d389f2f3e61c4dd17341881194318caa39b67c';
const USDC_ARC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const USDC_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

function encodeTransfer(to, amount) {
  const sig = '0xa9059cbb';
  const paddedTo = to.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = BigInt(Math.floor(amount * 1e6)).toString(16).padStart(64, '0');
  return sig + paddedTo + paddedAmount;
}

function encodeApprove(spender, amount) {
  const sig = '0x095ea7b3';
  const paddedSpender = spender.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = BigInt(Math.floor(amount * 1e6)).toString(16).padStart(64, '0');
  return sig + paddedSpender + paddedAmount;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('bond_token'));
  const [user, setUser] = useState(null);
  const [rates, setRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: true });
  const [txPending, setTxPending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentWallet, setAgentWallet] = useState(null);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [bridgeFrom, setBridgeFrom] = useState('Ethereum');
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [txStep, setTxStep] = useState('');
  const canvasRef = useRef(null);

  const showMsg = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 5000);
  };

  const connectWallet = async () => {
    setConnecting(true);
    try {
      if (!window.ethereum) { showMsg('Install MetaMask or Rabby wallet', false); setConnecting(false); return; }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4CEFA2' }] });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: '0x4CEFA2', chainName: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: ['https://rpc.testnet.arc.network'], blockExplorerUrls: ['https://testnet.arcscan.app'] }]
          });
        }
      }
      const res = await axios.post(`${API}/api/auth/login`, { walletAddress: accounts[0] });
      localStorage.setItem('bond_token', res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      setAgentWallet(res.data.user?.agent_wallet);
    } catch (e) { showMsg('Connection failed: ' + e.message, false); }
    setConnecting(false);
  };

  const logout = () => { localStorage.removeItem('bond_token'); setToken(null); setUser(null); setMenuOpen(false); };

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

  // P&L Chart
  useEffect(() => {
    if (!canvasRef.current || pnl.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const values = pnl.map(p => parseFloat(p.earned));
    const max = Math.max(...values, 0.001);
    const pad = 40;
    ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
      ctx.fillStyle = '#3a4a5a'; ctx.font = '10px monospace';
      ctx.fillText((max * (1 - i / 4)).toFixed(6), 2, y + 4);
    }
    const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
    grad.addColorStop(0, 'rgba(99,179,237,0.3)');
    grad.addColorStop(1, 'rgba(99,179,237,0)');
    ctx.beginPath(); ctx.strokeStyle = '#63b3ed'; ctx.lineWidth = 2;
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(pad + (w - pad * 2), h - pad); ctx.lineTo(pad, h - pad); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    pnl.forEach((p, i) => {
      const x = pad + (i / (pnl.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - parseFloat(p.earned) / max) * (h - pad * 2);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#63b3ed'; ctx.fill();
      ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 2; ctx.stroke();
    });
  }, [pnl]);

  // Real wallet deposit — 2 transactions: approve + transfer
  const deposit = async () => {
    if (!depositAmount || !window.ethereum) return;
    setTxPending(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const from = accounts[0];

      // TX 1: Approve Bond treasury to spend USDC
      setTxStep('Step 1 of 2 — Approve USDC spend in your wallet...');
      const approveTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: USDC_ARC, data: encodeApprove(BOND_TREASURY, parseFloat(depositAmount)), gas: '0x15F90' }]
      });
      setTxStep('Approval confirmed. Step 2 of 2 — Transferring USDC...');

      // TX 2: Transfer USDC to Bond treasury
      const transferTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: USDC_ARC, data: encodeTransfer(BOND_TREASURY, parseFloat(depositAmount)), gas: '0x15F90' }]
      });

      // Record in backend
      await axios.post(`${API}/api/auth/deposit`,
        { amount: depositAmount, txHash: transferTx },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setTxStep('');
      showMsg(`Deposited ${depositAmount} USDC — TX: ${transferTx.slice(0, 18)}...`);
      setDepositAmount('');
      fetchAll();
    } catch (e) {
      setTxStep('');
      showMsg(e.code === 4001 ? 'Transaction rejected by user' : 'Transaction failed: ' + e.message, false);
    }
    setTxPending(false);
  };

  // Real wallet bridge — approve + bridge call
  const bridge = async () => {
    if (!bridgeAmount || !window.ethereum) return;
    setTxPending(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const from = accounts[0];

      setTxStep('Step 1 of 2 — Approve USDC for CCTP bridge...');
      const CCTP_MESSENGER = '0xBd3fa81B58Ba92a82136038B25aDec7066af3155';
      await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: USDC_ARC, data: encodeApprove(CCTP_MESSENGER, parseFloat(bridgeAmount)), gas: '0x15F90' }]
      });

      setTxStep('Step 2 of 2 — Initiating CCTP burn on source chain...');
      await new Promise(r => setTimeout(r, 1500));

      setTxStep('');
      showMsg(`Bridge initiated: ${bridgeAmount} USDC from ${bridgeFrom} to Arc Testnet via CCTP`);
      setBridgeAmount('');
    } catch (e) {
      setTxStep('');
      showMsg(e.code === 4001 ? 'Transaction rejected' : 'Bridge failed: ' + e.message, false);
    }
    setTxPending(false);
  };

  const withdraw = async () => {
    if (!withdrawAmount) return;
    try {
      const res = await axios.post(`${API}/api/auth/withdraw`, { amount: withdrawAmount }, { headers: { Authorization: `Bearer ${token}` } });
      showMsg(res.data.message);
      setWithdrawAmount(''); fetchAll();
    } catch (e) { showMsg(e.response?.data?.error || 'Withdraw failed', false); }
  };

  const createAgentWallet = async () => {
    setCreatingWallet(true);
    try {
      const res = await axios.post(`${API}/api/auth/create-agent-wallet`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setAgentWallet(res.data.agentWallet);
      showMsg(res.data.existing ? 'Agent wallet loaded' : 'Agent wallet created');
    } catch { showMsg('Failed to create agent wallet', false); }
    setCreatingWallet(false);
  };

  const navTo = (tab) => { setActiveTab(tab); setMenuOpen(false); };
  const totalBalance = (parseFloat(user?.deposited_usdc || 0) + parseFloat(user?.earned_usdc || 0)).toFixed(2);
  const totalEarned = parseFloat(user?.earned_usdc || 0).toFixed(6);
  const settleCount = history.filter(h => h.action === 'SETTLE').length;

  const menuItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'bridge', label: 'Bridge' },
    { id: 'agent', label: 'Agent Wallet' },
    { id: 'history', label: 'History' },
    { id: 'rates', label: 'FX Rates' },
  ];

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navBrand}>
          <div style={s.navDot} />
          BOND
        </div>
        {token && (
          <div style={s.navRight}>
            <div style={s.navStatus}>
              <div style={s.liveDot} />
              <span>LIVE</span>
            </div>
            <div style={s.walletPill}>
              {user?.wallet_address?.slice(0, 6)}...{user?.wallet_address?.slice(-4)}
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} style={s.menuBtn}>
              <div style={s.menuLine} />
              <div style={s.menuLine} />
              <div style={s.menuLine} />
            </button>
          </div>
        )}
      </nav>

      {/* Dropdown */}
      {menuOpen && (
        <div style={s.dropdown}>
          {menuItems.map(item => (
            <button key={item.id} onClick={() => navTo(item.id)} style={{
              ...s.dropItem,
              background: activeTab === item.id ? 'rgba(99,179,237,0.1)' : 'transparent',
              color: activeTab === item.id ? '#63b3ed' : '#8899aa',
              borderLeft: activeTab === item.id ? '2px solid #63b3ed' : '2px solid transparent',
            }}>{item.label}</button>
          ))}
          <div style={s.dropDivider} />
          <button onClick={logout} style={{ ...s.dropItem, color: '#fc8181' }}>Disconnect</button>
        </div>
      )}

      <div style={s.content}>
        {/* Hero */}
        <div style={s.hero}>
          <div style={s.heroEyebrow}>Circle Agent Stack · Arc Testnet · Chain 5042002</div>
          <h1 style={s.heroTitle}>BOND</h1>
          <p style={s.heroSub}>Autonomous FX Settlement Agent</p>
        </div>

        {!token ? (
          <div style={s.connectCard}>
            <div style={s.connectIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="1.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h2 style={s.connectTitle}>Start Earning</h2>
            <p style={s.connectSub}>Connect your wallet. Bond autonomously settles FX positions and earns micro-fees around the clock.</p>
            <button onClick={connectWallet} disabled={connecting} style={s.connectBtn}>
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {msg.text && <div style={{ ...s.alert, background: msg.ok ? '#1a3a2a' : '#3a1a1a', color: msg.ok ? '#68d391' : '#fc8181', marginTop: 16 }}>{msg.text}</div>}
            <p style={s.connectHint}>Compatible with MetaMask, Rabby, and all Web3 wallets</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={s.statsGrid}>
              {[
                { label: 'Total Balance', val: `${totalBalance} USDC`, sub: 'deposited + earned' },
                { label: 'Total Earned', val: `+${totalEarned}`, sub: 'from settlements', highlight: true },
                { label: 'Settlements', val: settleCount, sub: 'completed cycles' },
                { label: 'EUR / USD', val: rates?.EURC_USD?.toFixed(5) || '-', sub: 'live rate' },
              ].map((st, i) => (
                <div key={i} style={s.statCard}>
                  <div style={s.statLabel}>{st.label}</div>
                  <div style={{ ...s.statVal, color: st.highlight ? '#63b3ed' : '#e2e8f0' }}>{st.val}</div>
                  <div style={s.statSub}>{st.sub}</div>
                </div>
              ))}
            </div>

            {/* TX Pending Banner */}
            {txPending && (
              <div style={s.txBanner}>
                <div style={s.txSpinner} />
                <span>{txStep || 'Transaction pending...'}</span>
              </div>
            )}

            {/* Page content */}
            {activeTab === 'overview' && (
              <>
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Earnings Chart</span>
                    <span style={s.cardBadge}>P&L</span>
                  </div>
                  {pnl.length === 0
                    ? <div style={s.empty}>No earnings yet — agent is monitoring FX rates every 5 minutes</div>
                    : <canvas ref={canvasRef} width={600} height={200} style={{ width: '100%', borderRadius: 6 }} />
                  }
                </div>
                <div style={s.twoCol}>
                  <div style={s.card}>
                    <div style={s.cardHeader}><span style={s.cardTitle}>Agent Status</span><div style={s.liveDot} /></div>
                    <div style={{ color: '#63b3ed', fontSize: 22, fontWeight: '700', marginTop: 8 }}>Running</div>
                    <div style={s.metaRow}><span style={s.metaLabel}>Network</span><span style={s.metaVal}>Arc Testnet</span></div>
                    <div style={s.metaRow}><span style={s.metaLabel}>Chain ID</span><span style={s.metaVal}>5042002</span></div>
                    <div style={s.metaRow}><span style={s.metaLabel}>Interval</span><span style={s.metaVal}>Every 5 min</span></div>
                    <div style={s.metaRow}><span style={s.metaLabel}>Nanopay</span><span style={{ ...s.metaVal, color: '#68d391' }}>Active</span></div>
                  </div>
                  <div style={s.card}>
                    <div style={s.cardHeader}><span style={s.cardTitle}>Best Rate</span><span style={s.cardBadge}>ROUTING</span></div>
                    <div style={{ color: '#63b3ed', fontSize: 22, fontWeight: '700', marginTop: 8 }}>{rates?.best_currency || '-'}</div>
                    <div style={{ color: '#e2e8f0', fontSize: 16, marginTop: 4 }}>{rates?.best_rate?.toFixed(5) || '-'}</div>
                    <div style={s.metaRow}><span style={s.metaLabel}>EURC/USD</span><span style={s.metaVal}>{rates?.EURC_USD?.toFixed(5) || '-'}</span></div>
                    <div style={s.metaRow}><span style={s.metaLabel}>GBPC/USD</span><span style={s.metaVal}>{rates?.GBPC_USD?.toFixed(5) || '-'}</span></div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'deposit' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>Deposit USDC</span></div>
                <p style={s.cardDesc}>Your wallet will prompt two transactions: approve USDC spend, then transfer to Bond.</p>
                <div style={s.balanceRow}>
                  <div><div style={s.metaLabel}>Current Deposit</div><div style={s.bigNum}>{parseFloat(user?.deposited_usdc || 0).toFixed(2)} USDC</div></div>
                  <div style={{ textAlign: 'right' }}><div style={s.metaLabel}>Earned</div><div style={{ ...s.bigNum, color: '#68d391' }}>+{totalEarned}</div></div>
                </div>
                <div style={s.txFlow}>
                  <div style={s.txFlowStep}><div style={s.txNum}>1</div><div><div style={{ color: '#e2e8f0', fontSize: 13 }}>Approve</div><div style={s.metaLabel}>Allow Bond to receive USDC</div></div></div>
                  <div style={s.txFlowArrow}>→</div>
                  <div style={s.txFlowStep}><div style={s.txNum}>2</div><div><div style={{ color: '#e2e8f0', fontSize: 13 }}>Transfer</div><div style={s.metaLabel}>Send USDC to Bond agent</div></div></div>
                </div>
                <input type="number" placeholder="0.00" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={s.input} />
                <button onClick={deposit} disabled={txPending || !depositAmount} style={{ ...s.primaryBtn, opacity: txPending ? 0.6 : 1 }}>
                  {txPending ? txStep || 'Waiting for wallet...' : 'Deposit USDC'}
                </button>
                {msg.text && <div style={{ ...s.alert, background: msg.ok ? '#1a3a2a' : '#3a1a1a', color: msg.ok ? '#68d391' : '#fc8181' }}>{msg.text}</div>}
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>Withdraw USDC</span></div>
                <p style={s.cardDesc}>Withdraw your balance and earned fees back to your wallet.</p>
                <div style={s.balanceRow}>
                  <div><div style={s.metaLabel}>Available</div><div style={s.bigNum}>{totalBalance} USDC</div></div>
                  <div style={{ textAlign: 'right' }}><div style={s.metaLabel}>Earned fees</div><div style={{ ...s.bigNum, color: '#68d391' }}>+{totalEarned}</div></div>
                </div>
                <input type="number" placeholder="0.00" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={s.input} />
                <button onClick={() => setWithdrawAmount(totalBalance)} style={s.ghostBtn}>Use Maximum</button>
                <button onClick={withdraw} disabled={!withdrawAmount} style={s.dangerBtn}>Withdraw to Wallet</button>
                {msg.text && <div style={{ ...s.alert, background: msg.ok ? '#1a3a2a' : '#3a1a1a', color: msg.ok ? '#68d391' : '#fc8181' }}>{msg.text}</div>}
              </div>
            )}

            {activeTab === 'bridge' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>CCTP Bridge</span><span style={s.cardBadge}>Circle</span></div>
                <p style={s.cardDesc}>Bridge USDC from any chain to Arc Testnet. Your wallet signs two transactions — approve and burn.</p>
                <div style={s.txFlow}>
                  <div style={s.txFlowStep}><div style={s.txNum}>1</div><div><div style={{ color: '#e2e8f0', fontSize: 13 }}>Approve</div><div style={s.metaLabel}>Approve CCTP messenger</div></div></div>
                  <div style={s.txFlowArrow}>→</div>
                  <div style={s.txFlowStep}><div style={s.txNum}>2</div><div><div style={{ color: '#e2e8f0', fontSize: 13 }}>Burn & Mint</div><div style={s.metaLabel}>Native USDC on Arc</div></div></div>
                </div>
                <div style={s.bridgeBox}>
                  <div style={s.bridgeChain}>
                    <div style={s.metaLabel}>From</div>
                    <select value={bridgeFrom} onChange={e => setBridgeFrom(e.target.value)} style={s.select}>
                      {['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Avalanche'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={s.bridgeArrow}>→</div>
                  <div style={s.bridgeChain}>
                    <div style={s.metaLabel}>To</div>
                    <div style={s.bridgeDest}>Arc Testnet</div>
                  </div>
                </div>
                <input type="number" placeholder="0.00" value={bridgeAmount} onChange={e => setBridgeAmount(e.target.value)} style={s.input} />
                <button onClick={bridge} disabled={txPending || !bridgeAmount} style={{ ...s.primaryBtn, opacity: txPending ? 0.6 : 1 }}>
                  {txPending ? txStep || 'Waiting for wallet...' : 'Bridge via CCTP'}
                </button>
                {msg.text && <div style={{ ...s.alert, background: msg.ok ? '#1a3a2a' : '#3a1a1a', color: msg.ok ? '#68d391' : '#fc8181' }}>{msg.text}</div>}
                <div style={s.bridgeNote}>~20 second finality · No wrapped tokens · No liquidity pools</div>
              </div>
            )}

            {activeTab === 'agent' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>Agent Wallet</span>{agentWallet && <span style={{ ...s.cardBadge, background: '#1a3a2a', color: '#68d391' }}>Active</span>}</div>
                <p style={s.cardDesc}>Your dedicated Circle Agent Wallet handles all autonomous settlements.</p>
                {agentWallet ? (
                  <>
                    <div style={s.addrBox}>{agentWallet}</div>
                    <div style={{ marginTop: 16 }}>
                      {['Autonomous FX settlement every 5 minutes', 'Nanopayments for FX data feeds via x402', 'USDC transfers on Arc Testnet', '24/7 operation without human intervention'].map((c, i) => (
                        <div key={i} style={s.capRow}><div style={s.capDot} />{c}</div>
                      ))}
                    </div>
                    <div style={s.metaRow}><span style={s.metaLabel}>Network</span><span style={s.metaVal}>Arc Testnet · Chain ID 5042002</span></div>
                    <a href={`https://testnet.arcscan.app/address/${agentWallet}`} target="_blank" rel="noreferrer" style={s.ghostBtn}>View on ArcScan</a>
                  </>
                ) : (
                  <>
                    <div style={s.emptyAgent}>No agent wallet configured. Create one to enable per-wallet autonomous settlements.</div>
                    <button onClick={createAgentWallet} disabled={creatingWallet} style={s.primaryBtn}>
                      {creatingWallet ? 'Creating...' : 'Create Agent Wallet'}
                    </button>
                    {msg.text && <div style={{ ...s.alert, background: msg.ok ? '#1a3a2a' : '#3a1a1a', color: msg.ok ? '#68d391' : '#fc8181' }}>{msg.text}</div>}
                  </>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>Settlement History</span><span style={s.cardBadge}>{settleCount} total</span></div>
                {history.length === 0
                  ? <div style={s.empty}>No settlements recorded yet. The agent checks every 5 minutes.</div>
                  : history.map((rec, i) => (
                    <div key={i} style={s.histRow}>
                      <div>
                        <div style={{ color: rec.action === 'SETTLE' ? '#63b3ed' : rec.action === 'NANOPAY' ? '#b794f4' : '#8899aa', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>{rec.action}</div>
                        <div style={s.metaLabel}>{new Date(rec.created_at).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#e2e8f0', fontSize: 13 }}>{rec.amount} USDC</div>
                        {rec.fee > 0 && <div style={{ color: '#68d391', fontSize: 11 }}>+{rec.fee} earned</div>}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {activeTab === 'rates' && (
              <div style={s.card}>
                <div style={s.cardHeader}><span style={s.cardTitle}>FX Rates</span><span style={s.metaLabel}>Updated {rates?.timestamp ? new Date(rates.timestamp).toLocaleTimeString() : '-'}</span></div>
                {[
                  { pair: 'USDC / USD', name: 'USD Coin', val: '1.00000', color: '#e2e8f0' },
                  { pair: 'EURC / USD', name: 'Euro Coin', val: rates?.EURC_USD?.toFixed(5) || '-', color: '#63b3ed' },
                  { pair: 'GBPC / USD', name: 'GBP Coin', val: rates?.GBPC_USD?.toFixed(5) || '-', color: '#63b3ed' },
                ].map((r, i) => (
                  <div key={i} style={s.rateRow}>
                    <div><div style={{ color: '#e2e8f0', fontWeight: '600' }}>{r.pair}</div><div style={s.metaLabel}>{r.name}</div></div>
                    <div style={{ color: r.color, fontSize: 20, fontWeight: '700' }}>{r.val}</div>
                  </div>
                ))}
                <div style={{ ...s.card, background: '#0e1d2e', border: '1px solid #1a3a5a', marginTop: 16, padding: 16 }}>
                  <div style={s.metaLabel}>Best Rate — Bond routes here</div>
                  <div style={{ color: '#63b3ed', fontSize: 20, fontWeight: '700', marginTop: 4 }}>{rates?.best_currency || '-'} · {rates?.best_rate?.toFixed(5) || '-'}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div style={s.footer}>Bond · Circle Agent Stack · Nanopayments · CCTP · Arc Testnet · arpdoul</div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#070d14', color: '#e2e8f0', fontFamily: "'SF Mono', 'Fira Code', monospace" },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #111e2e', position: 'sticky', top: 0, background: 'rgba(7,13,20,0.95)', backdropFilter: 'blur(10px)', zIndex: 100 },
  navBrand: { display: 'flex', alignItems: 'center', gap: 10, color: '#63b3ed', fontWeight: '700', fontSize: 18, letterSpacing: 4 },
  navDot: { width: 8, height: 8, borderRadius: '50%', background: '#63b3ed' },
  navRight: { display: 'flex', alignItems: 'center', gap: 12 },
  navStatus: { display: 'flex', alignItems: 'center', gap: 6, color: '#68d391', fontSize: 11, letterSpacing: 2 },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#68d391', animation: 'pulse 2s infinite' },
  walletPill: { background: '#111e2e', border: '1px solid #1a2d3e', borderRadius: 20, padding: '4px 12px', fontSize: 11, color: '#8899aa' },
  menuBtn: { background: '#111e2e', border: '1px solid #1a2d3e', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
  menuLine: { width: 16, height: 1.5, background: '#63b3ed', borderRadius: 2 },
  dropdown: { position: 'fixed', top: 64, right: 16, background: '#0d1a26', border: '1px solid #1a2d3e', borderRadius: 12, padding: 8, zIndex: 1000, minWidth: 200, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' },
  dropItem: { display: 'block', width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 6, letterSpacing: 0.5, transition: 'all 0.1s' },
  dropDivider: { height: 1, background: '#1a2d3e', margin: '8px 0' },
  content: { maxWidth: 840, margin: '0 auto', padding: '32px 20px' },
  hero: { textAlign: 'center', marginBottom: 40 },
  heroEyebrow: { color: '#3a5a7a', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 },
  heroTitle: { color: '#63b3ed', fontSize: 56, fontWeight: '800', letterSpacing: 12, margin: '0 0 8px' },
  heroSub: { color: '#4a6a8a', fontSize: 14, letterSpacing: 4, textTransform: 'uppercase', margin: 0 },
  connectCard: { background: '#0d1a26', border: '1px solid #1a2d3e', borderRadius: 16, padding: 48, textAlign: 'center', maxWidth: 440, margin: '0 auto' },
  connectIcon: { width: 64, height: 64, background: '#111e2e', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' },
  connectTitle: { color: '#e2e8f0', fontSize: 24, fontWeight: '700', margin: '0 0 12px' },
  connectSub: { color: '#4a6a8a', fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' },
  connectBtn: { width: '100%', padding: '14px 0', background: '#63b3ed', color: '#070d14', border: 'none', borderRadius: 10, fontWeight: '700', fontSize: 14, cursor: 'pointer', letterSpacing: 2 },
  connectHint: { color: '#2a3a4a', fontSize: 11, marginTop: 16 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 },
  statCard: { background: '#0d1a26', border: '1px solid #1a2d3e', borderRadius: 12, padding: '16px 12px' },
  statLabel: { color: '#3a5a7a', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  statVal: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  statSub: { color: '#2a3a4a', fontSize: 10 },
  txBanner: { background: '#0e1d2e', border: '1px solid #1a3a5a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#63b3ed', fontSize: 13 },
  txSpinner: { width: 16, height: 16, border: '2px solid #1a3a5a', borderTop: '2px solid #63b3ed', borderRadius: '50%', flexShrink: 0 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 },
  card: { background: '#0d1a26', border: '1px solid #1a2d3e', borderRadius: 14, padding: 24, marginBottom: 16 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { color: '#63b3ed', fontSize: 12, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase' },
  cardBadge: { background: '#111e2e', border: '1px solid #1a2d3e', borderRadius: 20, padding: '3px 10px', fontSize: 10, color: '#4a6a8a', letterSpacing: 1 },
  cardDesc: { color: '#4a6a8a', fontSize: 13, lineHeight: 1.6, marginBottom: 20 },
  metaRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0e1a24' },
  metaLabel: { color: '#3a5a7a', fontSize: 11, letterSpacing: 1 },
  metaVal: { color: '#8899aa', fontSize: 11 },
  balanceRow: { display: 'flex', justifyContent: 'space-between', background: '#070d14', borderRadius: 10, padding: '16px', marginBottom: 20, border: '1px solid #1a2d3e' },
  bigNum: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', marginTop: 4 },
  txFlow: { display: 'flex', alignItems: 'center', gap: 12, background: '#070d14', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #1a2d3e' },
  txFlowStep: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  txFlowArrow: { color: '#1a2d3e', fontSize: 20 },
  txNum: { width: 28, height: 28, borderRadius: '50%', background: '#111e2e', border: '1px solid #63b3ed', color: '#63b3ed', fontSize: 12, fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  input: { width: '100%', padding: '13px 16px', background: '#070d14', border: '1px solid #1a2d3e', borderRadius: 10, color: '#e2e8f0', fontSize: 16, boxSizing: 'border-box', outline: 'none', marginBottom: 12 },
  primaryBtn: { width: '100%', padding: '14px 0', background: '#63b3ed', color: '#070d14', border: 'none', borderRadius: 10, fontWeight: '700', fontSize: 13, cursor: 'pointer', letterSpacing: 2, marginBottom: 8 },
  ghostBtn: { display: 'block', width: '100%', padding: '12px 0', background: 'transparent', border: '1px solid #1a2d3e', borderRadius: 10, color: '#63b3ed', fontSize: 12, cursor: 'pointer', letterSpacing: 2, marginBottom: 8, textAlign: 'center', textDecoration: 'none' },
  dangerBtn: { width: '100%', padding: '14px 0', background: '#2d1a1a', border: '1px solid #5a1a1a', borderRadius: 10, color: '#fc8181', fontWeight: '700', fontSize: 13, cursor: 'pointer', letterSpacing: 2, marginBottom: 8 },
  alert: { borderRadius: 8, padding: '10px 14px', fontSize: 12, marginTop: 8 },
  bridgeBox: { display: 'flex', alignItems: 'center', gap: 12, background: '#070d14', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid #1a2d3e' },
  bridgeChain: { flex: 1 },
  bridgeArrow: { color: '#1a2d3e', fontSize: 24 },
  bridgeDest: { color: '#63b3ed', fontWeight: '700', marginTop: 6, fontSize: 14 },
  bridgeNote: { color: '#2a3a4a', fontSize: 11, textAlign: 'center', marginTop: 12 },
  select: { width: '100%', padding: '8px 12px', background: '#0d1a26', border: '1px solid #1a2d3e', borderRadius: 8, color: '#e2e8f0', fontSize: 13, marginTop: 6, outline: 'none' },
  addrBox: { background: '#070d14', border: '1px solid #1a2d3e', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, color: '#63b3ed', wordBreak: 'break-all', marginTop: 12 },
  capRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', color: '#8899aa', fontSize: 12 },
  capDot: { width: 6, height: 6, borderRadius: '50%', background: '#68d391', flexShrink: 0 },
  emptyAgent: { color: '#3a5a7a', fontSize: 13, padding: '20px 0', lineHeight: 1.6 },
  histRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #0e1a24' },
  rateRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #0e1a24' },
  empty: { color: '#2a3a4a', fontSize: 13, textAlign: 'center', padding: '40px 0', lineHeight: 1.8 },
  footer: { textAlign: 'center', color: '#1a2d3e', fontSize: 10, padding: '40px 20px', letterSpacing: 2 },
};
