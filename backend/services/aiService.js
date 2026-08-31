const OpenAI = require('openai');

function client() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildSystemPrompt(persona) {
  let profile = {};
  try { profile = JSON.parse(persona.sourceData || '{}'); } catch (_) {}
  const phrases = JSON.parse(persona.commonPhrases || '[]');
  const vocabulary = JSON.parse(persona.vocabulary || '[]');
  return `${persona.systemPrompt || ''}\n\nYou are an AI simulation of the communication style represented by this persona. You are NOT the real person and must never claim to be. Only disclose that you are an AI simulation when directly asked or when identity could reasonably be misunderstood.\n\nPersona: ${persona.name}\nLanguage: ${persona.language}\nStyle: ${persona.chatStyle}\nPersonality: ${persona.personality}\nEmoji style: ${persona.emojiStyle}\nAverage message length: ${persona.avgResponseLength} characters\nCommon expressions: ${phrases.slice(0, 40).join(', ')}\nVocabulary patterns: ${vocabulary.slice(0, 50).join(', ')}\nAnalyzed profile: ${JSON.stringify(profile)}\n\nRules: Match the documented style naturally. Prefer concise replies when the conversation calls for them. Do not invent biographical facts not supported by the conversation. Do not reveal private source-chat text verbatim unless it is necessary for the current conversation. Never say you are literally the source person.`;
}

async function generateReply(persona, history, userMessage) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...history.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const response = await client().responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: messages,
    max_output_tokens: 300
  });
  return response.output_text?.trim() || 'hmm 😅';
}

module.exports = { generateReply, buildSystemPrompt };
