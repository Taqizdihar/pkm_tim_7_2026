import {createDatabase} from './config/database.js';
import {loadEnv} from './config/env.js';
import {multiPetReady,rows} from './modules/member/shared.js';

const pool=createDatabase(loadEnv());
try{
  const ready=await multiPetReady(pool);
  const tables=await rows(pool,'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\'');
  const columns=await rows(pool,`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND ((TABLE_NAME='user_cultivations' AND COLUMN_NAME IN ('pet_mode','quantity','location_label','ownership_confirmed_at','archived_at','archive_reason','create_request_id','create_request_hash')) OR (TABLE_NAME='care_logs' AND COLUMN_NAME IN ('batch_id','pet_name_at_care','quantity_at_care'))) ORDER BY TABLE_NAME,ORDINAL_POSITION`);
  const constraints=await rows(pool,`SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN ('user_cultivations','care_logs') ORDER BY TABLE_NAME,CONSTRAINT_NAME`);
  console.log(JSON.stringify({ready,tableCount:Number(tables[0].total),columns,constraints,manualMigration:ready?null:'docs/database/06_multi_pet_management.sql'},null,2));
}catch(error){console.error(JSON.stringify({ready:false,code:(error as {code?:string}).code||'SCHEMA_CHECK_FAILED'}));process.exitCode=1;}
finally{await pool.end();}
