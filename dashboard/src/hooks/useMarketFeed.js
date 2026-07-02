import { useEffect, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export function useMarketFeed() {
  const [depthBySymbol, setDepthBySymbol] = useState({});
  const [trades, setTrades] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'depth') {
        setDepthBySymbol((prev) => ({ ...prev, [msg.symbol]: msg.data }));
      } else if (msg.type === 'trade') {
        setTrades((prev) => [msg.data, ...prev].slice(0, 50));
      }
    };

    return () => ws.close();
  }, []);

  return { depthBySymbol, trades, connected };
}
