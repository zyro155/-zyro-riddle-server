// Zyro Riddle Server — OpenAI-compatible proxy for the Zyro HUD (Steal a Brainrot)
// The Zyro script POSTs a riddle here; this server adds the riddle-solver system
// prompt (prompt.txt) and forwards it to a free LLM provider (Groq by default).

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));

// ------------------------------------------------------------------
// CONFIG (set these as Environment Variables on Render)
// ------------------------------------------------------------------
// LLM_API_KEY        (required)  your provider key
// UPSTREAM_BASE_URL  (optional)  default Groq. OpenRouter: https://openrouter.ai/api
// MODEL              (optional)  default llama-3.3-70b-versatile (Groq)
const UPSTREAM_BASE = (process.env.UPSTREAM_BASE_URL || "https://api.groq.com/openai").replace(/\/+$/, "");
const UPSTREAM_CHAT_PATH = process.env.UPSTREAM_CHAT_PATH || "/v1/chat/completions"; // Gemini uses "/chat/completions"
const UPSTREAM_KEY  = process.env.LLM_API_KEY || "";
const MODEL         = process.env.MODEL || "llama-3.3-70b-versatile";

// Optional "live" facts the solver uses for "right now / this month / currently".
const LIVE_STATE =
  'Current update: UPDATE59 (Crystal Update, 25 July 2026). Newest mutation: CRYSTAL. ' +
  'Featured events: Crystal Event, Spain Event. Treat "right now / this month / currently / today" using this.';

// ------------------------------------------------------------------
// Load + clean the riddle-solver prompt (your traced riddle solver ai.txt)
// ------------------------------------------------------------------
let SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "prompt.txt"), "utf8")
  .replace(/%s/g, "")                        // drop Lua format placeholders
  .replace(/^\s*",\s*$/m, "")                // drop the ", source artifact
  .replace(/^\s*"GAME:/m, "GAME:")           // strip leading quote on game data
  .replace("=== LIVE STATE ===", "=== LIVE STATE ===\n" + LIVE_STATE)
  .trim();

// ------------------------------------------------------------------
// Shrink for free-tier token limits (Groq free = 12k tokens/min).
// Drop bulky sections riddles never use, and the per-brainrot price/income
// numbers — the brainrot NAMES, SOURCES, events and update history stay.
// ------------------------------------------------------------------
if (process.env.TRIM_PROMPT !== "0") {
  const DROP_PREFIXES = [
    "SHOP:", "SHOPITEMS:", "RODSSHOPITEMS:", "ITEMS:", "BASES:", "LUCKICONS:",
    "EGGROTZONENAMES:", "EXTINCTMACHINE:", "FUSEMACHINEDATA:", "CRYSTALSPINWHEEL:",
    "PHANTOMSPINWHEEL:", "MERCHANTDATA:", "CANDYMERCHANTDATA:", "SANTAMERCHANTDATA:",
    "MERCHSHOPDATA:", "JUMPSHOPDATA:", "VALENTINESSHOP:", "HALLOWEENDATA:",
    "DUELSMODES:", "UNLOCKBASE:", "REBIRTH TIERS",
  ];
  SYSTEM_PROMPT = SYSTEM_PROMPT
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !DROP_PREFIXES.some((p) => t.startsWith(p));
    })
    .join("\n")
    // strip per-brainrot "($17500000, 85000/s)" price/income — keep name + source
    .replace(/\s*\(\$?\d+,\s*\d+\/s\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------------------------------------------------------------------
// Hard output-format reinforcement (small/fast models need this spelled out).
// Appended LAST so it's the most salient instruction the model sees.
// ------------------------------------------------------------------
SYSTEM_PROMPT += "\n\n" + [
  "=== FINAL OUTPUT RULES — THESE OVERRIDE EVERYTHING ABOVE ===",
  "A CODE reply is ONE line: 'CODE:' then the final code, nothing else.",
  "The code is ALL CAPITAL LETTERS with every part joined directly together:",
  "NO spaces, and NEVER write the joining words 'and' / 'plus' / 'or' / '+' / '&' or any punctuation between the parts.",
  "Those joining words in the question are ONLY an instruction to concatenate — they are never part of the code.",
  "Examples (study these):",
  "  'the color of the sky and grass'  -> sky=BLUE, grass=GREEN  -> CODE: BLUEGREEN   (NOT 'blue and green', NOT BLUEANDGREEN)",
  "  'my favorite color plus 67'       -> CODE: GREEN67          (NOT 'GREEN plus 67')",
  "  'red and blue and my name'        -> CODE: REDBLUESAMMY",
  "Only keep letters that are INSIDE a single copied name, e.g. the brainrot 'Ketchuru and Musturu' -> KETCHURUANDMUSTURU.",
].join("\n");

console.log(`[zyro] prompt loaded (${SYSTEM_PROMPT.length} chars) | model=${MODEL} | upstream=${UPSTREAM_BASE}`);

// ------------------------------------------------------------------
// Health check — the Zyro HUD polls this to show online/offline
// ------------------------------------------------------------------
app.get("/", (req, res) => res.status(200).json({ ok: true, service: "zyro-riddle", model: MODEL }));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// ------------------------------------------------------------------
// Main endpoint (OpenAI-compatible) — Zyro POSTs here
// ------------------------------------------------------------------
app.post("/v1/chat/completions", async (req, res) => {
  try {
    if (!UPSTREAM_KEY) {
      return res.status(200).json({ choices: [{ message: { content: "ERROR: LLM_API_KEY not set on the server" } }] });
    }

    // Zyro sends { messages:[{role:'user',content:riddle}], riddle:'...' }
    const body = req.body || {};
    let riddle = body.riddle;
    if (!riddle && Array.isArray(body.messages)) {
      const lastUser = [...body.messages].reverse().find((m) => m && m.role === "user");
      riddle = lastUser && lastUser.content;
    }
    riddle = (riddle || "").toString().trim();
    if (!riddle) {
      return res.status(400).json({ choices: [{ message: { content: "ERROR: no riddle provided" } }] });
    }

    const upstream = await fetch(`${UPSTREAM_BASE}${UPSTREAM_CHAT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${UPSTREAM_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: riddle },
        ],
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    const answer =
      (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data && data.error && data.error.message) ||
      "";

    let clean = (answer || "").trim();

    // Backstop: force a plain CODE to uppercase + no spaces (the game's codes look
    // like that). Leaves ANSWER prose and SEARCH "query | guess" lines untouched.
    {
      const firstLine = (clean.split(/\r?\n/).find((l) => l.trim()) || clean).trim();
      const m = firstLine.match(/^(CODE)\s*:\s*([^|]*)$/i);
      if (m) clean = "CODE: " + m[2].replace(/\s+/g, "").toUpperCase();
    }

    console.log(`[zyro] "${riddle.slice(0, 60)}" -> "${clean.slice(0, 60)}"`);

    // Return OpenAI-shaped so the Zyro client parser reads choices[0].message.content
    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: clean } }],
      answer: clean,
      model: MODEL,
    });
  } catch (err) {
    console.error("[zyro] error:", err && err.message);
    return res.status(200).json({
      choices: [{ message: { content: "ERROR: " + ((err && err.message) || "proxy failure") } }],
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[zyro] riddle server listening on :${PORT}`));
