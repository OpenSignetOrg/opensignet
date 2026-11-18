import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertWalletBackdropCss } from '../scripts/check-build.ts';

test('compiled wallet CSS must retain standard backdrop blur', () => {
  assert.doesNotThrow(() =>
    assertWalletBackdropCss([
      '.opensignet-wallet-backdrop{-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}',
    ]),
  );
  assert.doesNotThrow(() =>
    assertWalletBackdropCss(['.opensignet-wallet-backdrop{backdrop-filter:blur(12px)}']),
  );
  for (const css of [
    '',
    '.opensignet-wallet-backdrop{-webkit-backdrop-filter:blur(12px)}',
    '.other{backdrop-filter:blur(12px)}',
    '.opensignet-wallet-backdrop{backdrop-filter:none}',
  ]) {
    assert.throws(() => assertWalletBackdropCss([css]), /lost standard blur/);
  }
});
