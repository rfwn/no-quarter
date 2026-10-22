// Persian voice input with the browser's own speech recognition (Chrome/Edge/Safari). The server key
// can't transcribe audio, so where the browser has no recogniser the mic button simply isn't shown.
import { useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
// Off for now (owner's call, 2026-10-22): flip VOICE_ENABLED to bring the mic button back.
const VOICE_ENABLED = false;
export const voiceSupported = VOICE_ENABLED && !!Recognition;

const ERRORS = {
  'not-allowed': 'اجازه‌ی میکروفون داده نشد.',
  'service-not-allowed': 'اجازه‌ی میکروفون داده نشد.',
  network: 'تشخیص گفتار الان در دسترس نیست؛ بنویس.',
  'no-speech': 'صدایی نشنیدم؛ دوباره بگو.',
  'audio-capture': 'میکروفونی پیدا نشد.',
};

/**
 * Listen once, Persian. `onText(text, final)` gets the transcript as it grows; the user reviews it before
 * sending (nothing is sent automatically).
 */
export function useVoice(onText) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => () => rec.current?.abort(), []);

  function start() {
    if (!Recognition || listening) return;
    setError('');
    const r = new Recognition();
    r.lang = 'fa-IR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const text = [...e.results].map((x) => x[0].transcript).join(' ').trim();
      cb.current(text, e.results[e.results.length - 1].isFinal);
    };
    r.onerror = (e) => setError(ERRORS[e.error] || 'تشخیص گفتار کار نکرد؛ بنویس.');
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('تشخیص گفتار شروع نشد.');
    }
  }

  const stop = () => rec.current?.stop();
  return { listening, error, start, stop };
}
