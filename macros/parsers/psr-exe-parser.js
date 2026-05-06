// psr-exe-parser.js
// Parser for Microsoft Problem Steps Recorder (psr.exe) MHTML output.
//
// Produces a normalised event array suitable for the recipe-emitter library.
// Designed to be robust against missing fields - any step that fails to parse
// is reported in `parse_warnings` rather than crashing the whole run.
//
// Win11 build 10.0.26100 caveat: psr.exe headless `/start ... /stop` invocation
// from a non-interactive shell does NOT save output. The Save dialog needs GUI
// interaction. See ~/ecodiaos/patterns/macro-capture-via-psr-exe.md "Failure
// modes". Real captures are produced by Tate clicking Save manually after the
// recorder dialog closes.
//
// MHTML structure observed across psr.exe versions:
// - multipart/related boundary, type=text/html
// - first part: text/html quoted-printable body containing the <html>... document
// - subsequent parts: image/jpeg base64 with `Content-ID: <imageNNN@xxxx>`
// - HTML body has multiple <div class="StepBlock"> wrappers, each with:
//   - <a name="StepN"></a>
//   - <h2>Step N: (TIMESTAMP) User <action> ...</h2>
//   - <div class="StepBody"> with description paragraphs and <img src="cid:imageNNN@..">
//
// References to coordinates are RARE in psr output (psr does not record raw
// X/Y by default; it records the UIA element name and screenshot only). For
// recipes that need pixel coords, the operator reads them from the screenshot
// during recipe authoring or replay falls back to UIA name-based clicks.
//
// Origin: Tate verbatim 6 May 2026 15:32 AEST "this is an insanely important
// capability for you so we need to give it the attention it deserves."

'use strict';

const fs = require('fs');

/**
 * Parse a Problem Steps Recorder MHTML file from disk.
 * @param {string} path absolute path to .mht file (or extracted from .zip)
 * @returns {{events: Array, window_metadata: Array, raw_step_count: number, parse_warnings: Array<string>, source_path: string}}
 */
function parseMhtmlFile(path) {
  const buf = fs.readFileSync(path);
  const text = buf.toString('utf8');
  const result = parseMhtml(text);
  result.source_path = path;
  return result;
}

/**
 * Parse a Problem Steps Recorder MHTML string.
 * @param {string} mhtmlString full MHTML text
 * @returns {{events: Array, window_metadata: Array, raw_step_count: number, parse_warnings: Array<string>}}
 */
function parseMhtml(mhtmlString) {
  const warnings = [];
  const events = [];
  const windowMetadata = [];

  if (typeof mhtmlString !== 'string' || mhtmlString.length === 0) {
    warnings.push('empty or non-string MHTML input');
    return { events, window_metadata: windowMetadata, raw_step_count: 0, parse_warnings: warnings };
  }

  // --- 1. Locate the boundary marker -----------------------------------
  const boundaryMatch = mhtmlString.match(/boundary\s*=\s*"?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    warnings.push('no MIME boundary found - file may not be a valid MHTML');
  }
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  // --- 2. Split into parts (first part is the text/html body) ----------
  let htmlBody = '';
  if (boundary) {
    const parts = mhtmlString.split('--' + boundary);
    // first part of value is preamble before first boundary; the HTML body
    // is the first "real" part (index 1 typically)
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.includes('content-type: text/html')) {
        htmlBody = stripPartHeaders(part);
        // decode quoted-printable if needed
        if (lower.includes('content-transfer-encoding: quoted-printable')) {
          htmlBody = decodeQuotedPrintable(htmlBody);
        }
        break;
      }
    }
  } else {
    // fallback: treat whole input as HTML if it contains <html>
    htmlBody = mhtmlString;
  }

  if (!htmlBody || !/StepBlock|StepBody|userActDescription/i.test(htmlBody)) {
    warnings.push('no <div class="StepBlock"> or <div class="StepBody"> markers - psr.exe may have produced an unrecognised format');
    // try a fallback: look for any <h2>Step N: pattern at all
    if (!/Step\s+\d+\s*:/.test(htmlBody)) {
      warnings.push('no "Step N:" headings either - giving up');
      return { events, window_metadata: windowMetadata, raw_step_count: 0, parse_warnings: warnings };
    }
  }

  // --- 3. Find each step block. Robust to either StepBlock or StepBody --
  const stepBlockRe = /<div\s+class\s*=\s*["']?(StepBlock|StepBody|userActDescription)["']?[^>]*>([\s\S]*?)<\/div>/gi;
  // The StepBlock is the outer container; the StepBody nested inside has the
  // detail. We try outer first (StepBlock); if we only find StepBody, those
  // are the leaves and contain everything we need.

  const blocks = [];
  let m;
  while ((m = stepBlockRe.exec(htmlBody)) !== null) {
    blocks.push({ wrapper: m[1], inner: m[2], full: m[0] });
  }

  // Filter to outer StepBlock if present, else use StepBody/userActDescription
  const stepBlocks = blocks.filter(b => b.wrapper === 'StepBlock');
  const useBlocks = stepBlocks.length > 0 ? stepBlocks
    : blocks.filter(b => b.wrapper === 'StepBody' || b.wrapper === 'userActDescription');

  if (useBlocks.length === 0) {
    // last-ditch: try splitting by <h2>Step
    const splits = htmlBody.split(/<h2[^>]*>\s*Step\s+\d+/i);
    if (splits.length > 1) {
      warnings.push('using fallback <h2>Step splitter; no <div class> wrappers found');
      for (let i = 1; i < splits.length; i++) {
        useBlocks.push({ wrapper: 'fallback-h2', inner: splits[i], full: '<h2>Step' + splits[i] });
      }
    }
  }

  // --- 4. For each block, extract step data ------------------------------
  for (let i = 0; i < useBlocks.length; i++) {
    const block = useBlocks[i];
    try {
      const event = extractStepEvent(block, i + 1, warnings);
      if (event) {
        events.push(event);
        // collect window metadata
        if (event.window_title && !windowMetadata.find(w => w.window_title === event.window_title)) {
          windowMetadata.push({
            window_title: event.window_title,
            program: event.program || null,
          });
        }
      }
    } catch (err) {
      warnings.push(`step ${i + 1}: parse error: ${err.message}`);
    }
  }

  return {
    events,
    window_metadata: windowMetadata,
    raw_step_count: useBlocks.length,
    parse_warnings: warnings,
  };
}

