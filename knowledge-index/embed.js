"use strict";

// Local sentence embeddings via @xenova/transformers (bge-small-en-v1.5,
// 384-dim, CPU, offline after first model download). Pure node, no native
// extension, no cloud. The dense leg of the hybrid retrieval stack; cosine is
// computed brute-force in JS over ~1150 vectors (sub-ms at this scale), so no
// sqlite-vec dependency is needed.
//
// @xenova/transformers v2 is ESM; this file is CommonJS, so the pipeline is
// loaded via dynamic import() inside an async singleton.

const MODEL = "Xenova/bge-small-en-v1.5";
const DIM = 384;

let _pipe = null;
let _loading = null;

async function getPipe() {
  if (_pipe) return _pipe;
  if (_loading) return _loading;
  _loading = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    // keep the model + cache local to this dir (offline, predictable path)
    env.allowRemoteModels = true; // first run downloads; then cached
    env.cacheDir = require("path").join(__dirname, ".models");
    _pipe = await pipeline("feature-extraction", MODEL);
    return _pipe;
  })();
  return _loading;
}

// Embed one string -> Float32Array(384), mean-pooled + L2-normalized.
async function embed(text) {
  const pipe = await getPipe();
  const out = await pipe(String(text || "").slice(0, 4000), { pooling: "mean", normalize: true });
  return Float32Array.from(out.data);
}

// Embed many strings sequentially (memory-safe for a one-shot index pass).
async function embedMany(texts, onProgress) {
  const pipe = await getPipe();
  const vecs = [];
  for (let i = 0; i < texts.length; i++) {
    const out = await pipe(String(texts[i] || "").slice(0, 4000), { pooling: "mean", normalize: true });
    vecs.push(Float32Array.from(out.data));
    if (onProgress && i % 50 === 0) onProgress(i, texts.length);
  }
  return vecs;
}

// cosine of two already-normalized vectors == dot product.
function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function bufToVec(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
function vecToBuf(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

module.exports = { embed, embedMany, cosine, bufToVec, vecToBuf, MODEL, DIM };

// CLI smoke test: node embed.js "some text"
if (require.main === module) {
  (async () => {
    const t = process.argv.slice(2).join(" ") || "how do I ship the ios build";
    const t0 = Date.now();
    const v = await embed(t);
    console.log(`model=${MODEL} dim=${v.length} ms=${Date.now() - t0}`);
    console.log("first5=", Array.from(v.slice(0, 5)).map((x) => x.toFixed(4)).join(", "));
  })();
}
