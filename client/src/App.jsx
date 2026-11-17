import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState('Checking API...');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => setHealth(`${data.status} — ${data.message}`))
      .catch(() => setHealth('Offline (Cannot reach API)'));
  }, [apiUrl]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>Project V — Local Stack</h1>
      <p><strong>Backend API ({apiUrl}):</strong> {health}</p>
    </div>
  );
}
