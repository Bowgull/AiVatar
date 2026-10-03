// What Aang sees when he checks whether the vault needs backing up.
//   node tools/measure/checkbackup.mjs           report only
//   node tools/measure/checkbackup.mjs --run     actually back it up
import { vaultState, backupVault, BACKUP_AFTER_DAYS } from '../../src/Core/src/backup-vault.ts';
import { VAULT_DIR } from '../../src/Core/src/files.ts';

const s = await vaultState();
console.log('vault      :', VAULT_DIR);
console.log('git repo   :', s.repo);
console.log('last commit:', s.lastAt ? s.lastAt.toISOString().slice(0, 16).replace('T', ' ') : 'never');
console.log('days ago   :', s.days === Infinity ? 'n/a' : s.days.toFixed(2));
console.log('uncommitted:', s.dirty);
console.log(`would ask  : ${s.due}   (needs changes AND ${BACKUP_AFTER_DAYS}+ days)`);

if (process.argv.includes('--run')) {
  const r = await backupVault();
  console.log('\n' + (r.ok ? 'OK  ' : 'FAIL') + ' ' + r.detail);
}
