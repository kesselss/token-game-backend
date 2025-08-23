import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import pkg from "pg";
import crypto from "crypto";

// replace the require line
import { generatePnLCard } from "./pnlCard.js";


const { Pool } = pkg; //s

// ---------- ENV ----------
dotenv.config();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const PLAY_URL = "https://degendle.com/daily-game/";




// ---------- Telegram constants & helper ----------
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const FRONTEND_URL = process.env.FRONTEND_URL || FRONTEND_ORIGIN; // fallback


// ---------- DB ----------OKay 
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function tgApi(method, payload) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API error: ${JSON.stringify(json)}`);
  return json.result;
}


// ---------- APP ----------
const app = express();
// Verifies Telegram WebApp initData using the bot token.
// Returns the parsed Telegram user object on success, or null on failure.
// Verifies Telegram WebApp initData using the bot token.
// Returns the parsed Telegram user object on success, or null on failure.
// Verifies Telegram WebApp initData using the bot token.
// Returns the parsed Telegram user object on success, or null on failure.
// Verify Telegram initData manually
function verifyTelegramInitData(botToken, telegramInitData) {
  try {
    const initData = new URLSearchParams(telegramInitData);
    initData.sort();

    const hash = initData.get("hash");
    if (!hash) return null;
    initData.delete("hash");

    const dataToCheck = [...initData.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Correct secret key derivation
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataToCheck)
      .digest("hex");

    if (computedHash !== hash) {
      console.error("Hash mismatch:", computedHash, "vs", hash);
      return null;
    }

    const user = JSON.parse(decodeURIComponent(initData.get("user") || ""));
    return user;
  } catch (err) {
    console.error("Error validating init data:", err);
    return null;
  }
}


// --- TG: send PNG buffer as photo (reply to same message) ---
import { Blob } from "buffer"; // add at top with other imports

async function tgSendPhotoBuffer(chat_id, pngBuffer, caption, replyToMessageId) {
  const form = new FormData(); // Node 18+: global
  form.append("chat_id", String(chat_id));
  if (caption) form.append("caption", caption);
  if (replyToMessageId) {
    form.append("reply_to_message_id", String(replyToMessageId));
    form.append("allow_sending_without_reply", "true");
  }
  form.append("photo", new Blob([pngBuffer], { type: "image/png" }), "pnl.png");

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`sendPhoto failed: ${json.description || "unknown"}`);
  return json.result;
}



// Middleware to extract and verify Telegram user from headers
function telegramAuth(req, _res, next) {
  // Prefer the custom header you’re sending from the WebApp
  let initData =
    req.get("X-Telegram-InitData") ||
    req.headers["x-telegram-initdata"] ||
    "";

  // Fallback: support Authorization: tma <initDataRaw> (per TG docs)
  if (!initData) {
    const auth = req.get("authorization") || req.get("Authorization") || "";
    if (auth.startsWith("tma ")) {
      initData = auth.slice(4);
    }
  }

  // IMPORTANT: pass BOT_TOKEN and assign the returned user object directly
const user = verifyTelegramInitData(BOT_TOKEN, initData);
req.tgUser = user || null;

  // Optional debug
  console.log("[telegramAuth] hasInitData:", Boolean(initData), "user:", req.tgUser);

  next();
}








app.use(express.json({ limit: "1mb" }));
app.use(telegramAuth);




const ALLOWED_ORIGINS = [
  "https://degendle.com",
  "https://degendle.com/daily-game",
  "https://charming-dieffenbachia-a9e8f1.netlify.app"
];

// --- CORS ---
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server, or if origin is in allowed list
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "x-cron-secret",
      "X-Telegram-InitData",
      "x-telegram-initdata"
    ]
  })
);

// Optional fallback for preflight requests
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

// ---------- Birdeye: fetch top meme tokens ----------
async function fetchTopMemeTokens(limit = 20, minVolume = 10000, minMarketCap = 100000) {
  let url = `https://public-api.birdeye.so/defi/v3/token/meme/list?sort_by=volume_24h_usd&sort_type=desc&limit=${limit}&min_volume_24h_usd=${minVolume}`;
  
  if (minMarketCap) {
    url += `&min_market_cap=${minMarketCap}`;
  }

  const res = await fetch(url, { headers: BE_HEADERS });
  if (!res.ok) throw new Error(`Birdeye error ${res.status}`);
  const json = await res.json();
  return json?.data?.items || [];
}

