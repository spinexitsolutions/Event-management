import { ExternalLink, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { DEVICE_WIDTH, DeviceSwitcher, type Device } from './bits';

/**
 * Scaled live-preview iframe with a device switcher. The iframe is rendered at the real device width
 * and scaled down to fit the available space, so layouts match what visitors see.
 */
export function PreviewPane({ src, frameRef, onLoad, title, toolbar, className, label = 'Live preview' }: { src: string; frameRef: RefObject<HTMLIFrameElement>; onLoad: () => void; title: string; toolbar?: ReactNode; className?: string; label?: ReactNode }) {
  const [device, setDevice] = useState<Device>('desktop');
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = DEVICE_WIDTH[device];
  const pad = device === 'desktop' ? 0 : 24;
  const scale = size.w > pad * 2 + 40 ? Math.min(1, (size.w - pad * 2) / target) : 1;
  const frameH = Math.max(200, (Math.max(0, size.h) - (device === 'desktop' ? 0 : 24)) / scale);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-adm-line bg-white px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-adm-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          {label}
        </span>
        <span className="hidden text-[11px] text-adm-muted/80 xl:inline">
          {target}px · {Math.round(scale * 100)}%
        </span>
        <div className="flex-1" />
        {toolbar}
        <DeviceSwitcher value={device} onChange={setDevice} />
        <button type="button" className="adm-btn-ghost p-1.5" onClick={() => setNonce((n) => n + 1)} title="Reload preview" aria-label="Reload preview">
          <RotateCw className="h-4 w-4" />
        </button>
        <a href={src} target="_blank" rel="noopener" className="adm-btn-ghost p-1.5" title="Open preview in a new tab" aria-label="Open preview in a new tab">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div ref={box} className={cn('relative min-h-0 flex-1 overflow-hidden', device === 'desktop' ? 'bg-white' : 'bg-[#E9E5DD]')}>
        <div
          className={cn('absolute top-0 origin-top-left overflow-hidden bg-white', device !== 'desktop' && 'mt-3 rounded-[18px] shadow-2xl ring-1 ring-black/10')}
          style={{ width: target, height: frameH, transform: `scale(${scale})`, left: Math.max(0, (size.w - target * scale) / 2) }}
        >
          <iframe key={nonce} ref={frameRef} src={src} title={title} onLoad={onLoad} className="h-full w-full border-0" />
        </div>
      </div>
    </div>
  );
}
