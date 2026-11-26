export const TICKET_DIGITS = 4;
export const MAX_TICKET_NUMBER = 10 ** TICKET_DIGITS - 1;

/** @param {number | null | undefined} number */
export function formatTicket(number) {
  return number == null ? '·'.repeat(TICKET_DIGITS) : String(number).padStart(TICKET_DIGITS, '0');
}

/** @param {number} min @param {number} max */
export function isTicketRange(min, max) {
  return Number.isSafeInteger(min) && Number.isSafeInteger(max)
    && min >= 0 && min <= max && max <= MAX_TICKET_NUMBER;
}
