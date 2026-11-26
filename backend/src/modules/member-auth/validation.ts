import { z } from 'zod';

export const id = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const password = z.string().min(15, 'Gunakan sedikitnya 15 karakter.').max(200);
export function normalizePhone(value: string) {
  const clean = value.trim().replace(/[ -]/g, '');
  return clean.startsWith('+62') ? `0${clean.slice(3)}` : clean.startsWith('62') ? `0${clean.slice(2)}` : clean;
}
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(v => v === '' || v == null ? null : v, schema.nullable());
export const identity = z.object({
  name: z.string().trim().min(1).max(100),
  phone_number: optional(z.string().transform(normalizePhone).pipe(z.string().regex(/^08[0-9]{8,11}$/))),
  username: optional(z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,49}$/)),
  email: optional(z.string().trim().toLowerCase().email().max(191)),
  status: z.enum(['active', 'disabled']).default('active'),
});
export const hasIdentifier = (v: z.infer<typeof identity>) => Boolean(v.phone_number || v.username || v.email);
export const memberInput = identity.strict().refine(hasIdentifier, 'Isi nomor HP, username, atau email.');
export const credential = z.object({ password, confirm_password: password, must_change_password: z.boolean().default(true) })
  .strict().refine(v => v.password === v.confirm_password, 'Konfirmasi kata sandi tidak sama.');
export const createInput = identity.extend({ password, confirm_password: password, must_change_password: z.boolean().default(true) })
  .strict().refine(hasIdentifier, 'Isi nomor HP, username, atau email.')
  .refine(v => v.password === v.confirm_password, 'Konfirmasi kata sandi tidak sama.');
export function loginIdentifier(value: string) {
  const text = value.trim().toLowerCase();
  if (text.includes('@')) return { column: 'email', value: text } as const;
  if (/^[+0-9]/.test(text)) return { column: 'phone_number', value: normalizePhone(text) } as const;
  return { column: 'username', value: text } as const;
}
