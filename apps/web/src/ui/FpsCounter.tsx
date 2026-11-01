import { useEffect, useState } from 'react';

/** How long frames are counted before the number on screen is refreshed. */
const SAMPLE_MS = 500;
const MS_PER_SECOND = 1000;

/** Developer overlay showing the measured frame rate. Shown only with `?debug=1`. */
export function FpsCounter({ detail }: { detail: string }) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      frames += 1;
      if (now - windowStart >= SAMPLE_MS) {
        setFps(Math.round((frames * MS_PER_SECOND) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <div className="fps-counter" role="status">
      {fps} fps · {detail}
    </div>
  );
}
