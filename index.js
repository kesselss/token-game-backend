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
const PLAY_URL = "https://degendle.com/daily-game/";


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
  const url = `https://public-api.birdeye.so/defi/history_price?address=${address}&address_type=token&type=5m&time_from=${oneDayAgo}&time_to=${now}&ui_amount_mode=raw`;
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

// ---------- Update live PnL for an active round ----------
async function updateLivePnL(round) {
  // fetch all plays in this round
  const { rows: plays } = await pool.query(
    `SELECT id, user_id, chat_id, selections
     FROM plays
     WHERE round_id = $1`,
    [round.id]
  );

  for (const play of plays) {
    // calculate using your real calculatePnL
    const pnl = await calculatePnL(play.selections, round);

    await pool.query(
      `INSERT INTO live_pnl (round_id, user_id, pnl)
       VALUES ($1, $2, $3)
       ON CONFLICT (round_id, user_id)
       DO UPDATE SET pnl = EXCLUDED.pnl, last_updated = now()`,
      [round.id, play.user_id, pnl]
    );
  }

  console.log(`📊 Updated live PnL for round ${round.id}`);
}



async function startNewRound() {
  const now = new Date();
  // Align to the current hour block
  const start = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  // Load today's token list
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `select tokens from daily_token_lists where round_date = $1 limit 1`,
    [today]
  );
  if (!rows.length) throw new Error("No daily tokens found for today");

  // Pick 5 random tokens
  const tokenList = rows[0].tokens;
  const shuffled = tokenList.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 5);

  // Save new round
  const { rows: inserted } = await pool.query(
    `insert into rounds (round_start, round_end, tokens)
     values ($1, $2, $3)
     returning id, round_start, round_end`,
    [start.toISOString(), end.toISOString(), JSON.stringify(selected)]
  );

  // Broadcast to all Telegram users
  const { rows: users } = await pool.query(`select chat_id from telegram_users`);
  for (const u of users) {
    try {
      await tgApi("sendMessage", {
        chat_id: u.chat_id,
        text: `🚀 New round has started!\nYou have 1 hour to play.\n\nTap to join:`,
        reply_markup: {
          inline_keyboard: [[
            { text: "🎮 Play Now", web_app: { url: FRONTEND_URL } }
          ]]
        }
      });
    } catch (e) {
      console.error("Failed to notify user", u.chat_id, e.message);
    }
  }

  return inserted[0];
}


