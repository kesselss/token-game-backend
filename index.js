import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

// ---------- ENV ----------
dotenv.config();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

// Allow your Netlify site (adjust as needed)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://charming-dieffenbachia-a9e8f1.netlify.app";

// ---------- Telegram constants & helper ----------
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const FRONTEND_URL = process.env.FRONTEND_URL || FRONTEND_ORIGIN; // fallback

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


// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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


// Telegram webhook endpoint
app.post("/telegram/webhook", async (req, res) => {
  console.log("Telegram update:", req.body);

  const update = req.body || {};
  const msg = update.message || update.edited_message;

  if (msg?.text?.startsWith("/start")) {
    const chat_id = msg.chat.id;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: "🚀 Meme Draft is ready. Tap to play:",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Play Meme Draft", web_app: { url: FRONTEND_URL } }
          ]]
        }
      })
    });
  }

  res.json({ ok: true }); // must always reply 200
});



// --- CORS ---
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-cron-secret", "X-Telegram-InitData", "x-telegram-initdata"]
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

// ---------- Birdeye: fetch top meme tokens ----------
async function fetchTopMemeTokens(limit = 20, minVolume = 10000) {
  const url = `https://public-api.birdeye.so/defi/v3/token/meme/list?sort_by=volume_24h_usd&sort_type=desc&limit=${limit}&min_volume_24h_usd=${minVolume}`;
  const res = await fetch(url, { headers: BE_HEADERS });
  if (!res.ok) throw new Error(`Birdeye error ${res.status}`);
  const json = await res.json();
  return json?.data?.items || [];
}


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

