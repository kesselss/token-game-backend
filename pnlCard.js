// pnlCard.js — ES Module with optional background image
import { createCanvas, loadImage } from "canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BG_PATH = path.join(__dirname, "assets", "pnl-bg.png");

/**
 * Generate a PNG buffer for a PnL card.
 *
 * @param {Object} options
 * @param {string} options.playerName
 * @param {number} options.rank
 * @param {number} options.totalPlayers
 * @param {number} options.totalPct                  // total PnL % (e.g., 12.34 or -5.67)
 * @param {Array<Object>} options.selections         // [{ symbol, name, logo, direction, entry, exit, pnl }]
 * @param {string} [options.title="Live PnL"]        // header title
 * @param {string} [options.backgroundPath]          // optional absolute/relative path to bg image
 * @returns {Promise<Buffer>}                        // PNG buffer
 */
export async function generatePnLCard({
  playerName = "Player",
  rank = 0,
  totalPlayers = 0,
  totalPct = 0,
  selections = [],
  title = "Live PnL",
  backgroundPath
} = {}) {
  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ---------- Background: image if available, else gradient ----------
  let drewBg = false;
  const bgPath = backgroundPath || DEFAULT_BG_PATH;
  try {
    const bgImg = await loadImage(bgPath);
    // scale to full canvas (800x600 will scale to 1000x600 fine)
    ctx.drawImage(bgImg, 0, 0, width, height);
    drewBg = true;
  } catch {
    // ignore if file not found; we’ll draw our gradient fallback
  }
  if (!drewBg) {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0e1222");
    bg.addColorStop(1, "#161b33");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle vignette
    ctx.globalAlpha = 0.35;
    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, 80, width / 2, height / 2, Math.max(width, height)
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  // ---------- Helpers ----------
  const fontFamily = "Changa, sans-serif"; // assumed available system font
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const fmtPct = (n) => (n >= 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`);
  const fmtPrice = (v) => {
    if (v == null || Number.isNaN(v)) return "—";
    const abs = Math.abs(v);
    if (abs === 0) return "0";
    if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (abs >= 1) return v.toFixed(4).replace(/\.?0+$/, "");
    const str = v.toPrecision(7);
    return str.replace(/(\.\d*?[1-9])0+e/, "$1e").replace(/\.0+$/, "");
  };
  const drawRoundedRect = (x, y, w, h, r) => {
    r = clamp(r, 0, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const drawChip = (text, x, y, color) => {
    ctx.save();
    ctx.font = `700 18px ${fontFamily}`;
    const padX = 12;
    const padY = 6;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2;
    const h = 28;
    drawRoundedRect(x, y, w, h, 14);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#0d0f1a";
    ctx.fillText(text, x + padX, y + h - padY);
    ctx.restore();
    return { w, h };
  };
  async function tryLoad(url) {
    if (!url) return null;
    try {
      return await loadImage(url);
    } catch {
      return null;
    }
  }

  // ---------- Header ----------
  ctx.fillStyle = "#ffd54a";
  ctx.font = `700 34px ${fontFamily}`;
  ctx.fillText(title, 40, 70);


  // Player + rank
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 28px ${fontFamily}`;
  ctx.fillText(playerName, 40, 112);

  ctx.font = `500 20px ${fontFamily}`;
  if (rank && totalPlayers) {
    ctx.fillStyle = "#c5cae9";
    ctx.fillText(`Rank: #${rank}/${totalPlayers}`, 40, 142);
  }

  // Big total PnL chip
  const isUp = totalPct >= 0;
  const pnlChip = fmtPct(totalPct);
  const chipColor = isUp ? "#18e59f" : "#ff6b6b";

  ctx.font = `800 56px ${fontFamily}`;
  ctx.fillStyle = chipColor;
  ctx.fillText(pnlChip, 40, 195);

  // Optional “Long/Short mix” chip
  const longCount = selections.filter(s => s?.direction === "long").length;
  const shortCount = selections.filter(s => s?.direction === "short").length;
drawChip(`${longCount} long`, 40, 220, "#1ee3b1");
drawChip(`${shortCount} short`, 150, 220, "#ff9da1");


  // ---------- Table ----------
  const cardX = 32;
  const cardY = 270;
  const cardW = width - cardX * 2;
  const cardH = height - cardY - 30;

  drawRoundedRect(cardX, cardY, cardW, cardH, 18);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();

  const colLogoX = cardX + 18;
  const colSymbolX = colLogoX + 52;
  const colDirX = colSymbolX + 220;
  const colEntryExitX = colDirX + 160;
  const colPnlX = cardX + cardW - 96;

  ctx.fillStyle = "#ffd54a";
  ctx.font = `700 18px ${fontFamily}`;
  const headerY = cardY + 34;
  ctx.fillText("Token", colSymbolX, headerY);
  ctx.fillText("Dir", colDirX, headerY);
  ctx.fillText("Entry → Exit", colEntryExitX, headerY);
  ctx.fillText("PnL%", colPnlX, headerY);

  const rowStartY = headerY + 18;
  const rowHeight = 48;
  const maxRows = Math.min(6, selections.length || 0);
  const rows = selections.slice(0, maxRows);

  const logos = await Promise.all(rows.map(r => tryLoad(r.logo)));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const y = rowStartY + (i + 1) * rowHeight;

    // Row divider
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 12, y - rowHeight + 16);
    ctx.lineTo(cardX + cardW - 12, y - rowHeight + 16);
    ctx.stroke();

    // Logo cell
    ctx.save();
    drawRoundedRect(colLogoX, y - 40, 40, 40, 10);
    ctx.clip();
    const img = logos[i];
    if (img) ctx.drawImage(img, colLogoX, y - 40, 40, 40);
    else {
      ctx.fillStyle = "#252b4a";
      ctx.fillRect(colLogoX, y - 40, 40, 40);
      ctx.fillStyle = "#8791c7";
      ctx.font = `700 18px ${fontFamily}`;
      const letter = (r.symbol || "?").slice(0, 1).toUpperCase();
      const tw = ctx.measureText(letter).width;
      ctx.fillText(letter, colLogoX + (40 - tw) / 2, y - 40 + 28);
    }
    ctx.restore();

    // Symbol + name
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 22px ${fontFamily}`;
    const sym = (r.symbol || r.name || "—").toUpperCase();
    ctx.fillText(sym, colSymbolX, y - 10);

    ctx.fillStyle = "#aab1e6";
    ctx.font = `500 14px ${fontFamily}`;
    const nm = r.name && r.name !== r.symbol ? r.name : "";
    if (nm) ctx.fillText(nm, colSymbolX, y + 8);

    // Direction
    const dir = r.direction === "short" ? "SHORT" : "LONG";
    ctx.fillStyle = r.direction === "short" ? "#ff9da1" : "#1ee3b1";
    ctx.font = `700 18px ${fontFamily}`;
    ctx.fillText(dir, colDirX, y - 10);

    // Entry → Exit
    ctx.fillStyle = "#e7e9ff";
    ctx.font = `600 16px ${fontFamily}`;
    const entryStr = fmtPrice(r.entry);
    const exitStr = fmtPrice(r.exit);
    ctx.fillText(`${entryStr} → ${exitStr}`, colEntryExitX, y - 10);

    // PnL %
    const pn = Number(r.pnl ?? 0);
    ctx.fillStyle = pn >= 0 ? "#18e59f" : "#ff6b6b";
    ctx.font = `800 20px ${fontFamily}`;
    const pnStr = fmtPct(pn);
    const tw = ctx.measureText(pnStr).width;
    ctx.fillText(pnStr, colPnlX - tw, y - 10);
  }

  return canvas.toBuffer("image/png");
}
