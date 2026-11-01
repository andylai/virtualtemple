import type { ReactNode } from 'react';

/** A full-screen card shown over the 3D scene (loading, entering, errors). */
export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="overlay">
      <div className="overlay-card">{children}</div>
    </div>
  );
}
