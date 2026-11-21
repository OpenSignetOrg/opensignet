import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The deployment-record fields this test pins. */
interface DeploymentRecord {
  retired: { on: string; note: string };
  network: string;
  chainId: number;
  renewalVault: {
    compiler: string;
    compilerSettings: { optimizerEnabled: boolean; viaIR: boolean; evmVersion: string };
  };
}

test('contract metadata is reproducible, the retired record is labelled, and no backend configuration is published', async () => {
  const record = JSON.parse(
    await readFile(join(root, 'deployments', 'retired', 'base-mainnet-2026-07.json'), 'utf8'),
  ) as DeploymentRecord;
  const foundry = await readFile(join(root, 'foundry.toml'), 'utf8');
  const readme = await readFile(join(root, 'README.md'), 'utf8');

  assert.match(record.retired.on, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(record.retired.note, /no longer uses these contracts/);
  assert.equal(record.network, 'base-mainnet');
  assert.equal(record.chainId, 8453);
  assert.equal(record.renewalVault.compiler, '0.8.34+commit.80d5c536');
  assert.deepEqual(record.renewalVault.compilerSettings, {
    optimizerEnabled: false,
    viaIR: false,
    evmVersion: 'cancun',
  });
  assert.equal('productionEnv' in record, false);

  assert.match(foundry, /^solc_version = "0\.8\.34"$/m);
  assert.match(foundry, /^optimizer = false$/m);
  assert.match(foundry, /^via_ir = false$/m);
  assert.match(foundry, /^evm_version = "cancun"$/m);
  assert.doesNotMatch(readme, /published ABI/i);

  const sources = ['OpenSignetPass.sol'];
  assert.deepEqual((await readdir(join(root, 'src'))).sort(), sources);
  for (const source of sources) {
    await access(join(root, 'src', source));
  }
});
