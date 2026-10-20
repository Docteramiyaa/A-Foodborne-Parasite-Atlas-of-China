export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/parasite-mark.png"
      width={size}
      height={size}
      alt="食源虫谱标识：像素寄生虫"
      className={['shrink-0 select-none object-contain', className].filter(Boolean).join(' ')}
      draggable={false}
      decoding="async"
    />
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={className}>
      <span className="font-serif text-[20px] font-semibold tracking-[0.12em] text-blue-800">食源虫谱</span>
      {!compact && (
        <span className="mt-0.5 block font-sans text-[10px] tracking-[0.16em] text-ink-muted">
          FOODBORNE PARASITE ATLAS
        </span>
      )}
    </span>
  );
}
