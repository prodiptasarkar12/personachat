require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { parseWhatsApp } = require('./services/whatsappParser');
const { analyzeMessages } = require('./services/personaAnalyzer');
const { generateReply } = require('./services/aiService');

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, /\.txt$/i.test(file.originalname)) });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true });

function signAdmin(username) { return jwt.sign({ role: 'admin', username }, process.env.SESSION_SECRET || 'change-me', { expiresIn: '8h' }); }
function adminAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, process.env.SESSION_SECRET || 'change-me');
    if (payload.role !== 'admin') throw new Error('forbidden');
    req.admin = payload;
    next();
  } catch { res.status(401).json({ error: 'Unauthorized admin access' }); }
}
function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

app.post('/api/auth/user', async (req, res) => {
  const userId = String(req.body.userId || '').trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(userId)) return res.status(400).json({ error: 'Invalid User ID' });
  const user = await prisma.user.upsert({ where: { userId }, update: { lastActiveAt: new Date() }, create: { userId } });
  res.json({ userId: user.userId });
});

app.post('/api/auth/admin/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username !== (process.env.ADMIN_USERNAME || 'Prodipta') || password !== (process.env.ADMIN_PASSWORD || 'CHANGE_THIS_PASSWORD')) return res.status(401).json({ error: 'Invalid admin credentials' });
  res.json({ token: signAdmin(username), username });
});
app.post('/api/auth/logout', (_, res) => res.json({ ok: true }));

app.get('/api/personas', async (req, res) => {
  const personas = await prisma.persona.findMany({ where: { active: req.query.all === 'true' ? undefined : true }, orderBy: { updatedAt: 'desc' } });
  res.json(personas);
});
app.get('/api/personas/:id', async (req, res) => {
  const persona = await prisma.persona.findUnique({ where: { id: Number(req.params.id) } });
  if (!persona) return res.status(404).json({ error: 'Persona not found' });
  res.json(persona);
});
app.post('/api/personas', adminAuth, async (req, res) => {
  const { name, description = '', avatar = '', language = 'Banglish', personality = '', chatStyle = 'short casual messages', emojiStyle = 'medium' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Persona name is required' });
  const persona = await prisma.persona.create({ data: { name: name.trim(), description, avatar, language, personality, chatStyle, emojiStyle } });
  res.status(201).json(persona);
});
app.put('/api/personas/:id', adminAuth, async (req, res) => {
  const allowed = ['name','description','avatar','language','personality','chatStyle','emojiStyle','systemPrompt','active','commonPhrases','vocabulary','emotionalPatterns','avgResponseLength'];
  const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const persona = await prisma.persona.update({ where: { id: Number(req.params.id) }, data });
  res.json(persona);
});
app.delete('/api/personas/:id', adminAuth, async (req, res) => {
  await prisma.persona.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

app.post('/api/personas/:id/import', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A .txt WhatsApp export is required' });
  try {
    const text = fs.readFileSync(req.file.path, 'utf8');
    const parsed = parseWhatsApp(text);
    if (!parsed.messages.length) return res.status(400).json({ error: 'No supported WhatsApp messages found' });
    const profile = analyzeMessages(parsed.messages);
    const source = await prisma.personaSource.create({ data: { personaId: Number(req.params.id), fileName: req.file.originalname, messageCount: parsed.messages.length, participants: JSON.stringify(parsed.participants) } });
    const persona = await prisma.persona.update({ where: { id: Number(req.params.id) }, data: { sourceData: JSON.stringify(profile), language: profile.language, avgResponseLength: profile.avgResponseLength, commonPhrases: JSON.stringify(profile.commonExpressions), vocabulary: JSON.stringify(profile.vocabulary), emotionalPatterns: JSON.stringify(profile.emotionalPatterns) } });
    res.json({ source, persona, analysis: profile });
  } finally { fs.rmSync(req.file.path, { force: true }); }
});
app.post('/api/personas/:id/analyze', adminAuth, async (req, res) => {
  const persona = await prisma.persona.findUnique({ where: { id: Number(req.params.id) } });
  if (!persona) return res.status(404).json({ error: 'Persona not found' });
  const profile = safeJson(persona.sourceData, {});
  const updated = await prisma.persona.update({ where: { id: persona.id }, data: { systemPrompt: req.body.systemPrompt ?? persona.systemPrompt } });
  res.json({ persona: updated, profile });
});

app.post('/api/chat/start', async (req, res) => {
  const { userId, personaId, isAdminConversation = false } = req.body;
  const persona = await prisma.persona.findUnique({ where: { id: Number(personaId) } });
  if (!persona || (!persona.active && !isAdminConversation)) return res.status(404).json({ error: 'Persona not available' });
  let user = null;
  if (!isAdminConversation) {
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    user = await prisma.user.findUnique({ where: { userId: String(userId) } });
    if (!user) return res.status(401).json({ error: 'Invalid User ID' });
  }
  const conversation = await prisma.conversation.create({ data: { userId: user?.id, personaId: persona.id, isAdminConversation } });
  res.json({ conversationId: conversation.id, persona });
});
app.get('/api/chat/:conversationId', async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: Number(req.params.conversationId) }, include: { persona: true, messages: { orderBy: { createdAt: 'asc' } } } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conversation);
});
app.post('/api/chat/:conversationId/message', aiLimiter, async (req, res) => {
  const content = String(req.body.message || '').trim();
  if (!content) return res.status(400).json({ error: 'Empty message' });
  if (content.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const conversation = await prisma.conversation.findUnique({ where: { id: Number(req.params.conversationId) }, include: { persona: true, messages: { orderBy: { createdAt: 'asc' } } } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  await prisma.message.create({ data: { conversationId: conversation.id, role: 'user', content } });
  try {
    const reply = await generateReply(conversation.persona, conversation.messages, content);
    const message = await prisma.message.create({ data: { conversationId: conversation.id, role: 'assistant', content: reply } });
    res.json({ message });
  } catch (error) {
    res.status(502).json({ error: error.message || 'AI API failure' });
  }
});

app.get('/api/admin/users', adminAuth, async (_, res) => res.json(await prisma.user.findMany({ orderBy: { lastActiveAt: 'desc' } })));
app.get('/api/admin/users/:id', adminAuth, async (req, res) => res.json(await prisma.user.findUnique({ where: { id: Number(req.params.id) }, include: { conversations: { include: { persona: true, _count: { select: { messages: true } } } } } })));
app.get('/api/admin/conversations', adminAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const conversations = await prisma.conversation.findMany({ include: { user: true, persona: true, _count: { select: { messages: true } } }, orderBy: { lastActiveAt: 'desc' } });
  const filtered = q ? conversations.filter(c => c.user?.userId?.toLowerCase().includes(q.toLowerCase()) || c.persona.name.toLowerCase().includes(q.toLowerCase())) : conversations;
  res.json(filtered);
});
app.get('/api/admin/conversations/:id', adminAuth, async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { id: Number(req.params.id) }, include: { user: true, persona: true, messages: { orderBy: { createdAt: 'asc' } } } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  res.json(c);
});

app.get('*', (req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' }); res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')); });
app.listen(PORT, () => console.log(`PersonaChat running on http://localhost:${PORT}`));
