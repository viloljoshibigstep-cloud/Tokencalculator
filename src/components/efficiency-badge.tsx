import { BAND_LABELS, BAND_STYLES, type EfficiencyBand } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface Props {
  band: EfficiencyBand;
  ratio: number | null;
  size?: "sm" | "md";
}

export function EfficiencyBadge({ band, ratio, size = "md" }: Props) {
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        BAND_STYLES[band],
        padding,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {BAND_LABELS[band]}
      {ratio != null && (
        <span className="text-current/70 ml-0.5">· {Math.round(ratio * 100)}%</span>
      )}
    </span>
  );
}
