"use strict";

const path = require("path");
const fs = require("fs");

const HAIKU_INPUT_PER_MTOK_USD = 1.0;
const HAIKU_OUTPUT_PER_MTOK_USD = 5.0;
const ENABLED = process.env.ECODIA_INDEXER_SUMMARISE !== "off";
const MODEL_ID = process.env.ECODIA_INDEXER_HAIKU || "claude-haiku-4-5-20251001";

let _client = null;
function getClient() {
  if (_client) return _client;
  let key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
      const txt = fs.readFileSync(envPath, "utf8");
      const m = /^ANTHROPIC_API_KEY=(.*)$/m.exec(txt);
      if (m) key = m[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  if (!key) return null;
  let mod;
  try {
    mod = require("@anthropic-ai/sdk");
  } catch (_) {
    try {
      mod = require(path.join(__dirname, "..", "node_modules", "@anthropic-ai", "sdk"));
    } catch (e) {
      return null;
    }
  }
  const Ctor = mod && mod.Anthropic ? mod.Anthropic : mod;
  _client = new Ctor({ apiKey: key });
  return _client;
}

function buildPrompt(filePath, language, content, symbols) {
  const head = (content || "").slice(0, 6000);
  const symList = (symbols || []).slice(0, 20).map((s) => "- " + s.kind + " " + s.name).join("\n");
  return [
    "Summarise this source file in EXACTLY 50 words or fewer. State purpose, key functions, and how it fits the surrounding system.",
    "Plain prose. No headings, no lists, no markdown. No em-dashes (substitute with space-hyphen-space).",
    "",
    "FILE: " + filePath,
    "LANGUAGE: " + language,
    "TOP SYMBOLS:",
    symList || "(none extracted)",
    "",
    "CONTENT (first 6000 chars):",
    head,
  ].join("\n");
}

async function summariseFile(opts) {
  if (!ENABLED) return { summary: null, costCents: 0, model: null, skipped: "disabled" };
  const client = getClient();
  if (!client) return { summary: null, costCents: 0, model: null, skipped: "no_key" };

  const prompt = buildPrompt(opts.filePath, opts.language || "unknown", opts.content || "", opts.symbols || []);
  try {
    const resp = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    let text = "";
    for (const block of resp.content || []) {
      if (block.type === "text") text += block.text;
    }
    text = text.trim().replace(/—/g, " - ").replace(/–/g, "-");
    const usage = resp.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const usd = (inTok / 1e6) * HAIKU_INPUT_PER_MTOK_USD + (outTok / 1e6) * HAIKU_OUTPUT_PER_MTOK_USD;
    return { summary: text.slice(0, 600), costCents: usd * 100, model: MODEL_ID, tokens: { in: inTok, out: outTok } };
  } catch (err) {
    return { summary: null, costCents: 0, model: null, skipped: "error:" + err.message };
  }
}

module.exports = { summariseFile, MODEL_ID };
