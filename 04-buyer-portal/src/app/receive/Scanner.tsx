'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';

interface DetectorLike { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: { new (opts?: { formats?: string[] }): DetectorLike } }
}

const REGION_ID = 'qr-fallback-region';

/**
 * Webcam QR scan of the crate label. Uses the browser's BarcodeDetector where it exists; otherwise html5-qrcode (loaded only then).
 * It reports every decoded text to onText; the caller decides whether that text is a valid SSCC. Nothing is uploaded: decoding is local.
 */
export function Scanner({ onText, onClose }: { onText: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [engine, setEngine] = useState<'native' | 'fallback'>(typeof window !== 'undefined' && window.BarcodeDetector ? 'native' : 'fallback');
  const [message, setMessage] = useState('');
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let fallback: { stop(): Promise<void>; clear(): void } | undefined;

    const fail = (e: unknown) => {
      if (stopped) return;
      const name = e instanceof DOMException ? e.name : '';
      setMessage(name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or type the SSCC below.'
        : name === 'NotFoundError' ? 'No camera was found on this device. Type the SSCC from the label below.'
        : 'The camera could not start. Type the SSCC from the label below.');
      setStatus('error');
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { fail(null); return; }
      try {
        if (window.BarcodeDetector) {
          setEngine('native');
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
          const el = video.current!;
          el.srcObject = stream;
          await el.play();
          setStatus('scanning');
          let busy = false;
          timer = setInterval(async () => {
            if (busy || stopped) return;
            busy = true;
            try { const found = await detector.detect(el); if (found[0]?.rawValue) cb.current(found[0].rawValue); } catch { /* a frame that cannot be decoded is skipped */ } finally { busy = false; }
          }, 350);
        } else {
          setEngine('fallback');
          const { Html5Qrcode } = await import('html5-qrcode');
          if (stopped) return;
          const scanner = new Html5Qrcode(REGION_ID);
          fallback = scanner;
          await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => cb.current(text), () => {});
          setStatus(stopped ? 'starting' : 'scanning');
        }
      } catch (e) { fail(e); }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (fallback) void fallback.stop().then(() => fallback?.clear()).catch(() => {});
    };
  }, []);

  return (
    <div className="card p-3" data-testid="scanner" data-engine={engine} data-status={status}>
      <div className="relative overflow-hidden rounded-sm bg-black" style={{ minHeight: engine === 'native' ? 220 : 0 }}>
        {engine === 'native' ? <video ref={video} muted playsInline className="block max-h-72 w-full object-cover" aria-label="Camera preview" /> : <div id={REGION_ID} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2" role="status">
          {status === 'starting' && 'Starting the camera…'}
          {status === 'scanning' && 'Point the camera at the QR on the crate label.'}
          {status === 'error' && <span className="text-danger" role="alert">{message}</span>}
        </p>
        <button type="button" className="btn !min-h-8" onClick={onClose}><CameraOff className="h-4 w-4" aria-hidden />Stop camera</button>
      </div>
    </div>
  );
}

export function ScanButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="btn" data-variant="primary" onClick={onClick} data-testid="start-scan"><Camera className="h-4 w-4" aria-hidden />Scan the crate label</button>;
}
