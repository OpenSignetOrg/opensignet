# @opensignet/shared

Public TypeScript contracts shared by OpenSignet clients and integrations.

## Install

Install the version used by these examples:

```bash
npm install @opensignet/shared@0.1.0
```

## Usage

```ts
import {
  OPENSIGNET_API_BASE_URL,
  SERVICE_PLAN_CATALOG,
  registrationParamsSchema,
} from '@opensignet/shared';

const registration = registrationParamsSchema.parse(input);
```

Use focused subpath exports when an application needs a smaller public surface:

```ts
import { OPENSIGNET_API_BASE_URL } from '@opensignet/shared/constants';
import { registrationParamsSchema } from '@opensignet/shared/schemas';
import type { RegistrationParams } from '@opensignet/shared/types';
```

The package includes:

- Public API request and response types
- Runtime Zod schemas for public inputs
- DNS, service-plan, network, and API constants
- Stable utility functions used by the public SDK and integrations

The canonical API base is `https://api.opensignet.com/api/v1`.

## Compatibility

This package is ESM-only and ships TypeScript declarations with every export.
Treat runtime schemas as the validation boundary; do not cast untrusted input
directly to exported TypeScript types.

## Links

- [Documentation](https://docs.opensignet.com/sdk/typescript)
- [Source](https://github.com/OpenSignetOrg/opensignet/tree/main/packages/shared)
- [Security policy](https://github.com/OpenSignetOrg/opensignet/security/policy)
