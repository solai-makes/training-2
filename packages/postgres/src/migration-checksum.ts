import {createHash} from 'node:crypto';
export const normalizeMigrationSql=(sql:string)=>sql.replace(/\r\n/g,'\n');
export const migrationChecksum=(sql:string)=>createHash('sha256').update(normalizeMigrationSql(sql)).digest('hex');
export function matchesMigrationChecksum(sql:string,checksum:string){const normalized=normalizeMigrationSql(sql);return [sql,normalized,normalized.replace(/\n/g,'\r\n')].some(value=>createHash('sha256').update(value).digest('hex')===checksum);}
/** Reconcile a legacy mixed-ending fingerprint only with both original bytes and the released SQL. */
export function canNormalizeMigrationChecksum(original:string,released:string,checksum:string){return normalizeMigrationSql(original)===normalizeMigrationSql(released)&&matchesMigrationChecksum(original,checksum);}