/**
 * Strip MIME part headers off a multipart segment, returning just the body.
 */
function stripPartHeaders(part) {
  // Headers end at the first blank line. Strip everything up to and including it.
  const blankLineIdx = part.search(/\r?\n\r?\n/);
  if (blankLineIdx === -1) return part;
  return part.slice(blankLineIdx).replace(/^\r?\n\r?\n/, '');
}

/**
 * Decode quoted-printable encoded text (RFC 2045).
 * psr.exe uses this for the HTML body part.
 */
function decodeQuotedPrintable(input) {
  // soft line breaks (=\r?\n) -> remove
  let out = input.replace(/=\r?\n/g, '');
  // =XX hex -> single byte; we then re-decode as UTF-8
  out = out.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Re-interpret as UTF-8 (psr emits UTF-8 in its quoted-printable stream)
  try {
    const bytes = Buffer.from(out, 'binary');
    return bytes.toString('utf8');
  } catch {
    return out;
  }
}

/**
 * Extract a single event from a step block.
 * Handles Win10/Win11 psr.exe output variants; tolerant of missing fields.
 */
function extractStepEvent(block, fallbackStepNumber, warnings) {
  const inner = block.inner || '';
  const full = block.full || inner;

  // Step number + timestamp + raw description from the H2 heading
  // psr formats: <h2>Step N: (DATE TIME) User <verb> on "<target>" ... in "<window>"</h2>
  // The DATE/TIME is sometimes wrapped with U+200E LRM marks.
  const h2Match = full.match(/<h2[^>]*>\s*Step\s+(\d+)\s*:\s*(?:\(([^)]*)\))?\s*([\s\S]*?)<\/h2>/i);
  let stepNumber = fallbackStepNumber;
  let rawTimestampStr = null;
  let rawDescription = '';
  if (h2Match) {
    stepNumber = parseInt(h2Match[1], 10) || fallbackStepNumber;
    rawTimestampStr = h2Match[2] ? h2Match[2].replace(/‎/g, '').trim() : null;
    rawDescription = stripTags(h2Match[3] || '').trim();
  } else {
    // fallback: try to extract from inner paragraphs
    const pMatch = inner.match(/Step\s+(\d+)\s*:\s*([\s\S]*?)(?:<\/p>|<p>|$)/i);
    if (pMatch) {
      stepNumber = parseInt(pMatch[1], 10) || fallbackStepNumber;
      rawDescription = stripTags(pMatch[2] || '').trim();
    } else {
      warnings.push(`step ${fallbackStepNumber}: no <h2>Step N: heading found - skipping`);
      return null;
    }
  }

  const timestamp = rawTimestampStr ? normalizeTimestamp(rawTimestampStr) : null;

  // Detect action type
  const type = inferActionType(rawDescription);

  // Window title (psr writes ' in "<window title>"' at the end of the
  // descriptive sentence). Be tolerant: optional, may include parentheses.
  let windowTitle = null;
  const winMatch = rawDescription.match(/\bin\s+"([^"]+)"\s*$/);
  if (winMatch) windowTitle = winMatch[1];

  // Click target text: usually `User left click on "X"` or `... on "X (button)"`
  let targetText = null;
  const targetMatch = rawDescription.match(/\b(?:click(?:ed)?|input)\s+(?:on\s+)?"([^"]+)"/i);
  if (targetMatch) targetText = targetMatch[1];

  // Raw coords - psr does not include x/y by default. Some custom builds do.
  // We hunt for an "(X, Y)" or "at (X, Y)" pattern just in case.
  let x = null, y = null;
  const coordMatch = rawDescription.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (coordMatch) {
    x = parseInt(coordMatch[1], 10);
    y = parseInt(coordMatch[2], 10);
  }

  // Program info: <p>Program: NAME, version, vendor, EXE, EXE</p>
  let program = null;
  const progMatch = inner.match(/Program\s*:\s*([^<,\r\n]+)/i);
  if (progMatch) program = progMatch[1].trim();

  // UI Elements: <p>UI Elements: A, B, C</p>  (most-specific to least)
  let uiElements = null;
  const uiMatch = inner.match(/UI\s+Elements?\s*:\s*([^<\r\n]+)/i);
  if (uiMatch) uiElements = uiMatch[1].trim();

  // Screenshot CID: <img src="cid:imageNNN@xxx">
  let screenshotCid = null;
  const imgMatch = full.match(/src\s*=\s*["']?cid\s*:\s*([^"' >]+)/i);
  if (imgMatch) screenshotCid = imgMatch[1].trim();

  // Keyboard input - psr writes "[...typed text...]" inside the description
  let keyboardInput = null;
  const kbMatch = rawDescription.match(/\[\s*\.{3}([\s\S]*?)\.{3}\s*\]/);
  if (kbMatch) keyboardInput = kbMatch[1].trim();

  // Build a UIA-shaped selector hint from UI Elements ("Name, ControlType, ...")
  // The first comma-separated value is the most specific (the actual element name).
  let uiaSelector = null;
  if (uiElements) {
    const parts = uiElements.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      uiaSelector = `Name="${parts[0]}"`;
      if (parts.length > 1) uiaSelector += ` ControlType="${parts[1]}"`;
    }
  }

  return {
    step_number: stepNumber,
    timestamp,             // ISO string or null
    raw_timestamp: rawTimestampStr,
    type,                  // 'click' | 'keypress' | 'unknown'
    target_text: targetText,
    window_title: windowTitle,
    program,
    ui_elements_path: uiElements,  // raw csv path from psr
    uia_selector_hint: uiaSelector, // best-effort UIA selector reconstruction
    keyboard_input: keyboardInput, // text typed (if any)
    x,
    y,
    screenshot_cid: screenshotCid,
    raw_step_text: rawDescription,
  };
}

