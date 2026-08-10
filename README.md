# Zyro Riddle Server

Tiny OpenAI-compatible proxy that powers the **Riddle AI** panel in the Zyro HUD.
The Zyro script sends it a riddle → this server adds the riddle-solver brain
(`prompt.txt`) → forwards to a **free** LLM (Groq by default) → returns the `CODE:`.

Once deployed, its public URL is what you paste into the Zyro script:
```lua
CONFIG.AI.BaseUrl = "https://YOUR-APP.onrender.com"
```

---

## 1. Get a free LLM key (Groq — recommended)

1. Go to **https://console.groq.com** and sign in (free).
2. **API Keys** → **Create API Key** → copy it (starts with `gsk_...`).

> Prefer OpenRouter instead? Get a key at https://openrouter.ai/keys and see
> "Switching providers" below.

## 2. Put this folder on GitHub

From inside `zyro-riddle-server/`:
```bash
git init
git add .
git commit -m "Zyro riddle server"
```
Create an empty repo on GitHub, then:
```bash
git remote add origin https://github.com/<you>/zyro-riddle-server.git
git push -u origin main
```

## 3. Deploy on Render

1. Go to **https://render.com** → **New +** → **Web Service** → connect the repo.
2. Settings (most are auto-detected):
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
3. **Environment** → add variables:
   | Key            | Value                          |
   |----------------|--------------------------------|
   | `LLM_API_KEY`  | your `gsk_...` key (required)   |
   | `MODEL`        | `llama-3.3-70b-versatile` (optional) |
4. **Create Web Service** and wait for the build to finish.
5. Copy the URL at the top, e.g. `https://zyro-riddle.onrender.com`.

## 4. Point Zyro at it

In `auto code zyro.txt`:
```lua
CONFIG.AI.BaseUrl = "https://zyro-riddle.onrender.com"   -- your Render URL
-- ChatPath / HealthPath stay as they are; ApiKey can stay "" (the key lives on Render)
```
Re-run the script — the **Riddle AI** panel should flip to **"online ✓"**.

---

## Test it (optional)

Health:
```bash
curl https://YOUR-APP.onrender.com/
```
Solve a riddle:
```bash
curl -X POST https://YOUR-APP.onrender.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"riddle":"my favorite color plus 67 plus my name"}'
```

## Switching providers (OpenRouter)

Add these env vars on Render instead:
| Key                 | Value                                        |
|---------------------|----------------------------------------------|
| `LLM_API_KEY`       | your OpenRouter key                          |
| `UPSTREAM_BASE_URL` | `https://openrouter.ai/api`                  |
| `MODEL`             | `meta-llama/llama-3.3-70b-instruct:free`     |

## Notes

- **Cold start:** Render's free tier sleeps after ~15 min idle; the first request
  then takes ~30–50s. While the HUD is open its health-ping keeps the server awake.
- `prompt.txt` is your `traced riddle solver ai.txt`. Edit it to change the AI's
  knowledge/rules, commit, and Render redeploys automatically.
- The key lives only on Render (never in the Roblox script).
