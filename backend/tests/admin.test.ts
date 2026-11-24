import assert from 'node:assert/strict';
import { test } from 'node:test';
import argon2 from 'argon2';
import sharp from 'sharp';
import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'mysql2/promise';
import { provisioning, passwordSchema } from '../src/modules/admin/provision.js';
import { adminCatalog, assignmentsSchema } from '../src/modules/admin/catalog.js';
import { processImage, saveMedia } from '../src/modules/admin/media.js';

function fixture(respond:(sql:string,params:any[])=>any = ()=>undefined) {
  const calls:{sql:string;params:any[]}[]=[];
  let commits=0,rollbacks=0;
  const db={
    async execute(sql:string,params:any[]=[]){ calls.push({sql,params});const result=respond(sql,params);
      if (result instanceof Error) throw result;
      if (result!==undefined) return [result];
      if (sql.includes("roles WHERE code='admin'")) return [[{id:'23'}]];
      if (sql.includes('SELECT * FROM')) return [[{id:params[0]}]];
      if (sql.startsWith('SELECT')) return [[]];
      return [{insertId:101,affectedRows:1}];
    },
    async query(sql:string,params:any[]=[]){return this.execute(sql,params);},
    async beginTransaction(){},async commit(){commits++;},async rollback(){rollbacks++;},release(){},
  };
  const pool={...db,getConnection:async()=>db} as unknown as Pool;
  return {pool,calls,get commits(){return commits;},get rollbacks(){return rollbacks;}};
}

test('CLI creates user + discovered role atomically with Argon2id and rejects duplicate emails',async()=>{
  const db=fixture();await provisioning(db.pool).create('Developer',' Test@Example.test ','abcdef');
  assert.equal(db.commits,1);
  const user=db.calls.find(c=>c.sql.startsWith('INSERT INTO users'))!;
  assert.equal(user.params[1],'test@example.test');assert.match(user.params[2],/^\$argon2id\$/);
  assert.equal(await argon2.verify(user.params[2],'abcdef'),true);
  assert.deepEqual(db.calls.find(c=>c.sql.startsWith('INSERT INTO user_roles'))!.params,[101,'23']);
  const duplicate=fixture(sql=>sql==='SELECT id FROM users WHERE email=?'?[{id:'9'}]:undefined);
  await assert.rejects(provisioning(duplicate.pool).create('Developer','test@example.test','Secure-Password123!'),/Email sudah/);
  assert.equal(duplicate.rollbacks,1);assert.equal(duplicate.calls.some(c=>c.sql.startsWith('INSERT')),false);
  const failed=fixture(sql=>sql.startsWith('INSERT INTO user_roles')?new Error('fixture constraint'):undefined);
  await assert.rejects(provisioning(failed.pool).create('Developer','test@example.test','Secure-Password123!'));
  assert.equal(failed.rollbacks,1);assert.equal(failed.commits,0);
  assert.equal(passwordSchema.safeParse('short').success,false);
  for (const password of ['abcdef','ABCDEF','123456','!!!!!!']) assert.equal(passwordSchema.safeParse(password).success,true);
  assert.equal(passwordSchema.safeParse('a'.repeat(128)).success,true);
  assert.equal(passwordSchema.safeParse('a'.repeat(129)).success,false);
});

test('CLI password reset and disable revoke sessions; non-admin and last admin are protected',async()=>{
  const answer=(sql:string)=>sql.includes('WHERE r.code=\'admin\' AND u.email=')?[{id:'11',status:'active'}]:sql.includes("ur.role_id=? AND u.status='active'")?[{id:'11'},{id:'12'}]:undefined;
  const db=fixture(answer);await provisioning(db.pool).reset('test@example.test','123456');
  assert.ok(db.calls.some(c=>c.sql.startsWith('UPDATE admin_sessions')&&c.params[0]==='11'));
  const password=db.calls.find(c=>c.sql.startsWith('UPDATE users SET password_hash'))!.params[0];
  assert.equal(await argon2.verify(password,'123456'),true);
  await provisioning(db.pool).disable('test@example.test');
  assert.ok(db.calls.some(c=>c.sql.includes("status='disabled'")));
  const last=fixture(sql=>sql.includes("ur.role_id=? AND u.status='active'")?[{id:'11'}]:answer(sql));
  await assert.rejects(provisioning(last.pool).disable('test@example.test'),/terakhir/);
  const nonAdmin=fixture();await assert.rejects(provisioning(nonAdmin.pool).reset('member@example.test','New-SecurePassword123!'),/tidak ditemukan/);
});

