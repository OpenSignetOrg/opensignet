import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertWalletBackdropCss } from '../scripts/check-build.ts';

test('compiled wallet CSS must retain standard backdrop blur', () => {
  assert.doesNotThrow(() =>
    assertWalletBackdropCss([
      '.opensignet-wallet-backdrop{-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
    ]),
  );
  assert.doesNotThrow(() =>
    assertWalletBackdropCss(['.opensignet-wallet-backdrop{backdrop-filter:blur(6px)}']),
  );
  for (const css of [
    '',
    '.opensignet-wallet-backdrop{-webkit-backdrop-filter:blur(6px)}',
    '.other{backdrop-filter:blur(6px)}',
    '.opensignet-wallet-backdrop{backdrop-filter:none}',
  ]) {
    assert.throws(() => assertWalletBackdropCss([css]), /lost standard blur/);
  }
});
