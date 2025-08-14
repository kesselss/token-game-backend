import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import pkg from "pg";
const { Pool } = pkg;

// ---------- ENV ----------
dotenv.config();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

// Allow your Netlify site (adjust as needed)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://charming-dieffenbachia-a9e8f1.netlify.app";

// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- APP ----------
const app = express();
app.use(express.json({ limit: "1mb" }));

// --- CORS ---
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-cron-secret"]
  })
);
app.options("*", cors());

// ---------- Allowlist of token addresses you want to track ----------
const TOKEN_ALLOWLIST = [
  "5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2",
  "DitHyRMQiSDhn5cnKMJV2CDDt6sVct96YrECiM49pump",
  "5zCETicUCJqJ5Z3wbfFPZqtSpHPYqnggs1wX7ZRpump",
  "347k5f1WLRYe81roRcLBWDR6k3eCRunaqetQPW6pbonk",
  "7oLWGMuGbBm9uwDmffSdxLE98YChFAH1UdY5XpKYLff8",
  "4mWTS6KztDEoMu2uqsnbgbeGRh6chjq7Fbpmbr1Ypump",
  "8rRbA79pWLtnLFGaHHdqqKPEa1aPk8QuNKa9ZW8ZSseX",
  "CB9dDufT3ZuQXqqSfa1c5kY935TEreyBw9XJXxHKpump",
  "GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump",
  "GtDZKAqvMZMnti46ZewMiXCa4oXF4bZxwQPoKzXPFxZn",
  "C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump",
  "9EQSeWY7pDB7MYoSFr8QJ19onGS1ehDmLbSGT2b3pump",
  "BFgdzMkTPdKKJeTipv2njtDEwhKxkgFueJQfJGt1jups",
  "Ey59PH7Z4BFU4HjyKnyMdWt5GGN76KazTAwQihoUXRnk",
  "6AJcP7wuLwmRYLBNbi825wgguaPsWzPBEHcHndpRpump",
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  "DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2",
  "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9"
];

// ---------- Birdeye helpers (server-side only) ----------
const BE_HEADERS = {
  accept: "application/json",
  "x-chain": "solana",
  "X-API-KEY": BIRDEYE_API_KEY
};

async function beJson(url) {
  const res = await fetch(url, { headers: BE_HEADERS });
  if (!res.ok) throw new Error(`Birdeye ${res.status} for ${url}`);
  return res.json();
}

async function fetchTokenSnapshot(address) {
  const overview = await beJson(
    `https://public-api.birdeye.so/defi/token_overview?address=${address}`
  );
  const meta = await beJson(
    `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${address}`
  );
  const creation = await beJson(
    `https://public-api.birdeye.so/defi/token_creation_info?address=${address}`
  );
  const security = await beJson(
    `https://public-api.birdeye.so/defi/token_security?address=${address}`
  );

  return {
    address,
    symbol: meta?.data?.symbol || "",
    name: meta?.data?.name || "Unknown",
    logo: meta?.data?.logo_uri || "",
    price: overview?.data?.price ?? 0,
    marketcap: overview?.data?.marketCap ?? 0,
    liquidity: overview?.data?.liquidity ?? 0,
    volume24h: overview?.data?.v24hUSD ?? 0,
    priceChange24h: Number(overview?.data?.priceChange24hPercent ?? 0),
    holders: overview?.data?.holder ?? 0,
    top10HolderPercent: security?.data?.top10HolderPercent
      ? Number(security.data.top10HolderPercent * 100)
      : null,
    launchedAt: creation?.data?.blockHumanTime
      ? new Date(creation.data.blockHumanTime)
      : null
  };
}

async function fetchHistoryPoints(address) {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;
  const url = `https://public-api.birdeye.so/defi/history_price?address=${address}&address_type=token&type=30m&time_from=${oneDayAgo}&time_to=${now}&ui_amount_mode=raw`;
  const json = await beJson(url);
  const items = json?.data?.items || [];
  return items
    .map((p) => ({ ts: new Date(p.unixTime * 1000).toISOString(), price: p.value }))
    .filter((p) => typeof p.price === "number" && p.price > 0);
}

// ---------- DB helpers ----------
async function upsertTokenSnapshot(s) {
  const q = `
    insert into token_cache(address, symbol, name, logo, price, marketcap, liquidity, volume24h, priceChange24h, holders, top10HolderPercent, launchedAt, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
    on conflict (address) do update set
      symbol=excluded.symbol,
      name=excluded.name,
      logo=excluded.logo,
      price=excluded.price,
      marketcap=excluded.marketcap,
      liquidity=excluded.liquidity,
      volume24h=excluded.volume24h,
      priceChange24h=excluded.priceChange24h,
      holders=excluded.holders,
      top10HolderPercent=excluded.top10HolderPercent,
      launchedAt=excluded.launchedAt,
      updated_at=now()
  `;
  const vals = [
    s.address,
    s.symbol,
    s.name,
    s.logo,
    s.price,
    s.marketcap,
    s.liquidity,
    s.volume24h,
    s.priceChange24h,
    s.holders,
    s.top10HolderPercent,
    s.launchedAt
  ];
  await pool.query(q, vals);
}