test('CMS validates hierarchy, creates species, updates publication and archives without deletion',async()=>{
  const db=fixture(sql=>sql.includes('SELECT * FROM cultivation_categories')?[{id:'1',parent_id:null}]:sql.includes('SELECT * FROM species')?[{id:'101',name:'Ayam Jantan',slug:'ayam-jantan',category_id:'1',status:'draft',sort_order:0,scientific_name:null,short_note:null,description:null,config_json:null}]:undefined);
  const service=adminCatalog(db.pool);
  const created=await service.save('species',null,{name:'Ayam Jantan',slug:'ayam-jantan',category_id:'1'},'11');assert.equal(created.id,'101');
  await service.save('species','101',{status:'published'},'11');
  await service.save('species','101',{status:'archived'},'11');
  assert.equal(db.calls.some(c=>c.sql.startsWith('DELETE')),false);
  assert.equal(db.calls.filter(c=>c.sql.startsWith('INSERT INTO admin_audit_logs')).length,3);
  await assert.rejects(service.save('categories','1',{name:'Cycle',slug:'cycle',parent_id:'1',sort_order:0,is_active:true,habitat_key:'kebun'},'11'),/lingkaran/);
  await assert.rejects(service.save('categories',null,{name:'Bad',slug:'INVALID!'},'11'));
  const conflict=fixture(sql=>sql.startsWith('INSERT INTO species')?Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'}):undefined);
  await assert.rejects(adminCatalog(conflict.pool).save('species',null,{name:'Existing',slug:'existing',category_id:'1'},'11'));
  assert.equal(conflict.rollbacks,1);
});

test('care association preserves referenced rows and guides support publication',async()=>{
  const db=fixture(); const service=adminCatalog(db.pool);
  await service.assign('1',[{care_action_id:'2',slot_key:'action1',effect_config_json:{stat1:20}}],'11');
  assert.ok(db.calls.some(c=>c.sql.includes('SET is_active=0,slot_key=NULL')));
  assert.equal(db.calls.some(c=>c.sql.startsWith('DELETE')),false);
  assert.equal(assignmentsSchema.safeParse([{care_action_id:'2',slot_key:'action1'},{care_action_id:'2',slot_key:'action2'}]).success,false);
  await service.save('guides',null,{species_id:'1',title:'Panduan',body_text:'Isi aman <script> literal',status:'published'},'11');
  assert.ok(db.calls.some(c=>c.sql.startsWith('INSERT INTO cultivation_guides')));
  await assert.rejects(service.saveSettings({session_secret:'unsafe'},'11'));
});

test('image processing checks decoded content, dimensions, and preserves transparency',async()=>{
  await assert.rejects(processImage(Buffer.from('<svg onload="evil()"></svg>')),/Gambar harus/);
  await assert.rejects(processImage(Buffer.from('fake.png')),/Gambar harus/);
  const valid=await sharp({create:{width:32,height:32,channels:4,background:{r:0,g:100,b:50,alpha:0}}}).png().toBuffer();
  const processed=await processImage(valid);assert.equal(processed.info.format,'webp');assert.equal((await sharp(processed.data).metadata()).hasAlpha,true);
  const large=await sharp({create:{width:4097,height:1,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(processImage(large),/4096/);
});

test('failed media metadata transaction removes its new file', async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'dewi-sri-media-'));
  const buffer=await sharp({create:{width:16,height:16,channels:3,background:'#fff'}}).png().toBuffer();
  const db=fixture(sql=>sql.startsWith('INSERT INTO media_assets')?new Error('metadata failed'):sql.startsWith('SELECT id FROM species')?[{id:'1'}]:undefined);
  try {
    await assert.rejects(saveMedia(db.pool,root,'1','normal','Example',buffer,'11'),/metadata failed/);
    assert.deepEqual(await readdir(root),[]);assert.equal(db.rollbacks,1);
  }finally{await rmdir(root);}
});
