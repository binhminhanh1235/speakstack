import { STARTER_PACKS } from '../shared/templates';
import { validatePack } from '../shared/validator';

console.log('=== SpeakStack Seed & Validation Verification ===');
for (const pack of STARTER_PACKS) {
  const res = validatePack(pack, new Set(), false);
  console.log(
    `[${res.valid ? 'PASS' : 'FAIL'}] ${pack.id} (${pack.template} / ${pack.topic}) -> T1:${res.wordCounts.tier1}w, T2:${res.wordCounts.tier2}w, T3:${res.wordCounts.tier3}w`
  );
  if (!res.valid) {
    console.error('Errors:', res.errors);
    process.exit(1);
  }
}
console.log(`Successfully verified ${STARTER_PACKS.length} starter packs.`);
