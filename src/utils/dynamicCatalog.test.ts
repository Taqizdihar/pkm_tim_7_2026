import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCatalog } from '../data/catalog.ts';
import { SPECIES,getSpeciesDisplayImage } from '../data/species.ts';
import { getCareActions } from '../data/care.ts';
import { createSpeciesPet,normalizeSpeciesPets } from './gardenState.ts';
import { performCareAction } from './petRules.ts';
import { normalizeCareRecords } from './careJournal.ts';
import { normalizeSchedules } from './careSchedule.ts';

test('new database slug renders with actions, state survives archive, seeded species remain resolvable',()=>{
  const categories=[{id:'3',parentId:null,slug:'ayam',habitatKey:'kandang'}];
  const species={slug:'ayam-jantan',name:'Ayam Jantan',categoryId:'3',shortNote:'Kandang',media:[{stateKey:'normal',storagePath:'/api/v1/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp'}],careActions:[{slotKey:'action1',name:'Pakan jantan',speciesDescription:'Periksa pakan',description:'',iconKey:'feed',effects:{stat1:7}}]};
  applyCatalog({categories,species:[species]},false);
  assert.ok(SPECIES.kuning.some(s=>s.id==='ayam-jantan'&&s.available));
  const pet=createSpeciesPet('kuning','ayam-jantan');assert.match(getSpeciesDisplayImage(pet),/api\/v1\/media/);
  assert.equal(getCareActions('kuning',pet.variety)[0].label,'Pakan jantan');
  assert.equal(performCareAction(pet,'action1').updatedPet.stat1,pet.stat1+7);
  applyCatalog({categories,species:[]});
  assert.equal(SPECIES.kuning.find(s=>s.id==='ayam-jantan')!.available,false);
  assert.equal(normalizeSpeciesPets({'ayam-jantan':pet})['ayam-jantan']!.variety,'ayam-jantan');
  assert.equal(normalizeCareRecords([{id:'record',type:'kuning',variety:'ayam-jantan',slot:'action1',createdAt:'2026-11-24T01:00:00Z'}]).length,1);
  assert.ok(normalizeSchedules({'ayam-jantan-action1':{enabled:true,time:'07:00'}})['ayam-jantan-action1']);
  assert.ok(SPECIES.tunas.find(s=>s.id==='sorgum'));
});
