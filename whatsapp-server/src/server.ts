import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { whatsappClientManager } from './whatsapp/whatsappClient';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase Setup
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Middleware
app.use(cors({
  origin: process.env.CRM_ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Auth Middleware
const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // @ts-ignore
  req.user = user;
  next();
};

// Public Routes
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Protected Routes
app.get('/whatsapp/status', authenticateToken, (req, res) => {
  res.json(whatsappClientManager.getStatus());
});

app.post('/whatsapp/session/start', authenticateToken, async (req, res) => {
  await whatsappClientManager.initializeClient();
  res.json({ ok: true, status: whatsappClientManager.getStatus().status });
});

app.post('/whatsapp/session/logout', authenticateToken, async (req, res) => {
  await whatsappClientManager.logout();
  res.json({ ok: true });
});

app.get('/whatsapp/qr', authenticateToken, (req, res) => {
  res.json(whatsappClientManager.getQR());
});

// SSE Events
app.get('/whatsapp/events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const listener = (event: string, data: any) => {
    sendEvent(event, data);
  };

  whatsappClientManager.addEventListener(listener);

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    whatsappClientManager.removeEventListener(listener);
    res.end();
  });
});

app.listen(PORT, () => {
  console.log(`[Server] WhatsApp backend running on port ${PORT}`);
});