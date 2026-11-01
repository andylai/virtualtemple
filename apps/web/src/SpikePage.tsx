import { useEffect, useRef, useState } from 'react';

type Status = 'connecting' | 'in the hall' | 'hall full' | 'disconnected';

interface ServerMessage {
  type: string;
  count?: number;
  code?: string;
}

/** Reads `?hall=N` from the page URL; the real app will use the assignment flow (spec 5.5). */
function hallFromUrl(): string {
  return new URLSearchParams(window.location.search).get('hall') ?? '1';
}

/**
 * Throwaway page for milestone M0 spike S1: open it in two tabs and watch the people count and
 * the "hello" messages travel through the Worker to the hall and back.
 */
export function SpikePage() {
  const [status, setStatus] = useState<Status>('connecting');
  const [people, setPeople] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${window.location.host}/ws?hall=${hallFromUrl()}`);
    socketRef.current = socket;
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'population') {
        setStatus('in the hall');
        setPeople(message.count ?? 0);
      } else if (message.type === 'error' && message.code === 'hall_full') {
        setStatus('hall full');
      } else if (message.type === 'hello') {
        setLog((lines) => [...lines, 'Someone said hello']);
      }
    });
    socket.addEventListener('close', () => {
      setStatus((current) => (current === 'hall full' ? current : 'disconnected'));
    });
    return () => socket.close();
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 16, maxWidth: 480 }}>
      <h1>Virtual Temple — spike S1</h1>
      <p>
        Hall {hallFromUrl()}: <strong>{status}</strong>
      </p>
      <p>{people} people here</p>
      <button type="button" onClick={() => socketRef.current?.send('hello')}>
        Say hello
      </button>
      <ul>
        {log.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
