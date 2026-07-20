import { useState, useCallback, useRef, useEffect } from 'react';

export interface ExtractionProgress {
  jobId?: string;
  id?: string;
  type?: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  currentItem: string;
  error?: string;
  result?: string;
}

export function useAnalytics() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [forecast, setForecast] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [forecasting, setForecasting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<ExtractionProgress | null>(null);
  const [forecastProgress, setForecastProgress] = useState<ExtractionProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const loadMetrics = useCallback(async (daysBack: number) => {
    try {
      const res = await fetch(`/api/metrics?days=${daysBack}`);
      const data = await res.json();
      setMetrics(data.metrics || []);
    } catch { /* ignore */ }
  }, []);

  const startExtraction = useCallback(async (daysBack: number) => {
    setExtracting(true);
    setExtractProgress(null);
    try {
      const res = await fetch('/api/metrics/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.jobId) {
        // Poll progress
        pollRef.current = setInterval(async () => {
          try {
            const sRes = await fetch(`/api/metrics/extract/status?jobId=${data.jobId}`);
            const sData = await sRes.json();
            const job = sData.job;
            if (job) {
              setExtractProgress(job);
              if (job.status === 'done' || job.status === 'error') {
                clearInterval(pollRef.current);
                setExtracting(false);
                if (job.status === 'done') await loadMetrics(daysBack);
              }
            }
          } catch { /* poll error */ }
        }, 500);
      }
    } catch (err: any) {
      setExtracting(false);
      throw err;
    }
  }, [loadMetrics]);

  const startForecast = useCallback(async (daysBack: number) => {
    setForecasting(true);
    setForecastProgress(null);
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.jobId) {
        pollRef.current = setInterval(async () => {
          try {
            const sRes = await fetch(`/api/metrics/extract/status?jobId=${data.jobId}`);
            const sData = await sRes.json();
            const job = sData.job;
            if (job) {
              setForecastProgress(job);
              if (job.status === 'done') {
                clearInterval(pollRef.current);
                setForecasting(false);
                setForecast(job.result || job.currentItem);
              }
              if (job.status === 'error') {
                clearInterval(pollRef.current);
                setForecasting(false);
              }
            }
          } catch { /* poll */ }
        }, 500);
      }
    } catch (err: any) {
      setForecasting(false);
      throw err;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return {
    metrics, forecast, extracting, forecasting, extractProgress, forecastProgress,
    loadMetrics, startExtraction, startForecast, setForecast,
  };
}
