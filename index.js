import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from "pg";
const { Pool } = pkg;

// ---------- ENV ----------
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";     // set in Railway
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";    // set to your Netlify origin later
const CRON_SECRET = process.env.CRON_SECRET || "";             // set any random string in Railway

if (!DATABASE_URL) console.warn("WARNING: DATABASE_URL not set");
if (!BIRDEYE_API_KEY) console.warn("WARNING: BIRDEYE_API_KEY not set (cron pulls will fail)");

// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- APP ----------
const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

// ---------- Allowlist (from your app.js) ----------
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

// ---------- Birdeye helpers ----------
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
  // overview
  const overview = await beJson(`https://public-api.birdeye.so/defi/token_overview?address=${address}`);
  // metadata
  const meta = await beJson(`https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${address}`);
  // creation
  const creation = await beJson(`https://public-api.birdeye.so/defi/token_creation_info?address=${address}`);
  // security
  const security = await beJson(`https://public-api.birdeye.so/defi/token_security?address=${address}`);

  return {
    address,
    symbol: meta?.data?.symbol || "",
    name: meta?.data?.name || "Unknown",
    logo: meta?.data?.logo_uri || "",
    price: overview?.data?.price ?? 0,
    marketcap: overview?.data?.marketCap ?? 0,
    liquidity: overview?.data?.liquidity ?? 0,
    volume24h: overview?.data?.v24hUSD ?? 0,
    priceChange24h: Number(overview?.data?.priceChange24hPercent ?? 0).toFixed(2),
    holders: overview?.data?.holder ?? 0,
    top10HolderPercent: security?.data?.top10HolderPercent ? Number(security.data.top10HolderPercent * 100).toFixed(2) : null,
    launchedAt: creation?.data?.blockHumanTime ? new Date(creation.data.blockHumanTime) : null
  };
}

async function fetchHistoryPoints(address) {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;
  const url = `https://public-api.birdeye.so/defi/history_price?address=${address}&address_type=token&type=30m&time_from=${oneDayAgo}&time_to=${now}&ui_amount_mode=raw`;
  const json = await beJson(url);
  const items = json?.data?.items || [];
  return items
    .map(p => ({ ts: new Date(p.unixTime * 1000).toISOString(), price: p.value }))
    .filter(p => typeof p.price === "number" && p.price > 0);
}

// ---------- Upserts ----------
async function upsertTokenSnapshot(s) {
  const q = `
    insert into token_cache(address, symbol, name, logo, price, marketcap, liquidity, volume24h, priceChange24h, holders, top10HolderPercent, launchedAt, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
    on conflict (address)
    do update set
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
    s.address, s.symbol, s.name, s.logo, s.price, s.marketcap, s.liquidity,
    s.volume24h, s.priceChange24h, s.holders, s.top10HolderPercent, s.launchedAt
  ];
  await pool.query(q, vals);
}

async function insertHistoryRows(address, rows) {
  if (!rows.length) return;
  const values = rows.map((r, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(",");
  const params = [address];
  rows.forEach(r => { params.push(r.ts); params.push(r.price); });
  const q = `insert into token_history(address, ts, price) values ${values}`;
  await pool.query(q, params);
}

// ---------- CRON endpoint (every 10 minutes) ----------
app.post("/cron/pull", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    // pull & upsert for every token in allowlist
    for (const address of TOKEN_ALLOWLIST) {
      try {
        const snap = await fetchTokenSnapshot(address);
        await upsertTokenSnapshot(snap);
        // optional history
        const hist = await fetchHistoryPoints(address);
        if (hist.length) await insertHistoryRows(address, hist);
      } catch (e) {
        console.error("pull error for", address, e.message);
      }
      // small spacing just in case
      await new Promise(r => setTimeout(r, 120));
    }
    res.json({ ok: true, pulled: TOKEN_ALLOWLIST.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Public endpoints ----------

// Health
app.get("/healthz", async (_req, res) => {
  try {
    const r = await pool.query("select now()");
    res.json({ status: "ok", time: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// 5 random tokens for today's round, served from cache
app.get("/rounds/today", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select * from token_cache
      where address = any($1)
      order by random()
      limit 5
    `, [TOKEN_ALLOWLIST]);
    const todayUTC = new Date().toISOString().slice(0, 10);
    res.json({
      round_date: todayUTC,
      tokens: rows.map(r => ({
        address: r.address,
        symbol: r.symbol,
        name: r.name,
        logo: r.logo,
        price: Number(r.price) || 0,
        marketcap: Number(r.marketcap) || 0,
        liquidity: Number(r.liquidity) || 0,
        volume24h: Number(r.volume24h) || 0,
        priceChange24h: Number(r.priceChange24h || 0).toFixed(2),
        holders: Number(r.holders) || 0,
        top10HolderPercent: r.top10holderpercent !== null ? Number(r.top10holderpercent).toFixed(2) : "0",
        launchedAt: r.launchedat ? new Date(r.launchedat).toISOString() : null
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// One token snapshot (latest) from cache
app.get("/token/:address", async (req, res) => {
  try {
    const { rows } = await pool.query("select * from token_cache where address=$1", [req.params.address]);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    const r = rows[0];
    res.json({
      address: r.address,
      symbol: r.symbol,
      name: r.name,
      logo: r.logo,
      price: Number(r.price) || 0,
      marketcap: Number(r.marketcap) || 0,
      liquidity: Number(r.liquidity) || 0,
      volume24h: Number(r.volume24h) || 0,
      priceChange24h: Number(r.priceChange24h || 0).toFixed(2),
      holders: Number(r.holders) || 0,
      top10HolderPercent: r.top10holderpercent !== null ? Number(r.top10holderpercent).toFixed(2) : "0",
      launchedAt: r.launchedat ? new Date(r.launchedat).toISOString() : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Simple history (last 48 points if present)
app.get("/token/:address/history", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select ts, price from token_history where address=$1 order by ts desc limit 48",
      [req.params.address]
    );
    // Return oldest -> newest for chart
    res.json(rows.reverse().map(r => ({ time: r.ts, price: Number(r.price) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`API listening on ${PORT}`));

