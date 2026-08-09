#!/usr/bin/env node
/**
 * Shared "was this a Claude quota/rate-limit death" detector.
 *
 * Two callers need the same answer from two different vantage points:
 *   - watchdog.mjs, after the fact, grepping `gh run view --log-failed` for a
 *     completed run.
 *   - pr-review.yml's verdict-application step, in the same job the Claude
 *     step just failed in, grepping the action's own `execution_file`.
 *
 * The execution file is the better source when it's available: the action's
 * console output is deliberately sanitized (base-action/src/run-claude-sdk.ts
 * suppresses every message except system-init and a stripped result summary,
 * to keep full review text out of CI logs), so a run that failed on a quota
 * error can complete with is_error:true and *nothing* quota-shaped anywhere
 * in the visible log — confirmed on Alvus-AI PR #34 (2026-08-09): the log
 * held exactly `{type,subtype,is_error,duration_ms,num_turns,total_cost_usd,
 * permission_denials_count}` and nothing else between system-init and result.
 * The execution file holds the raw, unsanitized SDK message stream (including
 * the result message's own `result`/`errors` text) and is the only place the
 * real reason survives. Same regexes, so a match means the same thing either
 * way; only the text they run against differs.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Each pattern must be specific enough to survive a long log of timestamps,
// SHAs and byte counts. A bare /429/ is not: it matched `12:28:51.5255429Z` on
// a max-turns failure and reported a five-hour quota outage that was never
// happening, which suppressed every dispatch the watchdog exists to make.
// Anchor numbers to the words around them, and prefer the provider's own
// error identifiers.
export const QUOTA_SIGNALS = [
  /usage limit reached/i,
  /quota exceeded/i,
  /rate_limit_error/i,
  /rate limit exceeded/i,
  /\b429\s+too many requests/i,
  /\b(?:status|statuscode|http)\b[^\n]{0,16}\b429\b/i,
];

// Deaths that are definitively not quota, checked first because a long log
// otherwise offers incidental digits to match against.
export const NON_QUOTA_SIGNALS = [/error_max_turns|Reached maximum number of turns/i];

/** @returns {RegExp|null} the first quota-shaped pattern found in `text`, or null. */
export function findQuotaSignal(text) {
  if (NON_QUOTA_SIGNALS.some((re) => re.test(text))) return null;
  return QUOTA_SIGNALS.find((re) => re.test(text)) ?? null;
}

/**
 * Given text that matched a quota signal, work out when the window reopens.
 * Claude reports its own reset time when it knows it ("limit will reset at
 * 3pm", or an epoch, or the CLI's own `reached|<epoch>` shorthand). Prefer
 * that over guessing at the window length.
 *
 * @param {string} text
 * @param {Date} since fallback anchor if no reset time is found in `text`
 * @param {number} windowHours fallback window length in hours
 */
export function extractResetTime(text, since, windowHours) {
  const epoch = text.match(/reset[^\n]*?(\d{10,13})/i) ?? text.match(/reached\|(\d{10,13})/i);
  if (epoch) {
    const ms = Number(epoch[1]);
    return new Date(ms < 1e12 ? ms * 1000 : ms);
  }
  const iso = text.match(/reset[^\n]*?(\d{4}-\d{2}-\d{2}T[\d:]+(?:\.\d+)?Z?)/i);
  if (iso) return new Date(iso[1]);

  return new Date(since.getTime() + windowHours * 3600_000);
}

/**
 * @param {string} text
 * @param {Date} since fallback anchor for extractResetTime
 * @param {number} windowHours fallback window length in hours
 * @returns {Date|null} when quota is expected back, or null if `text` shows no quota signal
 */
export function checkQuotaText(text, since, windowHours) {
  const hit = findQuotaSignal(text);
  if (!hit) return null;
  return extractResetTime(text, since, windowHours);
}

// CLI mode: `node quota-signal.mjs <file> [sinceISO] [windowHours]`.
// Prints `blocked <ISO>` or `clear` on stdout so a bash step can branch on it
// without embedding JS. Reads the whole file as text — the execution file is
// JSON, but a quota signal is a text match regardless of structure, and
// reading it as text avoids caring whether it parses.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , file, sinceArg, windowArg] = process.argv;
  if (!file) {
    console.error('Usage: quota-signal.mjs <file> [sinceISO] [windowHours]');
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`Could not read ${file}: ${e.message}`);
    console.log('clear');
    process.exit(0);
  }
  const since = sinceArg ? new Date(sinceArg) : new Date();
  const windowHours = windowArg ? Number(windowArg) : 5;
  const until = checkQuotaText(text, since, windowHours);
  console.log(until ? `blocked ${until.toISOString()}` : 'clear');
}