function seededShuffle(arr, seedStr) {
  // Tiny mulberry32 PRNG
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  function rnd() { // 0..1
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function beJson(url) {
  const res = await fetch(url, { headers: BE_HEADERS });
  if (!res.ok) throw new Error(`Birdeye ${res.status} for ${url}`);
  return res.json();
}

// Deterministic shuffle by hashing token.address with a seed
function deterministicShuffle(arr, seed) {
  return arr.slice().sort((a, b) => {
    const ha = crypto.createHmac("sha256", seed).update(a.address).digest("hex");
    const hb = crypto.createHmac("sha256", seed).update(b.address).digest("hex");
    return ha.localeCompare(hb);
  });
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

// Get first and last prices for a set of token addresses in a time window
async function firstLastPrices(addresses, startIso, endIso) {
  if (!addresses.length) return {};
  const { rows } = await pool.query(
    `
    with firsts as (
      select distinct on (address) address, price as entry
      from token_history
      where address = any($1) and ts between $2 and $3
      order by address, ts asc
    ),
    lasts as (
      select distinct on (address) address, price as exit
      from token_history
      where address = any($1) and ts between $2 and $3
      order by address, ts desc
    )
    select f.address, f.entry, l.exit
    from firsts f join lasts l using(address)
    `,
    [addresses, startIso, endIso]
  );
  const map = {};
  rows.forEach(r => map[r.address] = { entry: Number(r.entry), exit: Number(r.exit) });
  return map;
}

function decorateSelectionsWithPnl(selections, priceMap) {
  return selections.map(s => {
    const p = priceMap[s.address];
    if (!p || !p.entry || !p.exit) return { ...s, entry: null, exit: null, pnl: null };
    const move = ((p.exit - p.entry) / p.entry) * 100;
    const pnl = s.direction === 'short' ? -move : move;
    return { ...s, entry: p.entry, exit: p.exit, pnl };
  });
}


async function enrichTokensWithCache(tokens) {
  try {
    if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];

    const addrs = tokens.map(t => t && t.address).filter(Boolean);
    if (addrs.length === 0) return tokens;

    const { rows } = await pool.query(
      `SELECT address,
              holders,
              top10holderpercent AS "top10HolderPercent",
              launchedat         AS "launchedAt"
         FROM token_cache
        WHERE address = ANY($1)`,
      [addrs]
    );

    const cache = Object.fromEntries(rows.map(r => [r.address, r]));

    return tokens.map(t => {
      const c = t && cache[t.address];
      if (!c) return t;
      return {
        ...t,
        holders: c.holders ?? t.holders ?? null,
        top10HolderPercent: c.top10HolderPercent ?? t.top10HolderPercent ?? null,
        launchedAt: c.launchedAt ?? t.launchedAt ?? null,
      };
    });
  } catch (err) {
    console.error("enrichTokensWithCache error:", err);
    return tokens || [];
  }
}

async function fetchHistoryPoints(address) {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;
  const url = `https://public-api.birdeye.so/defi/history_price?address=${address}&address_type=token&type=5m&time_from=${oneDayAgo}&time_to=${now}&ui_amount_mode=raw`;
  const json = await beJson(url);
  const items = json?.data?.items || [];
  return items
    .map((p) => ({ ts: new Date(p.unixTime * 1000).toISOString(), price: p.value }))
    .filter((p) => typeof p.price === "number" && p.price > 0);
}

// --- deterministic shuffle (seeded by round + user) ---
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}



// ---------- DB helpers ----------
async function upsertTokenSnapshot(s) {
const q = `
  insert into token_cache(
    address, symbol, name, logo, price, marketcap, liquidity, volume24h,
    priceChange24h, holders, top10HolderPercent, launchedAt, updated_at
  )
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

// --- Price helpers ---
async function getEntryAndCurrentPrices(address, round, { final=false } = {}) {
  // entry = first price at/after round_start; fallback = last before start
  const { rows: entry1 } = await pool.query(
    `select price from token_history
     where address = $1 and ts >= $2
     order by ts asc limit 1`,
    [address, round.round_start]
  );
  let entry = entry1[0]?.price;
  if (entry == null) {
    const { rows: entry2 } = await pool.query(
      `select price from token_history
       where address = $1 and ts < $2
       order by ts desc limit 1`,
      [address, round.round_start]
    );
    entry = entry2[0]?.price;
  }

  // current = last price up to now (live) or round_end (final), but not before start
  const boundTs = final ? round.round_end : new Date().toISOString();
  const { rows: cur1 } = await pool.query(
    `select price from token_history
     where address = $1 and ts >= $2 and ts <= $3
     order by ts desc limit 1`,
    [address, round.round_start, boundTs]
  );
  let current = cur1[0]?.price;

  if (current == null) {
    // fallback to token_cache.price if available
    const { rows: cur2 } = await pool.query(
      `select price from token_cache where address = $1 limit 1`,
      [address]
    );
    current = cur2[0]?.price;
  }

  return {
    entry: entry != null ? Number(entry) : null,
    current: current != null ? Number(current) : null
  };
}

function pickPnlPct(entry, current, direction) {
  if (!entry || !current) return null;
  const move = (current - entry) / entry * 100;
  return direction === "short" ? -move : move;
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

// ---------- CRON: fetch & save daily token list ----------
app.post("/cron/fetch-daily-list", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Fetch today’s top 20 meme tokens by 24h volume
    const topTokens = await fetchTopMemeTokens(20, 10000);
    if (!Array.isArray(topTokens) || !topTokens.length) {
      return res.status(500).json({ ok: false, error: "No tokens returned from Birdeye" });
    }

    // Save into daily_token_lists
    await pool.query(
      `insert into daily_token_lists (round_date, tokens)
       values ($1, $2)
       on conflict (round_date) do update set tokens = excluded.tokens`,
      [today, JSON.stringify(topTokens)]
    );

    res.json({ ok: true, saved: topTokens.length });
  } catch (e) {
    console.error("Cron fetch-daily-list failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- CRON: fetch token snapshots + history ----------
app.post("/cron/fetch-tokens", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    // Load today's token list
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `select tokens from daily_token_lists where round_date = $1 limit 1`,
      [today]
    );
    if (!rows.length) {
      return res.status(400).json({ ok: false, error: "No daily token list found. Run /cron/fetch-daily-list first." });
    }

    const tokenList = rows[0].tokens;
    let pulled = 0;

    for (const t of tokenList) {
      try {
        const snap = await fetchTokenSnapshot(t.address);
        await upsertTokenSnapshot(snap);

        const hist = await fetchHistoryPoints(t.address);
        if (hist.length) await insertHistoryRows(t.address, hist);

        pulled++;
      } catch (e) {
        console.error("fetch-tokens error for", t.address, e.message);
      }
      await new Promise((r) => setTimeout(r, 120)); // pacing
    }

    res.json({ ok: true, pulled, total: tokenList.length });
  } catch (e) {
    console.error("Cron fetch-tokens failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ---------- Calculate PnL for a play ----------
async function calculatePnL(selections, round) {
  let total = 0, n = 0;

  for (const pick of selections) {
    const { address, direction } = pick; // "long" | "short"
    const { rows: hist } = await pool.query(
      `select price, ts
       from token_history
       where address = $1
         and ts between $2 and $3
       order by ts asc`,
      [address, round.round_start, round.round_end]
    );

    if (hist.length < 2) continue;
    const start = Number(hist[0].price), end = Number(hist[hist.length - 1].price);
    if (!start || !end) continue;

    const move = (end - start) / start * 100;
    total += direction === "short" ? -move : move;
    n++;
  }
  return n ? total / n : 0;
}

// ---------- Update live PnL for an active round (with per-pick detail) ----------
async function updateLivePnL(round) {
  // fetch all plays in this round
  const { rows: plays } = await pool.query(
    `SELECT user_id, selections
     FROM plays
     WHERE round_id = $1`,
    [round.id]
  );

  for (const play of plays) {
    const selections = Array.isArray(play.selections) ? play.selections : [];
    let sum = 0, n = 0;

    for (const pick of selections) {
      const { address, symbol, name, logoURI, direction } = pick || {};
      if (!address || !direction) continue;

      const { entry, current } = await getEntryAndCurrentPrices(address, round, { final:false });
      const pnl = pickPnlPct(entry, current, direction);

      if (pnl != null) { sum += pnl; n += 1; }

      // Upsert per-pick live detail
      await pool.query(
        `insert into live_pnl_detail
          (round_id, user_id, address, symbol, name, logo, direction, entry_price, current_price, pnl)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (round_id, user_id, address)
         do update set
           symbol        = excluded.symbol,
           name          = excluded.name,
           logo          = excluded.logo,
           direction     = excluded.direction,
           entry_price   = excluded.entry_price,
           current_price = excluded.current_price,
           pnl           = excluded.pnl,
           last_updated  = now()`,
        [
          round.id, play.user_id, address,
          symbol || null, name || null, logoURI || null,
          direction, entry ?? 0, current ?? 0, pnl ?? 0
        ]
      );
    }

    const total = n ? (sum / n) : 0;

    // Upsert total (keeps your existing table)
    await pool.query(
      `insert into live_pnl (round_id, user_id, pnl)
       values ($1, $2, $3)
       on conflict (round_id, user_id)
       do update set pnl = excluded.pnl, last_updated = now()`,
      [round.id, play.user_id, total]
    );
  }

  console.log(`📊 Updated live per-pick + totals for round ${round.id}`);
}



async function startNewRound() {
  const now = new Date();
  const start = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `select tokens from daily_token_lists where round_date = $1 limit 1`,
    [today]
  );
  if (!rows.length) throw new Error("No daily tokens found for today");

  const pool20 = (rows[0].tokens || []).slice(0, 20);

  const { rows: inserted } = await pool.query(
    `insert into rounds (round_start, round_end, tokens)
     values ($1, $2, $3)
     returning id, round_start, round_end`,
    [start.toISOString(), end.toISOString(), JSON.stringify(pool20)]
  );

  // notify users (copy as-is)
  const { rows: users } = await pool.query(`select chat_id from telegram_users`);
  for (const u of users) {
    try {
      await tgApi("sendMessage", {
        chat_id: u.chat_id,
        text: `🚀 New round has started!\nYou have 1 hour to play.\n\nTap to join:`,
        reply_markup: { inline_keyboard: [[{ text: "🎮 Play Now", web_app: { url: FRONTEND_URL } }]] }
      });
    } catch (e) { console.error("notify fail", u.chat_id, e.message); }
  }

  return inserted[0];
}



// === FINISH A ROUND ===
async function finishRound(round) {
  try {
    console.log(`⚡ Finishing round ${round.id}`);

    // 1) Fetch all plays for this round
    const { rows: plays } = await pool.query(
      `SELECT p.id, p.round_id, p.user_id, p.username, p.selections, p.chat_id
       FROM plays p
       WHERE p.round_id = $1`,
      [round.id]
    );

    if (!plays.length) {
      console.log("No plays found for this round.");
      await pool.query(`UPDATE rounds SET results_sent = true WHERE id = $1`, [round.id]);
      await pool.query(`DELETE FROM live_pnl WHERE round_id = $1`, [round.id]);
      return;
    }

    // --- price helpers + pickPnlPct (unchanged) ---
    async function getPriceAtOrNear(address, tsIso, preferBefore = true) { /* ... same as you pasted ... */ }
    function pickPnlPct(entry, exit, direction) { /* ... same as you pasted ... */ }

    // 2) For each play: compute per-pick PnL and total; save to round_results
    for (const play of plays) {
      const selections = Array.isArray(play.selections) ? play.selections : [];
      let sum = 0, n = 0;
      const finalRows = [];

      for (const pick of selections) {
        const { address, symbol, name, logoURI, direction } = pick || {};
        if (!address || !direction) continue;

        const entry = await getPriceAtOrNear(address, round.round_start, true);
        const exit  = await getPriceAtOrNear(address, round.round_end,   true);
        const pnl   = pickPnlPct(entry, exit, direction);

        if (pnl != null) { sum += pnl; n += 1; }
        finalRows.push({
          address,
          symbol: symbol || null,
          name: name || null,
          logo: logoURI || null,
          direction,
          entry_price: entry ?? 0,
          current_price: exit ?? 0,
          pnl: pnl ?? 0
        });
      }

      const total = n ? (sum / n) : 0;

      await pool.query(
        `INSERT INTO round_results (round_id, user_id, chat_id, portfolio, pnl, choices)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (round_id, user_id) DO UPDATE
         SET portfolio = EXCLUDED.portfolio,
             pnl       = EXCLUDED.pnl,
             choices   = EXCLUDED.choices`,
        [
          round.id,
          play.user_id,
          play.chat_id,
          JSON.stringify(play.selections),
          total,
          JSON.stringify(play.selections)
        ]
      );

      play.__final = { total, rows: finalRows };
    }

    console.log(`✅ Round ${round.id} finished and results saved.`);

    // 3) Build leaderboard text for this round
    const { rows: leaderboard } = await pool.query(
      `SELECT COALESCE(t.username, r.user_id::text) AS username, r.pnl, r.user_id
       FROM round_results r
       LEFT JOIN telegram_users t ON t.user_id::text = r.user_id::text
       WHERE r.round_id = $1
       ORDER BY r.pnl DESC
       LIMIT 10`,
      [round.id]
    );

    let message = `🏆 Round Results 🏆\n\n`;
    leaderboard.forEach((row, i) => {
      message += `${i + 1}. ${row.username} — ${parseFloat(row.pnl).toFixed(2)}%\n`;
    });

    // 4) DM each participant: leaderboard + their personal rank + breakdown
    for (const play of plays) {
      if (!play.chat_id) continue;
      const fin = play.__final || { total: 0, rows: [] };

      // fetch this player’s rank + total
      let rankLine = "";
      try {
        const { rows: [meRow] } = await pool.query(
          `select r.pnl,
                  row_number() over(order by r.pnl desc) as rank,
                  count(*) over() as total
           from round_results r
           where r.round_id = $1 and r.user_id::text = $2::text`,
          [round.id, play.user_id]
        );
        if (meRow) {
          const topPct = Math.round((meRow.rank / meRow.total) * 100);
          rankLine = `\n🎯 You: #${meRow.rank}/${meRow.total} — ${parseFloat(meRow.pnl).toFixed(2)}% (Top ${topPct}%)\n`;
        }
      } catch (err) {
        console.error("rank lookup error", err);
      }

      const lines = [
        "🧾 Your Round Breakdown",
        `Total: ${Number(fin.total).toFixed(2)}%`,
        "",
        "Token  | Dir | PnL%",
        "----------------------"
      ];
      for (const r of fin.rows) {
        const dir = r.direction === 'short' ? 'S' : 'L';
        const label = (r.symbol || r.name || r.address || "?").toString().toUpperCase();
        lines.push(`${label} | ${dir} | ${Number(r.pnl).toFixed(2)}%`);
      }

      await tgApi("sendMessage", {
        chat_id: play.chat_id,
        text: `${message}${rankLine}\n${lines.join("\n")}`
      });
    }

    // 5) Mark finished + cleanup
    await pool.query(`UPDATE rounds SET results_sent = true WHERE id = $1`, [round.id]);
    await pool.query(`DELETE FROM live_pnl WHERE round_id = $1`, [round.id]);
    console.log(`🧹 Cleaned up live PnL for round ${round.id}`);
  } catch (err) {
    console.error("❌ Error finishing round:", err);
  }
}






