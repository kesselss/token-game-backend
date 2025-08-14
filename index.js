import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

// Health check route
app.get("/healthz", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Test endpoint for today's round
app.get("/rounds/today", (req, res) => {
  res.json({
    round_date: new Date().toISOString().split("T")[0],
    tokens: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        logoURI: "https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=025"
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        logoURI: "https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025"
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

