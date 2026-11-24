import { input, password, confirm } from '@inquirer/prompts';
import { loadEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { provisioning, passwordSchema } from './modules/admin/provision.js';

const pool = createDatabase(loadEnv());
const admins = provisioning(pool);
try {
  console.log('Dewi Sri — Administrator');
  const command = process.argv[2];
  if (command === 'list') console.table(await admins.list());
  else {
    const name = command === 'create' ? await input({ message: 'Nama lengkap:' }) : '';
    const email = await input({ message: 'Email administrator:' });
    if (command === 'disable') {
      if (await confirm({ message: `Nonaktifkan ${email} dan cabut semua sesinya?`, default: false })) await admins.disable(email);
      else console.log('Dibatalkan.');
    } else if (command === 'create' || command === 'reset-password') {
      const value = await password({ message: 'Kata sandi (12+ karakter, huruf besar/kecil, angka, simbol):', mask: '*' });
      if (!passwordSchema.safeParse(value).success) throw Error('Kata sandi tidak memenuhi kebijakan.');
      const repeat = await password({ message: 'Ulangi kata sandi:', mask: '*' });
      if (value !== repeat) throw Error('Konfirmasi kata sandi tidak sama.');
      if (command === 'create') await admins.create(name,email,value); else await admins.reset(email,value);
      console.log('Administrator berhasil diperbarui.');
    } else throw Error('Perintah tidak dikenal.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  console.error(/^(Email sudah|Administrator |Kata sandi |Konfirmasi |Role admin)/.test(message) ? message : 'Operasi gagal. Periksa masukan, koneksi MySQL, dan skrip 03_admin_sessions.sql.');
  process.exitCode = 1;
} finally { await pool.end(); }
