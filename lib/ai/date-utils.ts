/**
 * Server-side deterministic date range computation from natural language phrases.
 *
 * IMPORTANT: The AI model must NEVER be trusted to compute absolute dates.
 * This module converts model-supplied date phrases into verified ISO timestamps.
 */

export interface DateRange {
  dateFrom: string; // ISO 8601 string
  dateTo: string; // ISO 8601 string
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(n: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Resolves a natural-language date phrase to an absolute ISO date range.
 * Returns null if the phrase is unrecognised.
 *
 * Supported phrases (case-insensitive):
 *   today | yesterday | this week | last week |
 *   this month | last month | last N days | past N days
 */
export function resolveDatePhrase(phrase: string): DateRange | null {
  if (!phrase || typeof phrase !== 'string') return null;

  const normalized = phrase.toLowerCase().trim();
  const now = new Date();

  // ── Exact day phrases ────────────────────────────────────────────────────────
  if (normalized === 'today') {
    return {
      dateFrom: startOfDay(now).toISOString(),
      dateTo: endOfDay(now).toISOString(),
    };
  }

  if (normalized === 'yesterday') {
    const yesterday = daysAgo(1);
    return {
      dateFrom: startOfDay(yesterday).toISOString(),
      dateTo: endOfDay(yesterday).toISOString(),
    };
  }

  // ── Week phrases ─────────────────────────────────────────────────────────────
  if (normalized === 'this week') {
    // Week starts on Monday (ISO 8601)
    const monday = new Date(now);
    const day = monday.getDay(); // 0 = Sun, 1 = Mon, …
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    return {
      dateFrom: startOfDay(monday).toISOString(),
      dateTo: endOfDay(now).toISOString(),
    };
  }

  if (normalized === 'last week') {
    const lastMonday = new Date(now);
    const day = lastMonday.getDay();
    const diffToThisMonday = day === 0 ? -6 : 1 - day;
    // Last Monday = this Monday − 7
    lastMonday.setDate(lastMonday.getDate() + diffToThisMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return {
      dateFrom: startOfDay(lastMonday).toISOString(),
      dateTo: endOfDay(lastSunday).toISOString(),
    };
  }

  // ── Month phrases ────────────────────────────────────────────────────────────
  if (normalized === 'this month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      dateFrom: startOfDay(firstDay).toISOString(),
      dateTo: endOfDay(now).toISOString(),
    };
  }

  if (normalized === 'last month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of prev month
    return {
      dateFrom: startOfDay(firstDay).toISOString(),
      dateTo: endOfDay(lastDay).toISOString(),
    };
  }

  // ── "last N days" / "past N days" ────────────────────────────────────────────
  const nDaysMatch = normalized.match(/^(?:last|past)\s+(\d+)\s+days?$/);
  if (nDaysMatch) {
    const n = parseInt(nDaysMatch[1], 10);
    if (n > 0 && n <= 365) {
      return {
        dateFrom: startOfDay(daysAgo(n)).toISOString(),
        dateTo: endOfDay(now).toISOString(),
      };
    }
  }

  return null;
}

/**
 * Validates that a provided ISO date string is parseable and not in the future.
 * Used to guard against model-supplied ISO dates if they are ever present.
 */
export function isValidPastDate(isoString: string): boolean {
  try {
    const d = new Date(isoString);
    return !isNaN(d.getTime()) && d <= new Date();
  } catch {
    return false;
  }
}