// === FINISH A ROUND ===
async function finishRound(round) {
  try {
    console.log(`⚡ Finishing round ${round.id}`);

    // 1. Fetch all plays for this round (chat_id comes directly from plays)
    const { rows: plays } = await pool.query(
      `SELECT p.id, p.round_id, p.user_id, p.username, p.selections, p.chat_id
       FROM plays p
       WHERE p.round_id = $1`,
      [round.id]
    );

    if (!plays.length) {
      console.log("No plays found for this round.");
      await pool.query(`UPDATE rounds SET results_sent = true WHERE id = $1`, [round.id]);
      // Clean up any leftover live_pnl just in case
      await pool.query(`DELETE FROM live_pnl WHERE round_id = $1`, [round.id]);
      return;
    }

    // 2. Calculate final PnL for each play
    for (const play of plays) {
      const pnl = await calculatePnL(play.selections, round);

      await pool.query(
        `INSERT INTO round_results (round_id, user_id, chat_id, portfolio, pnl, choices)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (round_id, user_id) DO UPDATE
         SET portfolio = EXCLUDED.portfolio,
             pnl = EXCLUDED.pnl,
             choices = EXCLUDED.choices`,
        [
          round.id,
          play.user_id,
          play.chat_id,
          JSON.stringify(play.selections),
          pnl,
          JSON.stringify(play.selections)
        ]
      );
    }

    console.log(`✅ Round ${round.id} finished and results saved.`);

    // 3. Build leaderboard for this round
    const { rows: leaderboard } = await pool.query(
      `SELECT COALESCE(t.username, r.user_id::text) AS username, r.pnl
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

    // 4. Send results to every participant of this round
    for (const play of plays) {
      await tgApi("sendMessage", {
        chat_id: play.chat_id,
        text: message
      });
    }

    // 5. Mark round as finished
    await pool.query(`UPDATE rounds SET results_sent = true WHERE id = $1`, [round.id]);

    // 6. Clean up live_pnl for this round
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
      const round = await getCurrentRound();

      if (!round) {
        await tgApi("sendMessage", {
          chat_id,
          text: "⏳ No active round right now. A new one will start soon!"
        });
      } else {
        const { rows } = await pool.query(
          `select coalesce(t.username, l.user_id::text) as username,
                  l.pnl
           from live_pnl l
           left join telegram_users t on t.user_id::text = l.user_id::text
           where l.round_id = $1
           order by l.pnl desc
           limit 10`,
          [round.id]
        );

        if (!rows.length) {
          await tgApi("sendMessage", {
            chat_id,
            text: "No plays yet this round."
          });
        } else {
          let message = `📊 Live Standings (Round ends at ${new Date(
            round.round_end
          ).toLocaleTimeString()})\n\n`;
          rows.forEach((row, i) => {
            message += `${i + 1}. ${row.username} — ${parseFloat(
              row.pnl
            ).toFixed(2)}%\n`;
          });

          await tgApi("sendMessage", {
            chat_id,
            text: message
          });
        }
      }
    }

    // Handle /leaderboard
    if (msg?.text?.startsWith("/leaderboard")) {
      const chat_id = msg.chat.id;

      // Get most recent finished round
      const { rows: lastRound } = await pool.query(
        `select * from rounds 
         where results_sent = true 
         order by round_end desc 
         limit 1`
      );

      if (!lastRound.length) {
        await tgApi("sendMessage", {
          chat_id,
          text: "No finished rounds yet."
        });
      } else {
        const round = lastRound[0];
        const { rows } = await pool.query(
          `select coalesce(t.username, r.user_id::text) as username,
                  r.pnl
           from round_results r
           left join telegram_users t on t.user_id::text = r.user_id::text
           where r.round_id = $1
           order by r.pnl desc
           limit 10`,
          [round.id]
        );

        if (!rows.length) {
          await tgApi("sendMessage", {
            chat_id,
            text: "No results for that round."
          });
        } else {
          let message = `🏆 Leaderboard (Round ended at ${new Date(
            round.round_end
          ).toLocaleTimeString()})\n\n`;
          rows.forEach((row, i) => {
            message += `${i + 1}. ${row.username} — ${parseFloat(
              row.pnl
            ).toFixed(2)}%\n`;
          });

          await tgApi("sendMessage", {
            chat_id,
            text: message
          });
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
  // Align to the current hour block
  const start = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

  // 1) Load today’s token list
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `select tokens from daily_token_lists where round_date = $1 limit 1`,
    [today]
  );
  if (!rows.length) throw new Error("No daily tokens available. Did cron run?");

  const tokenList = rows[0].tokens;

  // 2) Shuffle and pick 5 tokens
  const shuffled = tokenList.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 5);

  // 3) Save new round
  const { rows: inserted } = await pool.query(
    `insert into rounds (round_start, round_end, tokens)
     values ($1, $2, $3)
     returning id, round_start, round_end, tokens`,
    [start.toISOString(), end.toISOString(), JSON.stringify(selected)]
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



app.get("/rounds/current", async (_req, res) => {
  try {
    let round = await getCurrentRound();
    if (!round) {
      round = await createNewRound();
    }

    // Transform the raw Birdeye data to match frontend schema
    const transformedTokens = (round.tokens || []).map(token => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      logoURI: token.logo_uri,  // logo_uri -> logoURI
      price: token.price,
      marketcap: token.market_cap,  // market_cap -> marketcap
      liquidity: token.liquidity,
      volume24h: token.volume_24h_usd,  // volume_24h_usd -> volume24h
      priceChange24h: token.price_change_24h_percent,  // price_change_24h_percent -> priceChange24h
      holders: token.holder,  // holder -> holders
      top10HolderPercent: null, // Not available in meme list API
      launchedAt: token.meme_info?.creation_time ? new Date(token.meme_info.creation_time * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    }));

    res.json({
      id: round.id,
      start: round.round_start,
      end: round.round_end,
      tokens: transformedTokens
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

// ---------- WRITE: submit a play (with debug logs) ----------
// ------ Save a play (user's selections) ----------
// ---------- Save Player's Play ----------
// === SAVE A PLAY ===
app.post("/plays", async (req, res) => {
  try {
    const { user_id, username, selections } = req.body;

    // fetch current round
    const { rows: [round] } = await pool.query(
      "SELECT id FROM rounds WHERE round_end > now() ORDER BY round_start LIMIT 1"
    );
    if (!round) {
      return res.status(400).json({ ok: false, error: "No active round" });
    }

    const playId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO plays (id, round_id, user_id, chat_id, username, selections)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [playId, round.id, user_id, req.tgUser?.id || null, username, JSON.stringify(selections)]
    );

    res.json({ ok: true, playId });
  } catch (err) {
    console.error("plays error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});







// ---------- READ: leaderboard (24h cycle, ranked by PnL) ----------
// ---------- Leaderboard ----------
// ---------- Leaderboard ----------
// ---------- Leaderboard API ----------
app.get("/leaderboard", async (req, res) => {
  try {
    // Find the most recent finished round
    const { rows: rounds } = await pool.query(
      `select id
       from rounds
       where round_end < now()
       order by round_end desc
       limit 1`
    );

    if (!rounds.length) {
      return res.json({ ok: true, leaderboard: [] });
    }

    const roundId = rounds[0].id;

    // Reuse buildLeaderboard()
    const leaderboardText = await buildLeaderboard(roundId);

    // Also return structured data for frontend
    const { rows } = await pool.query(
      `select t.username, r.pnl
       from round_results r
       join telegram_users t on t.chat_id = r.chat_id
       where r.round_id = $1
       order by r.pnl desc
       limit 10`,
      [roundId]
    );

    res.json({
      ok: true,
      leaderboard: rows,
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