// ---------- Build Leaderboard ----------
async function buildLeaderboard(roundId) {
  const { rows } = await pool.query(
  `select t.username, r.pnl
   from round_results r
   join telegram_users t on t.user_id::text = r.user_id::text
   where r.round_id = $1
   order by r.pnl desc
   limit 10`,
  [roundId]
);


  if (!rows.length) {
    return "No results yet.";
  }

  let text = "🏆 Leaderboard\n\n";
  rows.forEach((row, i) => {
    text += `${i + 1}. ${row.username || "Anon"} — ${parseFloat(row.pnl).toFixed(2)}%\n`;
  });

  return text;
}




// ---------- CRON: manage rounds ----------
app.post("/cron/manage-rounds", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const now = new Date();

    // 1. Check if there is an active round
    const { rows: active } = await pool.query(
      `select * from rounds where round_start <= $1 and round_end > $1 limit 1`,
      [now.toISOString()]
    );

    if (!active.length) {
      // No active round → start one
      const round = await startNewRound();
      return res.json({ ok: true, action: "started", round });
    }

    const currentRound = active[0];

    // 2. Check if any round just ended and results not sent
    const { rows: finished } = await pool.query(
      `select * from rounds 
       where round_end <= $1 and coalesce(results_sent, false) = false
       order by round_end asc`,
      [now.toISOString()]
    );

    if (finished.length) {
      for (const r of finished) {
        await finishRound(r);
      }
      return res.json({ ok: true, action: "finished", count: finished.length });
    }

    // 3. Otherwise update live pnl for the current active round
    await updateLivePnL(currentRound);
    return res.json({ ok: true, action: "live-updated", round: currentRound.id });

  } catch (e) {
    console.error("manage-rounds error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Build { playerName, rank, totalPlayers, totalPct, selections[], title } for the card
async function buildLivePnLCardData(round, userId) {
  // Who + current PnL
  const { rows: meRow } = await pool.query(
    `select coalesce(t.username, l.user_id::text) as username, l.pnl
     from live_pnl l
     left join telegram_users t on t.user_id::text = l.user_id::text
     where l.round_id = $1 and l.user_id::text = $2::text
     limit 1`,
    [round.id, userId]
  );
  const playerName = meRow[0]?.username || `User ${userId}`;
  const totalPct = Number(meRow[0]?.pnl ?? 0);

  // Rank + total players (live)
  const { rows: ranks } = await pool.query(
    `select user_id, pnl,
            row_number() over(order by pnl desc) as rank,
            count(*) over() as total
     from live_pnl
     where round_id = $1`,
    [round.id]
  );
  const mine = ranks.find(r => r.user_id?.toString() === userId);
  const rank = mine ? Number(mine.rank) : 0;
  const totalPlayers = mine ? Number(mine.total) : ranks.length;

  // User selections → decorate with entry/exit/pnl up to NOW
  let selections = [];
  const { rows: picks } = await pool.query(
    `select portfolio from round_results
     where round_id = $1 and user_id::text = $2::text
     limit 1`,
    [round.id, userId]
  );
  if (picks.length) {
    const raw = JSON.parse(picks[0].portfolio || "[]"); // [{address,symbol,name,logoURI,direction}]
    const addrs = [...new Set(raw.map(s => s.address).filter(Boolean))];
    if (addrs.length) {
      const endIso = new Date().toISOString(); // live up-to-now
      const priceMap = await firstLastPrices(addrs, round.round_start, endIso);
      const deco = decorateSelectionsWithPnl(raw, priceMap);
      selections = deco.map(s => ({
        symbol: s.symbol || "",
        name: s.name || "",
        logo: s.logoURI || s.logo || "",
        direction: s.direction || "long",
        entry: s.entry ?? null,
        exit: s.exit ?? null,
        pnl: typeof s.pnl === "number" ? s.pnl : 0
      }));
    }
  }

  return {
    playerName,
    rank,
    totalPlayers,
    totalPct,
    selections,
    title: "Live PnL"
  };
}




// ---------- Telegram Webhook ----------
app.post("/telegram/webhook", async (req, res) => {
  try {
    // Verify Telegram's secret token (set when you called setWebhook)
    const hdr =
      req.get("x-telegram-bot-api-secret-token") ||
      req.get("X-Telegram-Bot-Api-Secret-Token");
    if (TELEGRAM_WEBHOOK_SECRET && hdr !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message || null;

    if (msg) {
      const chat_id = msg.chat.id;
      // --- Save user in DB (with error logging) ---
      try {
        const userId = msg.from?.id?.toString() || null;
        const username = msg.from?.username || msg.from?.first_name || "anon";

        await pool.query(
          `insert into telegram_users (chat_id, user_id, username, first_seen, last_seen)
           values ($1, $2, $3, now(), now())
           on conflict (chat_id) do update
             set user_id = excluded.user_id,
                 username = excluded.username,
                 last_seen = now()`,
          [chat_id, userId, username]
        );

        console.log("✅ Saved Telegram user:", { chat_id, userId, username });
      } catch (dbErr) {
        console.error("❌ Failed to save Telegram user:", dbErr);
      }
    }

    // Handle /about
if (msg?.text?.startsWith("/about")) {
  const chat_id = msg.chat.id;

  const parts = [
`🧠 About the Game and Creator

I’m a long-time degen. Won some, lost some. I wanted a fun memecoin game that combines:
1) A quick way to see what’s trending in the last 24h (no endless scrolling)
2) Paper trading for all those “what if I took that trade” moments
3) The option to go short (you can’t on new pairs)
4) An even playing field to test pure shitcoin intuition
5) Small rewards for being right`,

`🎮 What is Degendle?
A daily game to test your meme coin intuition without risking real money.

• Each day the system builds a list of ~20 trending tokens (volume + newness).
• You’ll be served 5 random tokens.
• You have ~10s per token to choose: 📈 Long or 📉 Short.
• After your 5 picks, your portfolio is submitted for the round.
• When the round ends, we calculate PnL and post the Top 10.`,

`🤖 Telegram bot = login layer
Useful commands:
/start – Get the web app button
/live – Show your current round live PnL
/leaderboard – Top 10 from the last finished round
/timer – How long until the round ends`,

`⚠️ Notes
• Winnings are in SOL and paid manually for now.
• No token, no wallet connect, no “airdrop.” If someone asks, it’s a scam.
• DYOR — tokens shown are just the most traded of the day with some filters.`
  ];

  for (const p of parts) {
    await tgApi("sendMessage", { chat_id, text: p });
  }
}


    // Handle /start
    if (msg?.text?.startsWith("/start")) {
      const chat_id = msg.chat.id;
      await tgApi("sendMessage", {
        chat_id,
        text: "🚀 Degendle is ready. Tap to play:",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Play Degendle", web_app: { url: PLAY_URL } }
          ]]
        }
      });
    }

    // Handle /timer
    if (msg?.text?.startsWith("/timer")) {
      const chat_id = msg.chat.id;
      const round = await getCurrentRound();
      if (!round) {
        await tgApi("sendMessage", {
          chat_id,
          text: "⏳ No active round right now. A new one will start soon!"
        });
      } else {
        const now = new Date();
        const end = new Date(round.round_end);
        const secondsLeft = Math.max(0, Math.floor((end - now) / 1000));
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;

        await tgApi("sendMessage", {
          chat_id,
          text: `⏱ Round ends in ${minutes}m ${seconds}s`
        });
      }
    }

    // Handle /live
if (msg?.text?.startsWith("/live")) {
  const chat_id = msg.chat.id;
  const userId = msg.from?.id?.toString();
  const round = await getCurrentRound();

  if (!round) {
    await tgApi("sendMessage", { chat_id, text: "⏳ No active round right now. A new one will start soon!" });
  } else {
    // Top 10
    const { rows: top } = await pool.query(
      `select coalesce(t.username, l.user_id::text) as username, l.user_id, l.pnl
       from live_pnl l
       left join telegram_users t on t.user_id::text = l.user_id::text
       where l.round_id = $1
       order by l.pnl desc
       limit 10`,
      [round.id]
    );

    if (!top.length) {
      await tgApi("sendMessage", { chat_id, text: "No plays yet this round." });
    } else {
      // Full ranking (for "You:")
      const { rows: ranked } = await pool.query(
        `select l.user_id,
                coalesce(t.username, l.user_id::text) as username,
                l.pnl,
                row_number() over(order by l.pnl desc) as rank,
                count(*) over() as total
         from live_pnl l
         left join telegram_users t on t.user_id::text = l.user_id::text
         where l.round_id = $1
         order by l.pnl desc`,
        [round.id]
      );

      let message = `📊 Live Standings (Round ends at ${new Date(round.round_end).toLocaleTimeString()})\n\n`;
      top.forEach((row, i) => {
        message += `${i + 1}. ${row.username} — ${parseFloat(row.pnl).toFixed(2)}%\n`;
      });

      // Add "You:" line + per-pick breakdown (from live_pnl_detail which updateLivePnL keeps fresh)
      const me = ranked.find(r => r.user_id?.toString() === userId);
      if (me) {
        const topPct = Math.round((me.rank / me.total) * 100);
        message += `\n🎯 You: #${me.rank}/${me.total} — ${parseFloat(me.pnl).toFixed(2)}% (Top ${topPct}%)`;

        try {
          const { rows: picks } = await pool.query(
            `select symbol, name, direction, entry_price, current_price, pnl
             from live_pnl_detail
             where round_id = $1 and user_id::text = $2::text
             order by pnl desc`,
            [round.id, userId]
          );
          if (picks.length) {
            message += `\n\n🧾 Your Picks (live)\nToken | Dir | Entry | Now | PnL%\n--------------------------------`;
            for (const p of picks) {
              const label = (p.symbol || p.name || "").toUpperCase();
              const dir = p.direction === 'short' ? 'S' : 'L';
              message += `\n${label} | ${dir} | $${Number(p.entry_price).toFixed(6)} | $${Number(p.current_price).toFixed(6)} | ${Number(p.pnl).toFixed(2)}%`;
            }
          }
        } catch (e) {
          console.error("live picks fetch error", e);
        }
      }

      await tgApi("sendMessage", { chat_id, text: message });

      // --- ADD: PnL image reply (keep existing text above) ---
try {
  const chat_id = msg.chat.id;
  const userId = msg.from?.id?.toString();

  // If you already have `round` in scope, reuse it. Otherwise fetch it:
  const roundNow = typeof round !== "undefined" && round ? round : await getCurrentRound();
  if (!roundNow) {
    // no active round; nothing to render
  } else {
    // 1) Fetch this user’s live rank + total + pnl
    const { rows: meRows } = await pool.query(
      `select user_id, pnl,
              row_number() over(order by pnl desc) as rank,
              count(*) over() as total
       from live_pnl
       where round_id = $1`,
      [roundNow.id]
    );
    const meRow = meRows.find(r => r.user_id?.toString() === userId) || null;

    // 2) Pull this user’s live picks (entry/exit/pnl)
    const { rows: picks } = await pool.query(
      `select address, symbol, name, logo, direction,
              entry_price as entry, current_price as exit, pnl
       from live_pnl_detail
       where round_id = $1 and user_id::text = $2::text
       order by pnl desc
       limit 6`,
       [roundNow.id, userId]
    );

    // 3) Build the image buffer (uses your ES module: generatePnLCard)
    const buffer = await generatePnLCard({
      playerName: msg.from?.username || msg.from?.first_name || "anon",
      rank: meRow?.rank || 0,
      totalPlayers: meRow?.total || 0,
      totalPct: Number(meRow?.pnl ?? 0),
      selections: picks.map(s => ({
        symbol: s.symbol,
        name: s.name,
        logo: s.logo,           // assumes you store a URL in `logo`
        direction: s.direction, // "long" | "short"
        entry: Number(s.entry),
        exit: Number(s.exit),
        pnl: Number(s.pnl)
      }))
    });

    // 4) Send image as a reply to the same message
    const FormData = (await import("form-data")).default; // uses the same lib you already use elsewhere
    const form = new FormData();
    form.append("chat_id", String(chat_id));
    form.append("reply_to_message_id", String(msg.message_id));
    form.append("allow_sending_without_reply", "true");
    form.append(
      "caption",
      `🎯 Your Live PnL — #${meRow?.rank || 0}/${meRow?.total || 0} (${(Number(meRow?.pnl ?? 0)).toFixed(2)}%)`
    );
    form.append("photo", buffer, { filename: "live_pnl.png", contentType: "image/png" });

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    await fetch(url, { method: "POST", body: form });
  }
} catch (err) {
  console.error("live->add card error:", err);
  // stay silent to not spam users if the image fails
}

    }
  }
}



    // Handle /leaderboard
if (msg?.text?.startsWith("/leaderboard")) {
  const chat_id = msg.chat.id;
  const userId = msg.from?.id?.toString();

  // Most recent finished round
  const { rows: lastRound } = await pool.query(
    `select * from rounds 
     where results_sent = true 
     order by round_end desc 
     limit 1`
  );

  if (!lastRound.length) {
    await tgApi("sendMessage", { chat_id, text: "No finished rounds yet." });
  } else {
    const round = lastRound[0];

    // Top 10
    const { rows: top } = await pool.query(
      `select coalesce(t.username, r.user_id::text) as username,
              r.user_id, r.pnl
       from round_results r
       left join telegram_users t on t.user_id::text = r.user_id::text
       where r.round_id = $1
       order by r.pnl desc
       limit 10`,
      [round.id]
    );

    if (!top.length) {
      await tgApi("sendMessage", { chat_id, text: "No results for that round." });
    } else {
      let message = `🏆 Leaderboard (Round ended at ${new Date(round.round_end).toLocaleTimeString()})\n\n`;
      top.forEach((row, i) => {
        message += `${i + 1}. ${row.username} — ${parseFloat(row.pnl).toFixed(2)}%\n`;
      });

      // "You:" line
      const { rows: ranked } = await pool.query(
        `select r.user_id, r.pnl,
                row_number() over(order by r.pnl desc) as rank,
                count(*) over() as total
         from round_results r
         where r.round_id = $1
         order by r.pnl desc`,
        [round.id]
      );
      const me = ranked.find(r => r.user_id?.toString() === userId);
      if (me) {
        const topPct = Math.round((me.rank / me.total) * 100);
        message += `\n🎯 You: #${me.rank}/${me.total} — ${parseFloat(me.pnl).toFixed(2)}% (Top ${topPct}%)`;

        // Per-pick final breakdown:
        // - Load my selections from round_results.portfolio
        // - Compute entry/exit with firstLastPrices(round_start..round_end)
        // - Use the same math as elsewhere (decorateSelectionsWithPnl)
        try {
          const { rows: meChoices } = await pool.query(
            `select portfolio from round_results
             where round_id = $1 and user_id::text = $2::text limit 1`,
            [round.id, userId]
          );
          if (meChoices.length) {
            const selections = JSON.parse(meChoices[0].portfolio || "[]");
            const addresses = [...new Set(selections.map(s => s.address).filter(Boolean))];

            // helpers already defined near the top of your file:
            // firstLastPrices(start,end) + decorateSelectionsWithPnl()
            const priceMap = await firstLastPrices(addresses, round.round_start, round.round_end); // :contentReference[oaicite:6]{index=6}
            const decorated = decorateSelectionsWithPnl(selections, priceMap);                      // :contentReference[oaicite:7]{index=7}

            if (decorated.length) {
              message += `\n\n🧾 Your Picks (final)\nToken | Dir | Entry | Exit | PnL%\n--------------------------------`;
              for (const s of decorated) {
                const label = (s.symbol || s.name || "").toUpperCase();
                const dir = s.direction === 'short' ? 'S' : 'L';
                const entry = s.entry == null ? "N/A" : `$${Number(s.entry).toFixed(6)}`;
                const exit  = s.exit  == null ? "N/A" : `$${Number(s.exit ).toFixed(6)}`;
                const pnl   = s.pnl   == null ? "—"   : `${Number(s.pnl).toFixed(2)}%`;
                message += `\n${label} | ${dir} | ${entry} | ${exit} | ${pnl}`;
              }
            }
          }
        } catch (e) {
          console.error("leaderboard picks breakdown error", e);
        }
      }

      await tgApi("sendMessage", { chat_id, text: message });
    }
  }
}

    // Acknowledge update
    res.json({ ok: true });
  } catch (e) {
    console.error("telegram/webhook error:", e);
    res.status(200).json({ ok: true }); // don't retry forever
  }
});










