import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENTS = 50_000;
const MAX_SNAPSHOTS = 200;
const MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MB
// Token install_tokens are UUIDs — refuse anything else early to avoid wasted DB calls
// and reduce surface area for malformed values reaching SQL parameter binding.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IngestEvent {
  provider: string;
  model?: string | null;
  project?: string | null;
  session_id?: string | null;
  task_category?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  calls?: number;
  cost_usd?: number;
  occurred_at: string;
}

interface SnapshotEntry {
  provider: string;
  period: string;
  snapshot: Record<string, unknown>;
}

interface IngestPayload {
  hostname?: string;
  platform?: string;
  events: IngestEvent[];
  snapshot?: Record<string, unknown>; // legacy single-snapshot
  snapshots?: SnapshotEntry[]; // new multi-provider
  detected_providers?: { provider: string; cost: number }[];
  replace_machine?: boolean;
}

// Safely coerce a possibly-bigger-than-int32 numeric (token counts can exceed
// 2 billion). Avoid `| 0` which truncates to signed int32.
function nonNegInt(v: unknown): number {
  const n = Math.floor(Number(v ?? 0));
  if (!Number.isFinite(n) || n < 0) return 0;
  // bigint column accepts up to 2^63; clamp at 2^53 (JS safe int) to be safe.
  return Math.min(n, Number.MAX_SAFE_INTEGER);
}

function nonNegFloat(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Missing or malformed bearer token" }, { status: 401 });
  }

  // Cheap body-size guard before parse (Next/Edge may not enforce per-route).
  const lenHeader = Number(req.headers.get("content-length") || 0);
  if (lenHeader > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: IngestPayload;
  try {
    body = (await req.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "Missing events[]" }, { status: 400 });
  }
  if (body.events.length > MAX_EVENTS) {
    return NextResponse.json(
      { error: `Too many events (max ${MAX_EVENTS})` },
      { status: 413 },
    );
  }
  if (body.snapshots && body.snapshots.length > MAX_SNAPSHOTS) {
    return NextResponse.json(
      { error: `Too many snapshots (max ${MAX_SNAPSHOTS})` },
      { status: 413 },
    );
  }

  const admin = createServiceClient();

  const { data: machine, error: mErr } = await admin
    .from("machines")
    .select("id, user_id")
    .eq("install_token", token)
    .maybeSingle();

  if (mErr || !machine) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (body.hostname && typeof body.hostname === "string") {
    updates.hostname = body.hostname.slice(0, 200);
  }
  if (body.platform && typeof body.platform === "string") {
    updates.platform = body.platform.slice(0, 50);
  }
  await admin.from("machines").update(updates).eq("id", machine.id);

  // Wipe this machine's events + snapshots so each sync is a clean rebuild from codeburn.
  if (body.replace_machine) {
    await admin.from("usage_events").delete().eq("machine_id", machine.id);
    await admin.from("agent_snapshots").delete().eq("machine_id", machine.id);
  }

  let inserted = 0;
  if (body.events.length > 0) {
    const rows = body.events.map((e) => {
      const occurred = e.occurred_at ? new Date(e.occurred_at) : null;
      if (!occurred || isNaN(occurred.getTime())) {
        throw new Error("Invalid occurred_at");
      }
      return {
        user_id: machine.user_id,
        machine_id: machine.id,
        provider: String(e.provider || "unknown").slice(0, 40),
        model: (e.model ?? "").toString().slice(0, 100),
        project: e.project ? String(e.project).slice(0, 500) : null,
        session_id: (e.session_id ?? "").toString().slice(0, 200),
        task_category: e.task_category ? String(e.task_category).slice(0, 50) : null,
        input_tokens: nonNegInt(e.input_tokens),
        output_tokens: nonNegInt(e.output_tokens),
        cache_read_tokens: nonNegInt(e.cache_read_tokens),
        cache_write_tokens: nonNegInt(e.cache_write_tokens),
        calls: nonNegInt(e.calls),
        cost_usd: nonNegFloat(e.cost_usd),
        occurred_at: occurred.toISOString(),
      };
    });

    let lastErr: { message: string } | null = null;
    try {
      const { error, count } = await admin
        .from("usage_events")
        .upsert(rows, {
          onConflict: "machine_id,session_id,occurred_at,model",
          ignoreDuplicates: false,
          count: "exact",
        });
      if (error) lastErr = error;
      else inserted = count ?? rows.length;
    } catch (err) {
      lastErr = { message: err instanceof Error ? err.message : String(err) };
    }
    if (lastErr) {
      return NextResponse.json({ error: lastErr.message }, { status: 500 });
    }
  }

  // Persist snapshots — array form (new) or single-blob form (legacy).
  const snapshotRows: {
    user_id: string;
    machine_id: string;
    provider: string;
    period: string;
    snapshot: unknown;
  }[] = [];

  if (Array.isArray(body.snapshots)) {
    for (const s of body.snapshots) {
      if (!s || typeof s !== "object" || !s.snapshot) continue;
      snapshotRows.push({
        user_id: machine.user_id,
        machine_id: machine.id,
        provider: String(s.provider || "all").slice(0, 40),
        period: String(s.period || "all").slice(0, 20),
        snapshot: s.snapshot,
      });
    }
  } else if (body.snapshot && typeof body.snapshot === "object") {
    snapshotRows.push({
      user_id: machine.user_id,
      machine_id: machine.id,
      provider: "all",
      period: String((body.snapshot as { period?: unknown }).period ?? "all").slice(0, 20),
      snapshot: body.snapshot,
    });
  }

  if (snapshotRows.length > 0) {
    const { error: snapErr } = await admin
      .from("agent_snapshots")
      .upsert(snapshotRows, {
        onConflict: "machine_id,provider,period",
        ignoreDuplicates: false,
      });
    if (snapErr) {
      return NextResponse.json(
        { error: `snapshots: ${snapErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    snapshots: snapshotRows.length,
    detected: body.detected_providers?.length ?? 0,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "tokencalc-ingest" });
}
