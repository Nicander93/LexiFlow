let current: SpeechSynthesisUtterance | null = null;

function pickVoice(lang: "en-GB" | "en-US"): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const exact = voices.find((voice) => voice.lang === lang);
  if (exact) return exact;
  const prefix = lang.slice(0, 2);
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix));
}

export function canSpeakEnglish(): boolean {
  if (!window.speechSynthesis) return false;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return true;
  return voices.some((voice) => voice.lang.toLowerCase().startsWith("en"));
}

export function speakEnglish(text: string, lang: "en-GB" | "en-US"): boolean {
  if (!window.speechSynthesis || !text.trim()) return false;
  const voice = pickVoice(lang);
  if (!voice && !canSpeakEnglish()) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  if (voice) utterance.voice = voice;
  current = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
  current = null;
}
