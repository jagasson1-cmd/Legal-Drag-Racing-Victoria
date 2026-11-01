'use strict';
// Regenerates golden expected outputs. Run only for an intentional, separately reviewed change to save shapes or
// race maths or opponent generation, and name the affected golden explicitly:
//   node tests/helpers/regenerate-goldens.js saves|cloud|race|opponents
// Review the resulting diff under tests/fixtures/expected before committing it in its own commit.
const fs = require('node:fs');
const path = require('node:path');
const { saveCases, cloudCase, raceCases, opponentCases, EXPECTED } = require('./golden-cases');

(async () => {
  const which = process.argv.slice(2);
  if (!which.length || which.some(w => !EXPECTED[w])) { console.error('Usage: node tests/helpers/regenerate-goldens.js saves|cloud|race|opponents [...]'); process.exit(2); }
  for (const w of which) {
    const data = w === 'saves' ? saveCases() : w === 'cloud' ? await cloudCase() : w === 'race' ? raceCases() : opponentCases();
    fs.mkdirSync(path.dirname(EXPECTED[w]), { recursive: true });
    fs.writeFileSync(EXPECTED[w], JSON.stringify(data, null, 1) + '\n');
    console.log('wrote', path.relative(process.cwd(), EXPECTED[w]));
  }
})().catch(e => { console.error(e); process.exit(1); });
