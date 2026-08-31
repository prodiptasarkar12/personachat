function tokenize(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function analyzeMessages(messages) {
  const meaningful = messages.filter((m) => m.sender && m.message);
  const counts = new Map();
  const phrases = new Map();
  let totalChars = 0;
  let emojiCount = 0;
  let bangla = 0;
  let english = 0;

  for (const m of meaningful) {
    const words = tokenize(m.message);
    totalChars += m.message.length;
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    for (const emoji of m.message.match(/[\u{1F300}-\u{1FAFF}]/gu) || []) { emojiCount++; }
    for (const ch of m.message) {
      if (/[ঀ-৿]/u.test(ch)) bangla++;
      if (/[A-Za-z]/.test(ch)) english++;
    }
    const lower = m.message.toLowerCase().replace(/\s+/g, ' ').trim();
    if (lower.length >= 4 && lower.length <= 80) phrases.set(lower, (phrases.get(lower) || 0) + 1);
  }

  const top = (map, n = 30) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key);
  const totalLetters = bangla + english || 1;
  const language = bangla / totalLetters > 0.35 ? (english / totalLetters > 0.2 ? 'Banglish' : 'Bengali') : 'English/Banglish';
  const avgLength = meaningful.length ? Math.round(totalChars / meaningful.length) : 0;
  const emojiFrequency = emojiCount / Math.max(meaningful.length, 1) > 1 ? 'high' : emojiCount / Math.max(meaningful.length, 1) > 0.25 ? 'medium' : 'low';

  return {
    language,
    messageStyle: avgLength <= 35 ? 'short casual messages' : avgLength <= 90 ? 'medium conversational messages' : 'long detailed messages',
    avgResponseLength: avgLength,
    emojiFrequency,
    commonExpressions: top(phrases),
    vocabulary: top(counts),
    personality: ['casual', 'conversational'],
    emotionalPatterns: ['context-dependent emotional expression'],
    messageCount: meaningful.length
  };
}

module.exports = { analyzeMessages };
