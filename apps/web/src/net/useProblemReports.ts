import { useEffect } from 'react';
import type { HallStatus } from './hallState';
import { reportProblem } from './reportProblem';

/** Tells the server when the connection has given up or the 3D picture was lost, once per page load. */
export function useProblemReports(status: HallStatus, pictureLost: boolean): void {
  useEffect(() => {
    if (status === 'disconnected') {
      reportProblem('connection_failed');
    }
  }, [status]);
  useEffect(() => {
    if (pictureLost) {
      reportProblem('picture_lost');
    }
  }, [pictureLost]);
}