/**
 * Heuristic action-type classifier from raw psr description text.
 */
function inferActionType(description) {
  if (!description) return 'unknown';
  const lc = description.toLowerCase();
  if (/keyboard\s+input|user\s+typed|user\s+input.*keyboard/.test(lc)) return 'keypress';
  if (/\bdouble\s*click\b/.test(lc)) return 'doubleclick';
  if (/\bright\s*click\b/.test(lc)) return 'rightclick';
  if (/\bclick(?:ed)?\b/.test(lc)) return 'click';
  if (/\bdrag(?:ged)?\b/.test(lc)) return 'drag';
  if (/\buser\s+pressed\b/.test(lc)) return 'keypress';
  return 'unknown';
}

/**
 * Convert psr timestamp like "5/6/2026 3:41:42 PM" to an ISO 8601 string.
 * psr uses the OS locale; we try US-format first then fall back to D/M/Y.
 * If neither parses, we return null (the raw string is preserved separately).
 */
function normalizeTimestamp(raw) {
  if (!raw) return null;
  // strip non-printable LRM/RLM marks just in case
  const s = raw.replace(/[‎‏]/g, '').trim();
  // Try Date parse directly first - works for many formats on Node
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Attempt manual parse: "M/D/YYYY HH:MM:SS AM/PM"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m) {
    let [, mo, da, yr, h, mi, se, ap] = m;
    h = parseInt(h, 10);
    if (ap && ap.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ap && ap.toUpperCase() === 'AM' && h === 12) h = 0;
    const dt = new Date(Date.UTC(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(da, 10), h, parseInt(mi, 10), parseInt(se || '0', 10)));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}

/**
 * Strip HTML tags from a string, decode common entities.
 */
function stripTags(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  parseMhtml,
  parseMhtmlFile,
  // exposed for unit-style introspection / Worker B reuse
  _internal: { decodeQuotedPrintable, stripTags, inferActionType, normalizeTimestamp },
};