// ---------- CRON: pull daily token list + cache snapshots ----------
app.post("/cron/pull", async (req, res) => {
  try {
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!BIRDEYE_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing BIRDEYE_API_KEY" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch today’s top 20 meme tokens by 24h volume
    const topTokens = await fetchTopMemeTokens(20, 10000);

    if (!Array.isArray(topTokens) || !topTokens.length) {
      return res.status(500).json({ ok: false, error: "No tokens returned from Birdeye" });
    }

    // 2. Save list into daily_token_lists (one per day)
    await pool.query(
      `insert into daily_token_lists (round_date, tokens)
       values ($1, $2)
       on conflict (round_date) do update set tokens = excluded.tokens`,
      [today, JSON.stringify(topTokens)]
    );

    // 3. Fetch + cache snapshots/history for each token
    let pulled = 0;
    for (const t of topTokens) {
      try {
        const snap = await fetchTokenSnapshot(t.address);
        await upsertTokenSnapshot(snap);

        const hist = await fetchHistoryPoints(t.address);
        if (hist.length) await insertHistoryRows(t.address, hist);

        pulled++;
      } catch (e) {
        console.error("pull error for", t.address, e.message);
      }
      await new Promise((r) => setTimeout(r, 120)); // small pacing
    }

    res.json({ ok: true, saved: topTokens.length, pulled });
  } catch (e) {
    console.error("Cron pull failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ---------- READ: round of 5 from today's top 20 ----------
app.get("/rounds/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Load today’s token list from DB
    const { rows } = await pool.query(
      `select tokens
       from daily_token_lists
       where round_date = $1
       limit 1`,
      [today]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No token list available for today. Cron may not have run yet." });
    }

    const tokenList = rows[0].tokens; // this is the JSON array of 20 tokens

    if (!Array.isArray(tokenList) || tokenList.length === 0) {
      return res.status(500).json({ error: "Invalid token list data" });
    }

    // 2. Shuffle and pick 5 random tokens
    const shuffled = tokenList.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    // 3. Normalize fields to match frontend expectations
    const tokens = selected.map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      logoURI: t.logo_uri || "",
      price: t.price ?? 0,
      marketcap: t.market_cap ?? 0,
      liquidity: t.liquidity ?? 0,
      volume24h: t.volume_24h_usd ?? 0,
      priceChange24h: t.price_change_24h_percent ?? 0,
      holders: t.holder ?? 0,
      top10HolderPercent: null,   // not available from meme/list
      launchedAt: t.listing_time ? new Date(t.listing_time * 1000) : null,
      updated_at: new Date()
    }));

    res.json({ round_date: today, tokens });
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

// ---------- WRITE: submit a play (with debug logs) ----------
// ------ Save a play (user's selections) ----------
app.post("/plays", async (req, res) => {
  try {
    const { selections } = req.body;
    
    // Log the incoming headers to debug the initData
    console.log("--- /plays Request Log ---");
    console.log("Received X-Telegram-InitData:", req.get('X-Telegram-InitData'));
    console.log("Received X-Telegram-InitDataUnsafe:", req.get('X-Telegram-InitDataUnsafe'));
    console.log("Backend-parsed Telegram user (should not be null):", req.tgUser);
    console.log("----------------------------------");

    if (!req.tgUser) {
      return res.status(401).json({ ok: false, error: "Unauthorized: Telegram user not found in request" });
    }

    if (!selections || !Array.isArray(selections)) {
      return res.status(400).json({ ok: false, error: "Invalid selections data" });
    }

    // Prepare data for the database
    const playId = crypto.randomUUID();
    const userId = req.tgUser.id.toString();
    const username = req.tgUser.username || req.tgUser.first_name || `user-${userId}`;
    const timestamp = new Date();

    // Store the play in the database
    await pool.query(
      "INSERT INTO plays (id, user_id, username, timestamp, selections) VALUES ($1, $2, $3, $4, $5)",
      [playId, userId, username, timestamp, JSON.stringify(selections)]
    );

    res.json({ ok: true, message: "Play saved successfully", playId });
  } catch (e) {
    console.error("/plays error:", e);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});


// ---------- READ: leaderboard (24h cycle, ranked by PnL) ----------
app.get("/leaderboard", async (_req, res) => {
  try {
    // Get most recent play per user within today’s UTC cycle
    const playsQ = `
      select distinct on (user_id) id, user_id, username, selections, timestamp
      from plays
      where timestamp >= date_trunc('day', now() at time zone 'utc')
      order by user_id, timestamp desc
    `;
    const { rows } = await pool.query(playsQ);

    const entries = [];

    for (const play of rows) {
      const selections = play.selections || [];
      let totalPnl = 0;
      let count = 0;

      for (const sel of selections) {
        const { address, direction } = sel;
        if (!address) continue;

        // Entry = closest snapshot at or before play.timestamp
        const { rows: entry } = await pool.query(
          `select price from token_history
           where address=$1 and ts <= $2
           order by ts desc limit 1`,
          [address, play.timestamp]
        );

        // Exit = latest snapshot (most recent price)
        const { rows: exit } = await pool.query(
          `select price from token_history
           where address=$1
           order by ts desc limit 1`,
          [address]
        );

        if (entry.length && exit.length) {
          let pnl = ((exit[0].price - entry[0].price) / entry[0].price) * 100;
          if (direction === "short") pnl *= -1;
          totalPnl += pnl;
          count++;
        }
      }

      const avgPnl = count ? totalPnl / count : 0;
      const longs = selections.filter(s => s.direction === "long").length;
      const shorts = selections.filter(s => s.direction === "short").length;

      entries.push({
        user_id: play.user_id,
        player: play.username,
        pnl: avgPnl,
        longs,
        shorts,
        selections
      });
    }

    // Sort by pnl descending
    entries.sort((a, b) => b.pnl - a.pnl);

    res.json({
      round_date: new Date().toISOString().slice(0, 10),
      entries
    });
  } catch (e) {
    console.error("Error loading leaderboard:", e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});



// ---------- Telegram Webhook ----------
app.post("/telegram/webhook", async (req, res) => {
  try {
    // Verify Telegram's secret token (set when you call setWebhook)
    const hdr = req.get("x-telegram-bot-api-secret-token") || req.get("X-Telegram-Bot-Api-Secret-Token");
    if (TELEGRAM_WEBHOOK_SECRET && hdr !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message || null;

    // Handle /start
    if (msg?.text?.startsWith("/start")) {
      const chat_id = msg.chat.id;
      await tgApi("sendMessage", {
        chat_id,
        text: "🚀 Meme Draft is ready. Tap to play:",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Play Meme Draft", web_app: { url: FRONTEND_URL } }
          ]]
        }
      });
    }

    // No-op for other updates
    res.json({ ok: true });
  } catch (e) {
    console.error("telegram/webhook error:", e);
    res.status(200).json({ ok: true }); // don't make Telegram retry forever
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




