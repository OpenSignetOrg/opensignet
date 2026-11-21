# @opensignet/contracts

Public OpenSignet smart contracts for Base. The source accepts Solidity 0.8.24 or newer; the
checked-in Foundry profile pins the compiler settings (solc 0.8.34, no optimizer, Cancun).

## Contracts

| Contract         | Public behavior                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OpenSignetPass` | The OpenSignet Pass: one non-transferable token per identity, held in the account's OpenSignet wallet, linking its domain, Basename and ENS name |

Only OpenSignet's minter mints, links and burns a pass, and it is burned when its domain leaves
OpenSignet (an account deleted for good, a domain transferred out or expired). Renewals need no
contract: OpenSignet charges them from the account's OpenSignet wallet with a one-time signed USDC
authorization when they fall due, or from its saved card.

## Local verification

Install [Foundry](https://book.getfoundry.sh/getting-started/installation), then
run from this directory:

```bash
forge build
forge fmt --check
forge test
node --test "test/*.test.ts"
```

These commands compile and format-check the contracts locally without requiring a production
credential. They do not deploy contracts or verify live chain state. Never place wallet keys in
source files, command-line arguments, committed fixtures, or repository configuration.

## Deployments

The OpenSignet Pass is not deployed yet; its address will be recorded here once it is.

The contracts OpenSignet used before (an identity registry, a payment router and a renewal vault)
are retired. Their Base record is kept in
[`deployments/retired/base-mainnet-2026-07.json`](deployments/retired/base-mainnet-2026-07.json)
for anyone verifying past state; OpenSignet no longer uses them, the vault held no USDC when it was
retired, and their sources remain in this repository's history.

## Security properties

- Only addresses the owner sets as minters can mint, link or burn a pass.
- A pass never moves between wallets (ERC-5192, always locked); approvals are refused.
- One live pass per domain; a burned domain can get a new pass later.
- Ownership transfers in two steps, and metadata refreshes are announced (ERC-4906).

Report suspected vulnerabilities through the repository's confidential
[security process](../SECURITY.md).

## License

Unless a file or third-party notice states otherwise, the contracts are licensed
under Apache-2.0.
