// Codeburn provider keys → display names. Used by /tools and /team/[id] so
// both pages render the same labels and can join with agent_snapshots.provider.
export const SUPPORTED_TOOLS: { key: string; label: string; vendor: string }[] = [
  { key: "claude", label: "Claude Code", vendor: "Anthropic" },
  { key: "claude-desktop", label: "Claude Desktop", vendor: "Anthropic" },
  { key: "codex", label: "Codex", vendor: "OpenAI" },
  { key: "cursor", label: "Cursor", vendor: "Anysphere" },
  { key: "cursor-agent", label: "Cursor Agent", vendor: "Anysphere" },
  { key: "gemini", label: "Gemini CLI", vendor: "Google" },
  { key: "copilot", label: "GitHub Copilot", vendor: "GitHub" },
  { key: "antigravity", label: "Antigravity", vendor: "Google" },
  { key: "kiro", label: "Kiro", vendor: "AWS" },
  { key: "opencode", label: "OpenCode", vendor: "Open source" },
  { key: "openclaw", label: "OpenClaw", vendor: "Open source" },
  { key: "pi", label: "Pi", vendor: "Inflection" },
  { key: "omp", label: "Oh My Pi", vendor: "Open source" },
  { key: "droid", label: "Droid", vendor: "Factory" },
  { key: "roo", label: "Roo Code", vendor: "VS Code" },
  { key: "kilocode", label: "KiloCode", vendor: "VS Code" },
  { key: "qwen", label: "Qwen", vendor: "Alibaba" },
  { key: "goose", label: "Goose", vendor: "Block" },
];

export function toolLabel(providerKey: string): { label: string; vendor: string } {
  const t = SUPPORTED_TOOLS.find((x) => x.key === providerKey);
  return t ? { label: t.label, vendor: t.vendor } : { label: providerKey, vendor: "—" };
}
