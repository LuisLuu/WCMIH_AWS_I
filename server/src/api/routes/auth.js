import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
import verifyToken from '../middlewares/auth.js';

const router = express.Router();

const JWT_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'project-v',
  audience: 'project-v-api',
  expiresIn: '24h',
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    JWT_OPTIONS
  );
}

function sanitizeUser(row) {
  return {
    id: row.id,
    email: row.email,
    daily_token_limit: row.daily_token_limit,
    created_at: row.created_at,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const passwordHash = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, daily_token_limit, created_at`,
      [email, passwordHash]
    );

    const user = sanitizeUser(result.rows[0]);
    const token = signUserToken(user);

    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('[auth/register] Error:', err);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, daily_token_limit, created_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = sanitizeUser(row);
    const token = signUserToken(user);

    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/login] Error:', err);
    return res.status(500).json({ error: 'Failed to authenticate user' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, daily_token_limit, created_at
       FROM users
       WHERE id = $1`,
      [req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    console.error('[auth/me] Error:', err);
    return res.status(500).json({ error: 'Failed to load user profile' });
  }
});

// POST /api/auth/demo-token (env-gated for local/dev demo)
router.post('/demo-token', async (req, res) => {
  const isDemoEnabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_AUTH === 'true';

  if (!isDemoEnabled) {
    return res.status(403).json({ error: 'Demo login is disabled in production' });
  }

  try {
    const requestedEmail = String(req.body?.email || 'demo.user@wcmih.local')
      .trim()
      .toLowerCase();

    const allowedDemoAccounts = {
      'demo.user@wcmih.local': {
        id: '22222222-2222-2222-2222-222222222222',
        daily_token_limit: 50000,
      },
      'dev.lead@wcmih.local': {
        id: '11111111-1111-1111-1111-111111111111',
        daily_token_limit: 200000,
      },
    };

    const demoSpec = allowedDemoAccounts[requestedEmail];
    if (!demoSpec) {
      return res.status(400).json({ error: 'Unsupported demo account' });
    }

    const defaultDemoHash = hashPassword('DemoPass123!');
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, daily_token_limit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
       RETURNING id, email, daily_token_limit, created_at`,
      [demoSpec.id, requestedEmail, defaultDemoHash, demoSpec.daily_token_limit]
    );

    const user = sanitizeUser(result.rows[0]);
    const token = signUserToken(user);

    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/demo-token] Error:', err);
    return res.status(500).json({ error: 'Failed to issue demo token' });
  }
});

export default router;