async function insertHistoryRows(address, rows) {
  if (!rows.length) return;
  const values = rows.map((r, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(",");
  const params = [address];
  rows.forEach((r) => {
    params.push(r.ts);
    params.push(r.price);
  });
  const q = `insert into token_history(address, ts, price) values ${values}
             on conflict (address, ts) do nothing`;
  await pool.query(q, params);
}

// ---------- CRON: pull data server-side ----------
app.post("/cron/pull", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    let pulled = 0;
    for (const address of TOKEN_ALLOWLIST) {
      try {
        const snap = await fetchTokenSnapshot(address);
        await upsertTokenSnapshot(snap);
        const hist = await fetchHistoryPoints(address);
        if (hist.length) await insertHistoryRows(address, hist);
        pulled++;
      } catch (e) {
        console.error("pull error for", address, e.message);
      }
      await new Promise((r) => setTimeout(r, 120)); // small pacing
    }
    res.json({ ok: true, pulled });
  } catch (e) {
    console.error("Cron pull failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- READ: round of 5, ready to render ----------
app.get("/rounds/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = `
      select
        address,
        symbol,
        name,
        logo as "logoURI",
        price,
        marketcap,
        liquidity,
        volume24h,
        priceChange24h,
        holders,
        top10HolderPercent,
        launchedAt,
        updated_at
      from token_cache
      order by random()
      limit 5
    `;
    const result = await pool.query(q);
    res.json({ round_date: today, tokens: result.rows });
  } catch (e) {
    console.error("Error fetching round:", e);
    res.status(500).json({ error: "Failed to fetch round" });
  }
});

// ---------- READ: one token snapshot ----------
app.get("/tokens/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const q = `select address, symbol, name, logo as "logoURI", price, marketcap, liquidity, volume24h,
                      priceChange24h, holders, top10HolderPercent, launchedAt, updated_at
               from token_cache where address = $1`;
    const { rows } = await pool.query(q, [address]);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("Error fetching token:", e);
    res.status(500).json({ error: "Failed to fetch token" });
  }
});

// ---------- READ: time series for charts ----------
app.get("/tokens/:address/history", async (req, res) => {
  try {
    const { address } = req.params;
    const window = (req.query.window || "24h").toLowerCase(); // 24h, 7d, 30d
    let since = "now() - interval '24 hours'";
    if (window === "7d") since = "now() - interval '7 days'";
    if (window === "30d") since = "now() - interval '30 days'";

    const q = `
      select ts, price
      from token_history
      where address = $1 and ts >= ${since}
      order by ts asc
    `;
    const { rows } = await pool.query(q, [address]);
    res.json({ address, points: rows });
  } catch (e) {
    console.error("Error fetching history:", e);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ---------- WRITE: submit a play ----------
app.post("/plays", async (req, res) => {
  try {
    const { player, selections } = req.body || {};
    if (!player || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ ok: false, error: "player and selections required" });
    }
    // sanitize
    const name = String(player).slice(0, 32);
    const safeSelections = selections
      .slice(0, 10) // safety cap
      .map(s => ({
        address: String(s.address || ""),
        symbol: String(s.symbol || ""),
        name: String(s.name || ""),
        logoURI: String(s.logoURI || ""),
        direction: s.direction === "short" ? "short" : "long"
      }));

    const longs = safeSelections.filter(s => s.direction === "long").length;
    const shorts = safeSelections.filter(s => s.direction === "short").length;

    // UTC round date (reset at 00:00 UTC)
    const round_date = new Date().toISOString().slice(0, 10);

    const q = `insert into plays(player, round_date, selections, longs, shorts, pnl, created_at)
               values ($1, $2, $3, $4, $5, 0, now())
               returning id`;
    const { rows } = await pool.query(q, [name, round_date, JSON.stringify(safeSelections), longs, shorts]);
    res.json({ ok: true, id: rows[0].id, round_date, longs, shorts });
  } catch (e) {
    console.error("Error inserting play:", e);
    res.status(500).json({ ok: false, error: "Failed to save play" });
  }
});

// ---------- READ: leaderboard (yesterday UTC by default) ----------
app.get("/leaderboard", async (req, res) => {
  try {
    const now = new Date();
    const y = new Date(now.getTime() - 24*60*60*1000);
    const defaultDay = y.toISOString().slice(0,10);
    const day = (req.query.round_date || defaultDay);

    // latest submission per player for that day
    const q = `
      select distinct on (player)
        player, longs, shorts, coalesce(pnl, 0) as pnl, created_at
      from plays
      where round_date = $1
      order by player, created_at desc
      limit 200
    `;
    const { rows } = await pool.query(q, [day]);
    // sort by pnl desc, then earlier created_at (tie-breaker)
    rows.sort((a,b) => (b.pnl - a.pnl) || (a.created_at - b.created_at));
    res.json({ round_date: day, entries: rows });
  } catch (e) {
    console.error("Error loading leaderboard:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ---------- Health ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select now()");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});




