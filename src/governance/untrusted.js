// Seller-written text from Torob (offer notes, addresses) is untrusted input that reaches the model.
// Neutralise it: strip contact details and links (privacy + grounding), cap length, and label it so the
// prompt can tell the model never to follow instructions found inside.
import { PHONE_RE, toLatinDigits } from './privacy.js';

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const HANDLE_RE = /@[\w.]{3,}/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g;

export function sanitizeSellerText(text, max = 160) {
  if (!text) return '';
  let t = toLatinDigits(String(text))
    .replace(CONTROL_RE, '')
    .replace(URL_RE, '[لینک]')
    .replace(PHONE_RE, '[شماره]')
    .replace(HANDLE_RE, '[آیدی]')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = t.slice(0, max - 1) + '…';
  return t;
}
