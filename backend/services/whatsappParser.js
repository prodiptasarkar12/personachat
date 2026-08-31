const SYSTEM_PATTERNS = [
  /messages are end-to-end encrypted/i,
  /<media omitted>/i,
  /you deleted this message/i,
  /this message was deleted/i,
  /missed voice call/i,
  /missed video call/i
];

function isSystemMessage(text) {
  return SYSTEM_PATTERNS.some((p) => p.test(text.trim()));
}

function parseHeader(line) {
  const patterns = [
    /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[ap]m?)\s*[-–]\s*([^:]+):\s*(.*)$/i,
    /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*,?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[ap]m?)\s*[-–]\s*(.*)$/i,
    /^\[(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[ap]m?)\]\s*([^:]+):\s*(.*)$/i
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      if (match.length === 5) return { date: match[1], time: match[2], sender: match[3].trim(), message: match[4] };
      return { date: match[1], time: match[2], sender: null, message: match[3] };
    }
  }
  return null;
}

function parseWhatsApp(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const messages = [];
  let current = null;

  for (const rawLine of lines) {
    const parsed = parseHeader(rawLine);
    if (parsed) {
      if (current && current.message.trim() && !isSystemMessage(current.message)) messages.push(current);
      current = { timestamp: `${parsed.date} ${parsed.time}`, sender: parsed.sender || 'System', message: parsed.message.trim() };
    } else if (current && rawLine.trim()) {
      current.message += `\n${rawLine}`;
    }
  }
  if (current && current.message.trim() && !isSystemMessage(current.message)) messages.push(current);

  const participants = [...new Set(messages.map((m) => m.sender).filter(Boolean))];
  return { participants, messages };
}

module.exports = { parseWhatsApp, isSystemMessage };
