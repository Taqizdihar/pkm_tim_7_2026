import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../utils/http.js';
import { csrfFor, type AuthService } from './service.js';

export function authRouter(auth: AuthService, origin: string, secure: boolean) {
  const router = Router();
  const cookie = 'dewi_admin';
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/api/v1/admin' };
  const originGuard = (value: string | undefined) => {
    if (value !== origin) throw new HttpError(403, 'Asal permintaan tidak diizinkan.');
  };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/auth/login', rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Terlalu banyak percobaan. Coba lagi 15 menit kemudian.' } } }), async (req, res) => {
    originGuard(req.get('origin'));
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(191), password: z.string().min(1).max(200) }).strict().parse(req.body);
    const session = await auth.login(body.email, body.password);
    res.cookie(cookie, session.token, { ...cookieOptions, expires: session.expiresAt });
    res.json({ success: true, data: { csrfToken: csrfFor(session.token) } });
  });
  router.use(async (req, res, next) => {
    const token = req.cookies?.[cookie] || '';
    const admin = await auth.authenticate(token);
    if (!admin) throw new HttpError(401, 'Silakan masuk sebagai administrator.');
    res.locals.admin = admin;
    res.locals.token = token;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      originGuard(req.get('origin'));
      const expected = Buffer.from(csrfFor(token));
      const supplied = Buffer.from(req.get('x-csrf-token') || '');
      if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new HttpError(403, 'Token CSRF tidak sesuai. Muat ulang halaman.');
    }
    next();
  });
  router.get('/auth/me', (_req, res) => res.json({ success: true, data: { ...res.locals.admin, csrfToken: csrfFor(res.locals.token) } }));
  router.post('/auth/logout', async (_req, res) => {
    await auth.logout(res.locals.token);
    res.clearCookie(cookie, cookieOptions);
    res.json({ success: true });
  });
  return router;
}
