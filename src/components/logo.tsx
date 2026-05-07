import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="grid size-[38px] place-items-center rounded-[11px]"
        style={{
          background: "var(--grad-brand)",
          boxShadow:
            "0 8px 24px -8px rgba(127, 224, 102, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-[22px]" strokeWidth={2.4}>
          <path
            d="M3 16 L8 10 L12 14 L16 7 L21 12"
            stroke="var(--ink)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span
          className="text-[18px] font-bold tracking-[-0.02em]"
          style={{ color: "var(--ink)" }}
        >
          Token<span style={{ color: "var(--teal-600)" }}>Calc</span>
        </span>
      )}
    </div>
  );
}
