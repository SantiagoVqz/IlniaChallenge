// Generates a fresh ES256 (P-256) JWT signing key in the exact shape Supabase's
// local stack expects: signing_keys.json is a JSON array holding one private JWK.
//
// Why this exists: signing_keys.json is gitignored (you never commit signing keys),
// so CI has to recreate it before `supabase start`. Generating a *fresh, distinct*
// key per stack is not a shortcut — it's the whole point of the env-isolation proof:
// a JWT minted by staging is signed with staging's key and therefore FAILS
// verification on production, which holds a different key. See infra/README.md.
//
// Usage: node scripts/gen-signing-key.mjs <output-path>

import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/gen-signing-key.mjs <output-path>');
  process.exit(1);
}

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' }); // -> { kty, crv, x, y, d }

// Field set + order mirrors the keys the local stack writes itself.
const signingKeys = [
  {
    kty: jwk.kty,
    kid: randomUUID(),
    use: 'sig',
    key_ops: ['sign', 'verify'],
    alg: 'ES256',
    ext: true,
    d: jwk.d,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
  },
];

writeFileSync(out, JSON.stringify(signingKeys, null, 2) + '\n');
console.log(`wrote ${out} (kid ${signingKeys[0].kid})`);
