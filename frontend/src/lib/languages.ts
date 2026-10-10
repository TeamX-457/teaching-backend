export const LANGUAGES = [
  { code: "en", name: "English", native: "English", voice: "en-US" },
  { code: "fr", name: "French", native: "Français", voice: "fr-FR" },
  { code: "es", name: "Spanish", native: "Español", voice: "es-ES" },
  { code: "yo", name: "Yoruba", native: "Yorùbá", voice: "yo-NG" },
  { code: "ha", name: "Hausa", native: "Hausa", voice: "ha-NG" },
  { code: "ig", name: "Igbo", native: "Igbo", voice: "ig-NG" },
  { code: "pt", name: "Portuguese", native: "Português", voice: "pt-PT" },
  { code: "de", name: "German", native: "Deutsch", voice: "de-DE" },
  { code: "ar", name: "Arabic", native: "العربية", voice: "ar-SA" },
  { code: "sw", name: "Swahili", native: "Kiswahili", voice: "sw-KE" },
] as const;

export const langName = (c: string) => LANGUAGES.find((l) => l.code === c)?.name ?? c.toUpperCase();
export const langVoice = (c: string) => LANGUAGES.find((l) => l.code === c)?.voice ?? "en-US";

/** Demonstration script used by the live session simulator. */
export const DEMO_SCRIPT: { en: string; fr: string; es: string; yo: string; de: string; pt: string }[] = [
  { en: "Good afternoon, everyone, and thank you for being here.", fr: "Bonjour à tous, et merci d'être présents.", es: "Buenas tardes a todos, y gracias por estar aquí.", yo: "Ẹ káàsán gbogbo yín, ẹ sì ṣé tí ẹ wá.", de: "Guten Tag allerseits, und danke, dass Sie hier sind.", pt: "Boa tarde a todos, e obrigado por estarem aqui." },
  { en: "Today we will talk about making public spaces accessible to all.", fr: "Aujourd'hui, nous parlerons de rendre les espaces publics accessibles à tous.", es: "Hoy hablaremos de hacer los espacios públicos accesibles para todos.", yo: "Lónìí, a ó sọ̀rọ̀ nípa bí a ṣe lè mú ibi gbogbo wà fún gbogbo ènìyàn.", de: "Heute sprechen wir darüber, öffentliche Räume für alle zugänglich zu machen.", pt: "Hoje falaremos sobre tornar os espaços públicos acessíveis a todos." },
  { en: "Communication should never be a barrier to participation.", fr: "La communication ne devrait jamais être un obstacle à la participation.", es: "La comunicación nunca debería ser una barrera para participar.", yo: "Ìbánisọ̀rọ̀ kò gbọdọ̀ jẹ́ ìdènà fún ìkópa.", de: "Kommunikation sollte niemals ein Hindernis für Teilhabe sein.", pt: "A comunicação nunca deve ser uma barreira à participação." },
  { en: "If you have questions, please raise your hand at any time.", fr: "Si vous avez des questions, levez la main à tout moment.", es: "Si tienen preguntas, levanten la mano en cualquier momento.", yo: "Bí ẹ bá ní ìbéèrè, ẹ gbé ọwọ́ sókè nígbàkigbà.", de: "Wenn Sie Fragen haben, heben Sie jederzeit die Hand.", pt: "Se tiverem perguntas, levantem a mão a qualquer momento." },
  { en: "Let us begin with the first presentation.", fr: "Commençons par la première présentation.", es: "Comencemos con la primera presentación.", yo: "Ẹ jẹ́ kí a bẹ̀rẹ̀ pẹ̀lú ìgbékalẹ̀ àkọ́kọ́.", de: "Beginnen wir mit der ersten Präsentation.", pt: "Vamos começar com a primeira apresentação." },
];

export function demoLine(i: number, to: string) {
  const row = DEMO_SCRIPT[i % DEMO_SCRIPT.length]!;
  return { original: row.en, translated: (row as Record<string, string>)[to] ?? row.fr };
}

export function fmtDuration(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec.toString().padStart(2, "0")}s` : `${sec}s`;
}
export function fmtClock(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
