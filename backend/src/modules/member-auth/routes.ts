import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { csrfFor } from '../auth/service.js';
import { HttpError } from '../../utils/http.js';
import { checkCsrf, originGuard, type MemberAuth } from './service.js';
import { password } from './validation.js';

export function memberAuthRouter(auth: MemberAuth, origin: string, secure: boolean) {
  const router = Router();
  const options = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/api/v1' };
  router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.post('/auth/login', rateLimit({ windowMs: 900000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Terlalu banyak percobaan. Coba lagi 15 menit kemudian.' } } }), async (req,res) => {
    originGuard(req.get('origin'),origin);
    const body = z.object({ identifier: z.string().trim().min(1).max(191), password: z.string().min(1).max(200) }).strict().parse(req.body);
    const session = await auth.login(body.identifier,body.password);
    res.cookie('dewi_member',session.token,{ ...options,expires: session.expiresAt });
    const member = await auth.authenticate(session.token);
    res.json({ success:true,data: { ...member,csrfToken:csrfFor(session.token) } });
  });
  router.use(async (req,res,next) => {
    // Do not intercept the independent admin or public catalog routes.
    if (!req.path.startsWith('/auth/') && !req.path.startsWith('/member')) return next('router');
    if(req.path.startsWith('/auth/')&&!['/auth/me','/auth/change-password','/auth/logout'].includes(req.path))return next('router');
    const token = req.cookies?.dewi_member || '';
    const member = await auth.authenticate(token);
    if (!member) throw new HttpError(401,'Silakan masuk sebagai anggota KWT.','AUTH_REQUIRED');
    res.locals.member=member; res.locals.memberToken=token;
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) { originGuard(req.get('origin'),origin); checkCsrf(token,req.get('x-csrf-token')); }
    if (member.must_change_password && !['/auth/me','/auth/change-password','/auth/logout'].includes(req.path))
      throw new HttpError(403,'Ubah kata sandi terlebih dahulu.','PASSWORD_CHANGE_REQUIRED');
    next();
  });
  router.get('/auth/me',(_req,res) => res.json({ success:true,data: { ...res.locals.member,csrfToken:csrfFor(res.locals.memberToken) } }));
  router.post('/auth/logout',async (_req,res) => {
    await auth.logout(res.locals.memberToken); res.clearCookie('dewi_member',options); res.json({ success:true });
  });
  router.post('/auth/change-password',async (req,res) => {
    const b=z.object({ current_password:z.string().min(1).max(200),password,confirm_password:password }).strict()
      .refine(v=>v.password===v.confirm_password,'Konfirmasi kata sandi tidak sama.').parse(req.body);
    const session=await auth.change(res.locals.member.id,res.locals.memberToken,b.current_password,b.password);
    res.cookie('dewi_member',session.token,{ ...options,expires:session.expiresAt });
    res.json({ success:true,data:{ ...await auth.authenticate(session.token),csrfToken:csrfFor(session.token) } });
  });
  return router;
}
