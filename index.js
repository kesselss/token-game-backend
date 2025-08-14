import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

// Load environment variables from .env
dotenv.config();

const app = express();

// CORS setup: allow frontend to call backend
// While testing, FRONTEND_ORIGIN can be '*' (public)
// Before launch, set it to your Netlify site URL in Railway variables
const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

// Parse incoming JSON bodies
app.use(express.json());

// Connect to Supabase Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Health check endpoint
app.get("/healthz", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "ok", time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Public test endpoint: list first 5 users from DB
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users LIMIT 5");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- NEW: /rounds/today endpoint ----
// For now, return a static list of 5 tokens (later will be dynamic from DB)
const TODAY_TOKENS = [
  {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    logo: "https://icons.llamao.fi/icons/chains/rsz_solana.jpg"
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg"
  },
  {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether",
    logo: "https://cryptologos.cc/logos/tether-usdt-logo.svg"
  },
  {
    address: "4k3Dyjzvzp8eMZWUXbBC7w5b9a8R3K4jzQdp73w3ToZt",
    symbol: "RAY",
    name: "Raydium",
    logo: "https://cryptologos.cc/logos/raydium-ray-logo.svg"
  },
  {
    address: "7dHbWXmci3dT8UFYWYZweBLXGy74XwhTz6htrDeo1b5h",
    symbol: "stSOL",
    name: "Lido Staked SOL",
    logo: "https://cryptologos.cc/logos/solana-sol-logo.svg"
  }
];

app.get("/rounds/today", (_req, res) => {
  const todayUTC = new Date().toISOString().slice(0, 10); // e.g., 2025-08-14
  res.json({
    round_date: todayUTC,
    tokens: TODAY_TOKENS
  });
});
// -------------------------------------

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

