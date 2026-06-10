import { Router, Request, Response, NextFunction } from 'express';
import { getPool } from '../db/connection.js';
import { queryOne } from '../utils/dbHelpers.js';
import { hashPassword, verifyPassword, issueToken, verifyToken, TokenPayload } from '../services/authService.js';

const router = Router();

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: number;
}

interface PublicUser {
  id: number;
  email: string;
  display_name: string;
  created_at: number;
}

const toPublic = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  display_name: u.display_name,
  created_at: u.created_at,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthedRequest extends Request {
  auth?: TokenPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.auth = payload;
  next();
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, display_name } = req.body as Record<string, unknown>;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const name = typeof display_name === 'string' && display_name.trim()
      ? display_name.trim().slice(0, 50)
      : email.split('@')[0];

    const pool = getPool();
    const existing = await queryOne(pool, 'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user: UserRow = await queryOne(pool,
      `INSERT INTO users (email, display_name, password_hash)
       VALUES (LOWER($1), $2, $3) RETURNING *`,
      [email, name, passwordHash]
    );
    res.status(201).json({ token: issueToken(user.id, user.email), user: toPublic(user) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const pool = getPool();
    const user: UserRow | null = await queryOne(pool,
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: issueToken(user.id, user.email), user: toPublic(user) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const pool = getPool();
    const user: UserRow | null = await queryOne(pool,
      'SELECT * FROM users WHERE id = $1', [req.auth!.uid]);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json({ user: toPublic(user) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