async function createNewRound() {
  const now = new Date();
  const start = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `select tokens from daily_token_lists where round_date = $1 limit 1`,
    [today]
  );
  if (!rows.length) throw new Error("No daily tokens available. Did cron run?");

  const pool20 = (rows[0].tokens || []).slice(0, 20);

  const { rows: inserted } = await pool.query(
    `insert into rounds (round_start, round_end, tokens)
     values ($1, $2, $3)
     returning id, round_start, round_end, tokens`,
    [start.toISOString(), end.toISOString(), JSON.stringify(pool20)]
  );

  return inserted[0];
}




// ---------- Get current active round ----------
async function getCurrentRound() {
  const now = new Date().toISOString();
  const { rows } = await pool.query(
    `select *
     from rounds
     where round_start <= $1 and round_end > $1
     order by round_start desc
     limit 1`,
    [now]
  );
  return rows[0] || null;
}



app.get("/rounds/current", async (req, res) => {
  try {
    let round = await getCurrentRound();
    if (!round) {
      round = await createNewRound();
    }

    // Map Birdeye fields -> frontend schema
    const mapToken = (t) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoURI: t.logo_uri,
      price: t.price,
      marketcap: t.market_cap,
      liquidity: t.liquidity,
      volume24h: t.volume_24h_usd,
      priceChange24h: t.price_change_24h_percent,
      holders: t.holder ?? null,
      top10HolderPercent: null, // will be filled by enrichment
      launchedAt: t.meme_info?.creation_time
        ? new Date(t.meme_info.creation_time * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });

    // Legacy shared 5 (already saved in the round)
    const transformedTokens = (round.tokens || []).map(mapToken);

    // Build per-user order (≈20) from today's daily_token_lists
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT tokens FROM daily_token_lists WHERE round_date = $1 LIMIT 1`,
      [today]
    );

    // Fallback if daily list missing
    const dailyPoolRaw = rows.length ? rows[0].tokens : (round.tokens || []);

    // Per-user deterministic shuffle (seeded by round + telegram user id)
    const seed = `${round.id}:${req.tgUser?.id || "anon"}`;
    const orderedRaw = deterministicShuffle(dailyPoolRaw, seed).slice(0, 20);
    const ordered = orderedRaw.map(mapToken);

    // Enrich BOTH arrays with holders/top10/launch info from token_cache
    const [tokensEnriched, orderedEnriched] = await Promise.all([
      enrichTokensWithCache(transformedTokens),
      enrichTokensWithCache(ordered),
    ]);

    res.json({
      id: round.id,
      start: round.round_start,
      end: round.round_end,
      tokens: tokensEnriched,     // shared 5 (back-compat)
      ordered: orderedEnriched,   // per-user 20 (frontend will take first 5)
    });
  } catch (e) {
    console.error("Error fetching current round:", e);
    res.status(500).json({ error: "Failed to fetch current round" });
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

// === SAVE A PLAY — one per user per round ===
app.post("/plays", async (req, res) => {
  try {
    // Telegram-verified user (set by telegramAuth middleware)
    const tgUserId = req.tgUser?.id ? String(req.tgUser.id) : null;
    if (!tgUserId) {
      return res.status(401).json({ ok: false, error: "Telegram auth required" });
    }

    // Find the active round
    const { rows: [round] } = await pool.query(
      "SELECT id FROM rounds WHERE round_end > now() ORDER BY round_start LIMIT 1"
    );
    if (!round) {
      return res.status(400).json({ ok: false, error: "No active round" });
    }

    // Already submitted?
    const { rows: existing } = await pool.query(
      `SELECT id FROM plays WHERE round_id = $1 AND user_id = $2 LIMIT 1`,
      [round.id, tgUserId]
    );
    if (existing.length) {
      return res.status(409).json({ ok: false, error: "ALREADY_PLAYED", playId: existing[0].id });
    }

    // Pull username + selections from body; server still validates user via header
    const { username, selections } = req.body || {};
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ ok: false, error: "Invalid selections" });
    }

    // chat_id is optional (nullable in DB now)
    const chat_id = req.tgUser?.id || null; // private chats: chat_id === user_id

    const playId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO plays (id, round_id, user_id, chat_id, username, selections)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [playId, round.id, tgUserId, chat_id, username || "anon", JSON.stringify(selections)]
    );

    res.json({ ok: true, playId });
  } catch (err) {
    // If UNIQUE constraint is in place, catch race conditions gracefully
    if (err?.code === "23505") {
      return res.status(409).json({ ok: false, error: "ALREADY_PLAYED" });
    }
    console.error("plays error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});




app.get("/leaderboard", async (req, res) => {
  try {
    // find most recent finished round
    const { rows: rounds } = await pool.query(
      `select id, round_start, round_end
       from rounds
       where round_end < now()
       order by round_end desc
       limit 1`
    );
    if (!rounds.length) return res.json({ ok: true, entries: [], round_date: null, text: "No results yet." });

    const round = rounds[0];

    // Build leaderboard text (legacy string) for TG
    const leaderboardText = await buildLeaderboard(round.id); // already exists :contentReference[oaicite:2]{index=2}

    // Pull top N finished results with portfolios
    const { rows } = await pool.query(
      `select r.user_id, coalesce(t.username, r.user_id::text) as username,
              r.pnl, r.portfolio
       from round_results r
       left join telegram_users t on t.user_id::text = r.user_id::text
       where r.round_id = $1
       order by r.pnl desc
       limit 10`,
      [round.id]
    );

    // Gather unique token addresses from top entries
    const addresses = [...new Set(rows.flatMap(r => (JSON.parse(r.portfolio) || []).map(s => s.address)))];

    // Price map for entry/exit
    const priceMap = await firstLastPrices(addresses, round.round_start, round.round_end);

    // Decorate selections with entry/exit/pnl and add counts
    const entries = rows.map(r => {
      const raw = JSON.parse(r.portfolio || "[]");
      const selections = decorateSelectionsWithPnl(raw, priceMap);
      const longs = selections.filter(s => s.direction === "long").length;
      const shorts = selections.length - longs;
      return {
        user_id: r.user_id,
        player: r.username,
        pnl: Number(r.pnl),
        longs,
        shorts,
        selections // [{address,symbol,name,logoURI,direction,entry,exit,pnl}]
      };
    });

    // Add "me" (rank + pnl) if requester is a TG user
    const meId = req.tgUser?.id?.toString() || null;
    let me = null;
    if (meId) {
      const { rows: all } = await pool.query(
        `select r.user_id, r.pnl,
                row_number() over(order by r.pnl desc) as rank,
                count(*) over() as total
         from round_results r
         where r.round_id = $1`,
        [round.id]
      );
      const mine = all.find(x => x.user_id?.toString() === meId);
      if (mine) me = { rank: Number(mine.rank), total: Number(mine.total), pnl: Number(mine.pnl) };
    }

    res.json({
      ok: true,
      round_date: new Date(round.round_end).toISOString().slice(0,10),
      entries,
      me,
      text: leaderboardText
    });
  } catch (e) {
    console.error("leaderboard error", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});



// ---------- READ: live PnL for a round ----------
app.get("/rounds/:id/live-pnl", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `select l.user_id,
              coalesce(t.username, l.user_id::text) as username,
              l.pnl,
              l.last_updated
       from live_pnl l
       left join telegram_users t on t.user_id::text = l.user_id::text
       where l.round_id = $1
       order by l.pnl desc`,
      [id]
    );

    res.json({ ok: true, live: rows });
  } catch (e) {
    console.error("live-pnl error:", e);
    res.status(500).json({ ok: false, error: e.message });
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



