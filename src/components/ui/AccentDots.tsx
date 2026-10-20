import { cn } from '@/lib/utils';

/**
 * A deliberately tiny decorative pair. It echoes the pink square and butter
 * dot on the atlas feature card without introducing a new visual system.
 */
export function AccentDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none inline-flex shrink-0 items-center gap-1', className)}
    >
      <span className="accent-dot accent-dot--pink h-1 w-1 rounded-[2px] bg-pink" />
      <span className="accent-dot accent-dot--butter h-[3px] w-[3px] rounded-full bg-butter" />
    </span>
  );
}
