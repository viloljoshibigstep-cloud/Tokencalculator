import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex size-8 items-center justify-center rounded-lg gradient-bg glow-cyan">
        <svg viewBox="0 0 24 24" fill="none" className="size-5 text-black" strokeWidth={2.5}>
          <path
            d="M3 12L7 8L11 12L15 8L21 14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 17L7 13L11 17L15 13L21 19"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5}
          />
        </svg>
      </div>
      {showText && (
        <span className="text-base font-semibold tracking-tight text-white">
          Token<span className="gradient-text">Calc</span>
        </span>
      )}
    </div>
  );
}
