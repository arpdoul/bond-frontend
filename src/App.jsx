import { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const statusColor = (s) => s === 'running' ? '#00ff88' : '#ff4444';

export default function App() {
  const [status, setStatus] = useState(null);
  const [rates, setRates] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    try {
      const [s, r, h] = await Promise.all([
        axios.get(`${API}/api/status`),
        axios.get(`${API}/api/rates`),
        axios.get(`${API}/api/history`),
      ]);
      setStatus(s.data);
      setRates(r.data);
      setHistory(h.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleAgent = async () => {
    if (!status) return;
    setLoading(true);
    const action = status.agent === 'running' ? 'stop' : 'start';
    await axios.post(`${API}/api/status/${action}`);
    await fetchAll();
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>BOND</div>
        <div style={styles.subtitle}>Autonomous FX Settlement Agent</div>
        <div style={styles.powered}>Circle Agent Stack · Arc Testnet · Chain ID: 5042002</div>
      </div>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>AGENT STATUS</div>
          <div style={{ color: statusColor(status?.agent), fontSize: 22, fontWeight: 'bold' }}>
            {status?.agent?.toUpperCase() || '-'}
          </div>
          <div style={styles.small}>Chain: {status?.chain || '-'}</div>
          <div style={styles.small}>Chain ID: {status?.chainId || '5042002'}</div>
          <div style={styles.small}>Uptime: {status ? Math.floor(status.uptime) + 's' : '-'}</div>
          <button onClick={toggleAgent} disabled={loading} style={{
            ...styles.btn,
            background: status?.agent === 'running' ? '#ff4444' : '#00ff88',
            color: '#000', marginTop: 12,
          }}>
            {loading ? '...' : status?.agent === 'running' ? 'STOP AGENT' : 'START AGENT'}
          </button>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>AGENT WALLET</div>
          <div style={styles.mono}>{status?.wallet?.slice(0,8)}...{status?.wallet?.slice(-6)}</div>
          <div style={{ color: '#00ff88', fontSize: 20, marginTop: 8 }}>{status?.balance || 'Loading...'}</div>
          <div style={styles.small}>USDC · Arc Testnet</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>FX RATES</div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={styles.small}>USDC/USD</span>
            <span style={{ color:'#e2e8f0', fontWeight:'bold' }}>{rates?.USDC_USD || '-'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={styles.small}>EURC/USD</span>
            <span style={{ color:'#e2e8f0', fontWeight:'bold' }}>{rates?.EURC_USD?.toFixed(5) || '-'}</span>
          </div>
          <div style={{ ...styles.small, marginTop:8 }}>
            Updated: {rates?.timestamp ? new Date(rates.timestamp).toLocaleTimeString() : '-'}
          </div>
        </div>
      </div>
      <div style={styles.historySection}>
        <div style={styles.sectionTitle}>SETTLEMENT LOG</div>
        {history.length === 0 ? (
          <div style={styles.empty}>No settlements yet. Agent is watching FX rates...</div>
        ) : history.map((rec) => (
          <div key={rec.id} style={styles.logRow}>
            <div style={styles.logTime}>{new Date(rec.timestamp).toLocaleTimeString()}</div>
            <div style={{ ...styles.logAction, color: rec.action === 'SETTLE' ? '#00ff88' : '#888' }}>{rec.action}</div>
            <div style={styles.logResult}>{rec.result}</div>
          </div>
        ))}
      </div>
      <div style={styles.footer}>BOND · Circle Agent Stack · Arc Testnet (Chain ID: 5042002) · arpdoul</div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 900, margin: '0 auto', padding: '32px 16px' },
  header: { textAlign: 'center', marginBottom: 40 },
  logo: { fontSize: 48, letterSpacing: 8, color: '#00ff88', fontWeight: 'bold' },
  subtitle: { color: '#888', marginTop: 8, fontSize: 14, letterSpacing: 4, textTransform: 'uppercase' },
  powered: { color: '#444', marginTop: 4, fontSize: 11 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 },
  card: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24 },
  cardTitle: { color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' },
  mono: { fontFamily: 'monospace', fontSize: 13, color: '#888' },
  small: { fontSize: 12, color: '#666', marginTop: 4 },
  btn: { width: '100%', padding: '10px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', letterSpacing: 2, fontSize: 12 },
  historySection: { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 12, padding: 24 },
  sectionTitle: { color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 20, textTransform: 'uppercase' },
  logRow: { display: 'grid', gridTemplateColumns: '80px 80px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #111', fontSize: 12 },
  logTime: { color: '#666' },
  logAction: { fontWeight: 'bold', letterSpacing: 2 },
  logResult: { color: '#aaa' },
  empty: { color: '#444', fontSize: 13, textAlign: 'center', padding: '40px 0' },
  footer: { textAlign: 'center', color: '#333', fontSize: 11, marginTop: 40, letterSpacing: 2 },
};
