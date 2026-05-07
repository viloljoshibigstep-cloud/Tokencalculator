#!/usr/bin/env node
/**
 * TokenCalc agent — wraps codeburn and forwards usage to the ingest API.
 * Runs entirely on the user's machine. Sends only token counts, model name,
 * project paths and timestamps. Never sends prompt or code content.
 *
 * Multi-provider: probes each known IDE/CLI for data, then runs codeburn
 * per-provider so each tool's spend can be attributed correctly in the
 * dashboard's /tools page.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync, execFileSync } = require("child_process");

// Bound concurrent codeburn calls. Each call spawns a node process that
// reads the local sqlite cache; 8 in flight is plenty without thrashing.
const CODEBURN_CONCURRENCY = 8;
// Hard ceiling per call. codeburn usually returns in <5s; if it hangs
// (corrupt cache, frozen IDE log) we'd rather skip than block the sync.
const CODEBURN_TIMEOUT_MS = 30000;

const HOME = os.homedir();
const CFG_DIR = path.join(HOME, ".tokencalc");
const CFG_PATH = path.join(CFG_DIR, "config.json");
const STATE_PATH = path.join(CFG_DIR, "state.json");
const LOG_PATH = path.join(CFG_DIR, "agent.log");

// Codeburn supports 18 providers. Keep this list in sync with codeburn's
// `--provider` flag values (see https://github.com/getagentseal/codeburn).
const KNOWN_PROVIDERS = [
  "claude",
  "claude-desktop",
  "codex",
  "cursor",
  "cursor-agent",
  "gemini",
  "copilot",
  "kiro",
  "opencode",
  "openclaw",
  "pi",
  "omp",
  "droid",
  "roo",
  "kilocode",
  "qwen",
  "goose",
  "antigravity",
];

// Periods we cache snapshots for. Frontend selects based on date range.
// Names must match codeburn's `-p` accepted values exactly.
const PERIODS = ["today", "week", "30days", "all"];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.mkdirSync(CFG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
  process.stderr.write(line);
}

function readConfig() {
  if (!fs.existsSync(CFG_PATH)) {
    throw new Error(`Config not found at ${CFG_PATH}. Run install first.`);
  }
  return JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { lastSyncedAt: null };
  }
}

function writeState(s) {
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// Discover absolute path to codeburn at install time. launchd/cron contexts
// don't load nvm/homebrew/asdf PATH, so we capture it here and persist.
function findCodeburn() {
  const augmentedPath = [
    process.env.PATH || "",
    `${HOME}/.nvm/versions/node/*/bin`,
    `${HOME}/.volta/bin`,
    `${HOME}/.asdf/shims`,
    `${HOME}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");

  // Try `command -v codeburn` with augmented PATH
  const w = spawnSync("/bin/sh", ["-lc", "command -v codeburn"], {
    encoding: "utf8",
    env: { ...process.env, PATH: augmentedPath },
  });
  if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();

  // Glob nvm versions for the binary
  const nvmDir = path.join(HOME, ".nvm", "versions", "node");
  if (fs.existsSync(nvmDir)) {
    for (const v of fs.readdirSync(nvmDir).sort().reverse()) {
      const p = path.join(nvmDir, v, "bin", "codeburn");
      if (fs.existsSync(p)) return p;
    }
  }

  // Common system locations
  for (const p of ["/usr/local/bin/codeburn", "/opt/homebrew/bin/codeburn"]) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function runCodeburn(cfg, args, { timeoutMs = CODEBURN_TIMEOUT_MS } = {}) {
  const bin = cfg.codeburnPath || findCodeburn();
  if (!bin) {
    return Promise.reject(
      new Error("codeburn binary not found. Install with: npm install -g codeburn"),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const MAX_BUF = 64 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let stdoutSize = 0;
    let stderrSize = 0;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(new Error(`codeburn ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_BUF) {
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch {}
        clearTimeout(timer);
        reject(new Error(`codeburn ${args.join(" ")} stdout exceeded ${MAX_BUF} bytes`));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderrSize += chunk.length;
      if (stderrSize <= MAX_BUF) stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!killed) reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code !== 0) {
        reject(
          new Error(
            `codeburn ${args.join(" ")} failed (${code}): ${
              (stderr || stdout || "").slice(0, 500) || "no output"
            }`,
          ),
        );
        return;
      }
      if (!stdout) {
        reject(new Error(`codeburn ${args.join(" ")} produced no output`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`codeburn ${args.join(" ")} JSON parse failed: ${err.message}`));
      }
    });
  });
}

function fetchProviderReport(cfg, provider, period) {
  return runCodeburn(cfg, [
    "report",
    "--format",
    "json",
    "--provider",
    provider,
    "-p",
    period,
  ]);
}

function fetchAggregateReport(cfg, period) {
  // No --provider flag = all providers aggregated.
  return runCodeburn(cfg, ["report", "--format", "json", "-p", period]);
}

// Run async `fn(item)` over `items` with at most `limit` in flight.
// Returns a settled-style array: [{ ok, value }] / [{ ok: false, error }].
async function pooled(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// Probe each provider; return only those with cost > 0 in any period.
async function detectProviders(cfg) {
  const settled = await pooled(KNOWN_PROVIDERS, CODEBURN_CONCURRENCY, (p) =>
    fetchProviderReport(cfg, p, "all"),
  );
  const detected = [];
  settled.forEach((res, i) => {
    if (!res.ok) return; // unsupported provider or no data — skip silently
    const cost = Number(res.value?.overview?.cost ?? 0);
    if (cost > 0) {
      const provider = KNOWN_PROVIDERS[i];
      detected.push({ provider, cost });
      log(`Detected ${provider}: $${cost.toFixed(2)}`);
    }
  });
  return detected;
}

function dayMidnightISO(yyyyMMdd) {
  return new Date(`${yyyyMMdd}T12:00:00.000Z`).toISOString();
}

/**
 * Convert a per-provider all-period codeburn report into per-day events.
 * Cost and calls are exact (codeburn gives them per-day). Tokens are
 * distributed proportionally to each day's cost share — best we can do
 * since codeburn's daily array doesn't expose tokens.
 */
function flattenEvents(report, provider) {
  const daily = Array.isArray(report.daily) ? report.daily : [];
  const totalCost = daily.reduce((s, d) => s + Number(d.cost || 0), 0);
  const overview = report.overview || {};
  const totalTokens = overview.tokens || {};
  const tIn = Number(totalTokens.input || 0);
  const tOut = Number(totalTokens.output || 0);
  const tCacheR = Number(totalTokens.cacheRead || 0);
  const tCacheW = Number(totalTokens.cacheWrite || 0);

  const events = [];
  let usedIn = 0, usedOut = 0, usedCacheR = 0, usedCacheW = 0;

  daily.forEach((d, i) => {
    if (!d.date) return;
    const cost = Number(d.cost || 0);
    const calls = Number(d.calls || 0);
    const share = totalCost > 0 ? cost / totalCost : 0;

    let inT, outT, cacheRT, cacheWT;
    if (i === daily.length - 1) {
      // Last day absorbs any rounding remainder so totals match exactly.
      inT = tIn - usedIn;
      outT = tOut - usedOut;
      cacheRT = tCacheR - usedCacheR;
      cacheWT = tCacheW - usedCacheW;
    } else {
      inT = Math.round(tIn * share);
      outT = Math.round(tOut * share);
      cacheRT = Math.round(tCacheR * share);
      cacheWT = Math.round(tCacheW * share);
      usedIn += inT;
      usedOut += outT;
      usedCacheR += cacheRT;
      usedCacheW += cacheWT;
    }

    events.push({
      provider,
      model: "",
      project: null,
      session_id: `${provider}-daily-${d.date}`,
      task_category: null,
      input_tokens: Math.max(0, inT),
      output_tokens: Math.max(0, outT),
      cache_read_tokens: Math.max(0, cacheRT),
      cache_write_tokens: Math.max(0, cacheWT),
      calls,
      cost_usd: cost,
      occurred_at: dayMidnightISO(d.date),
    });
  });

  return events;
}

function compactSnapshot(report, provider, period) {
  return {
    provider,
    period,
    snapshot: {
      generated: report.generated || new Date().toISOString(),
      period: report.periodKey || period,
      overview: report.overview || null,
      daily: report.daily || [],
      projects: report.projects || [],
      models: report.models || [],
      activities: report.activities || [],
      tools: report.tools || [],
      topSessions: report.topSessions || [],
    },
  };
}

async function postIngest(server, token, payload) {
  const url = server.replace(/\/$/, "") + "/api/ingest";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ingest failed: ${res.status} ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function runOnce() {
  const cfg = readConfig();
  log(`Running sync (codeburnPath=${cfg.codeburnPath || "auto"})`);

  // 1. Detect which providers have data (one report call per known provider).
  const detected = await detectProviders(cfg);
  if (detected.length === 0) {
    log("No providers with usage data found. Are any AI coding tools installed?");
    // Still report in to /api/ingest so the dashboard knows the agent is alive.
    await postIngest(cfg.server, cfg.token, {
      hostname: os.hostname(),
      platform: process.platform,
      events: [],
      snapshots: [],
      detected_providers: [],
      replace_machine: true,
    });
    writeState({ lastSyncedAt: new Date().toISOString() });
    return;
  }

  // 2. For each detected provider, fetch reports for each cached period and build
  //    per-day events from the all-time report (richest day-level coverage).
  const events = [];
  const snapshots = [];

  const providerTasks = [];
  for (const { provider } of detected) {
    for (const period of PERIODS) {
      providerTasks.push({ provider, period });
    }
  }
  const providerResults = await pooled(
    providerTasks,
    CODEBURN_CONCURRENCY,
    ({ provider, period }) => fetchProviderReport(cfg, provider, period),
  );
  providerResults.forEach((res, i) => {
    const { provider, period } = providerTasks[i];
    if (!res.ok) {
      log(`Skip ${provider}/${period}: ${res.error.message}`);
      return;
    }
    snapshots.push(compactSnapshot(res.value, provider, period));
    if (period === "all") {
      events.push(...flattenEvents(res.value, provider));
    }
  });

  // 3. Also store an aggregate ("all providers") snapshot per period so the
  //    overview page can show whole-team totals without re-summing per-provider.
  const aggregateResults = await pooled(PERIODS, CODEBURN_CONCURRENCY, (period) =>
    fetchAggregateReport(cfg, period),
  );
  aggregateResults.forEach((res, i) => {
    const period = PERIODS[i];
    if (!res.ok) {
      log(`Skip aggregate/${period}: ${res.error.message}`);
      return;
    }
    const report = res.value;
    snapshots.push({
      provider: "all",
      period,
      snapshot: {
        generated: report.generated || new Date().toISOString(),
        period: report.periodKey || period,
        overview: report.overview || null,
        daily: report.daily || [],
        projects: report.projects || [],
        models: report.models || [],
        activities: report.activities || [],
        tools: report.tools || [],
        topSessions: report.topSessions || [],
      },
    });
  });

  log(
    `Prepared ${events.length} events across ${detected.length} provider(s); ${snapshots.length} snapshots`,
  );

  const result = await postIngest(cfg.server, cfg.token, {
    hostname: os.hostname(),
    platform: process.platform,
    events,
    snapshots,
    detected_providers: detected,
    replace_machine: true,
  });

  log(`Ingest result: ${JSON.stringify(result)}`);
  writeState({ lastSyncedAt: new Date().toISOString() });
}

function installScheduler(opts) {
  const platform = process.platform;
  if (platform === "darwin") return installLaunchd(opts);
  if (platform === "linux") return installCron(opts);
  if (platform === "win32") {
    log("Windows scheduler not yet automated. Run agent.js manually or add a scheduled task.");
    return;
  }
  log(`Unknown platform ${platform} — skipping scheduler setup.`);
}

function installLaunchd(opts) {
  const label = "com.bigstep.tokencalc";
  const plistPath = path.join(HOME, "Library", "LaunchAgents", `${label}.plist`);
  const nodeBin = process.execPath;
  const agentPath = opts.agentPath;
  const augmentedPath = [
    path.dirname(nodeBin),
    `${HOME}/.nvm/versions/node`,
    `${HOME}/.volta/bin`,
    `${HOME}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${agentPath}</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${augmentedPath}</string>
    <key>HOME</key><string>${HOME}</string>
  </dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${LOG_PATH}</string>
  <key>StandardErrorPath</key><string>${LOG_PATH}</string>
</dict></plist>`;
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, plist);
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {}
  execFileSync("launchctl", ["load", plistPath]);
  log(`Installed launchd agent at ${plistPath}`);
}

function installCron(opts) {
  const cmd = `*/15 * * * * "${process.execPath}" "${opts.agentPath}" run >> "${LOG_PATH}" 2>&1`;
  const tag = "# tokencalc-agent";
  let existing = "";
  try {
    existing = execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {}
  const lines = existing.split("\n").filter((l) => !l.includes(tag));
  lines.push(`${cmd} ${tag}`);
  const proc = spawnSync("crontab", ["-"], { input: lines.join("\n") + "\n" });
  if (proc.status !== 0) throw new Error("Failed to install cron");
  log("Installed cron entry (every 15 min)");
}

function uninstallScheduler() {
  if (process.platform === "darwin") {
    const plistPath = path.join(
      HOME,
      "Library",
      "LaunchAgents",
      "com.bigstep.tokencalc.plist",
    );
    try {
      execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
    } catch {}
    try {
      fs.unlinkSync(plistPath);
    } catch {}
    log("Removed launchd agent");
  } else if (process.platform === "linux") {
    let existing = "";
    try {
      existing = execFileSync("crontab", ["-l"], { encoding: "utf8" });
    } catch {}
    const lines = existing.split("\n").filter((l) => !l.includes("# tokencalc-agent"));
    spawnSync("crontab", ["-"], { input: lines.join("\n") + "\n" });
    log("Removed cron entry");
  }
}

function cmdInstall(args) {
  const token = args.token || process.env.TC_TOKEN;
  const server = args.server || process.env.TC_SERVER;
  if (!token || !server) {
    console.error("Usage: agent.js install --token=<install_token> --server=<https://...>");
    process.exit(1);
  }
  fs.mkdirSync(CFG_DIR, { recursive: true });

  const codeburnPath = findCodeburn();
  if (!codeburnPath) {
    log("WARNING: codeburn binary not found. Install it: npm install -g codeburn");
  } else {
    log(`Resolved codeburn binary: ${codeburnPath}`);
  }

  fs.writeFileSync(
    CFG_PATH,
    JSON.stringify({ token, server, codeburnPath }, null, 2),
  );
  fs.chmodSync(CFG_PATH, 0o600);
  log(`Wrote config to ${CFG_PATH}`);

  const agentPath = path.join(CFG_DIR, "agent.js");
  fs.copyFileSync(__filename, agentPath);
  fs.chmodSync(agentPath, 0o755);

  installScheduler({ agentPath });
  log("Running first sync…");
  runOnce()
    .then(() => log("First sync complete."))
    .catch((err) => {
      log(`First sync failed: ${err.message}`);
      process.exit(2);
    });
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out;
}

async function main() {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  switch (cmd) {
    case "install":
      cmdInstall(args);
      break;
    case "run":
      try {
        await runOnce();
      } catch (err) {
        log(`run failed: ${err.message}`);
        process.exit(2);
      }
      break;
    case "uninstall":
      uninstallScheduler();
      try {
        fs.unlinkSync(CFG_PATH);
      } catch {}
      log("Uninstalled.");
      break;
    case "status": {
      const cfg = readConfig();
      const state = readState();
      console.log(JSON.stringify({ cfgPath: CFG_PATH, server: cfg.server, codeburnPath: cfg.codeburnPath, lastSyncedAt: state.lastSyncedAt }, null, 2));
      break;
    }
    default:
      console.log("Usage: agent.js install|run|uninstall|status");
      process.exit(1);
  }
}

main();
