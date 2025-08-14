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
const FRONTEND_ORIGIN_RAW = process.env.FRONTEND_ORIGIN || "*";
const CRON_SECRET = process.env.CRON_SECRET || "";

if (!DATABASE_URL) console.warn("WARNING: DATABASE_URL not set");
if (!BIRDEYE_API_KEY) console.warn("WARNING: BIRDEYE_API_KEY not set (cron pulls will fail)");

// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- APP ----------
const app = express();

// --- CORS ---
const FRONTEND_ORIGIN = FRONTEND_ORIGIN_RAW.replace(/\/$/, "");
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const cleaned = origin.replace(/\/$/, "");
    if (FRONTEND_ORIGIN === "*" || cleaned === FRONTEND_ORIGIN) return cb(null, true);
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-cron-secret"]
};
app.use((req, _res, next) => {
  if (req.headers.origin) console.log("Request Origin:", req.headers.origin);
  next();
});
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

// ---------- Allowlist ----------
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
  const overview = await beJson(`https://public-api.birdeye.so/defi/token_overview?address=${address}`);
  const meta = await beJson(`https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${address}`);
  const creation = await beJson(`https://public-api.birdeye.so/defi/token_creation_info?address=${address}`);
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

// ---------- DB helpers ----------
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

// ---------- CRON endpoint ----------
app.post("/cron/pull", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    for (const address of TOKEN_ALLOWLIST) {
      try {
        const snap = await fetchTokenSnapshot(address);
        await upsertTokenSnapshot(snap);
        const hist = await fetchHistoryPoints(address);
        if (hist.length) await insertHistoryRows(address, hist);
      } catch (e) {
        console.error("pull error for", address, e.message);
      }
      await new Promise(r => setTimeout(r, 120));
    }
    res.json({ ok: true, pulled: TOKEN_ALLOWLIST.length });
  } catch (e) {
    console.error("Cron pull failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Game round endpoint ----------
app.get("/rounds/today", async (req, res) => {
  console.log(`[HIT] /rounds/today from origin: ${req.headers.origin || "unknown"}`);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = `
      select symbol, name, logo as logoURI
      from token_cache
      order by random()
      limit 2
    `;
    const result = await pool.query(q);
    res.json({
      round_date: today,
      tokens: result.rows
    });
  } catch (e) {
    console.error("Error fetching round:", e);
    res.status(500).json({ error: "Failed to fetch round" });
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
  if (BIRDEYE_API_KEY) {
    console.log("Auto-pull enabled (every 10 min)");
    setInterval(async () => {
      try {
        console.log("Auto-pull: fetching tokens...");
        for (const address of TOKEN_ALLOWLIST) {
          const snap = await fetchTokenSnapshot(address);
          await upsertTokenSnapshot(snap);
          const hist = await fetchHistoryPoints(address);
          if (hist.length) await insertHistoryRows(address, hist);
          await new Promise(r => setTimeout(r, 120));
        }
        console.log("Auto-pull complete.");
      } catch (err) {
        console.error("Auto-pull failed:", err.message);
      }
    }, 10 * 60 * 1000);
  } else {
    console.log("Auto-pull disabled: missing BIRDEYE_API_KEY");
  }
});




