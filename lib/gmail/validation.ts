/**
 * Email address and field validation utilities
 * Safe for use in both client and server components.
 */

/**
 * Validates an email address format according to standard RFC patterns.
 * Disallows newlines and control characters to defend against header injection.
 */
export function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (/[\r\n\t]/.test(email)) return false;

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]{2,})+$/;
  return emailRegex.test(email.trim());
}
