import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WALLETCONNECT_PROJECT_ID = /^[A-Za-z0-9_-]{20,128}$/;
const TURNSTILE_SITE_KEY = /^[A-Za-z0-9._-]{10,128}$/;
const PRODUCTION_API = 'https://api.opensignet.com/api/v1';

type Environment = Readonly<Record<string, string | undefined>>;
type GitRunner = (args: string[]) => Promise<string>;

interface ProductionContextOptions {
  confirmed: boolean;
  environment?: Environment;
  git?: GitRunner;
}

interface IndexNowModule {
  productionContext(options: ProductionContextOptions): Promise<Record<string, unknown>>;
}

// The repository-level IndexNow release context is owned by the root scripts. It is loaded at
// runtime through this narrow interface so the frontend gate depends only on its documented shape.
const INDEXNOW_MODULE = pathToFileURL(
  resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../scripts/seo/indexnow.ts'),
).href;

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export interface FrontendProductionConfiguration {
  api: string;
  walletConnect: true;
  turnstile: true;
}

export function validateFrontendProductionEnvironment(
  environment: Environment = process.env,
): Readonly<FrontendProductionConfiguration> {
  if (!WALLETCONNECT_PROJECT_ID.test(environment.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '')) {
    fail('FRONTEND_WALLETCONNECT_CONFIG_REQUIRED');
  }
  if (!TURNSTILE_SITE_KEY.test(environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '')) {
    fail('FRONTEND_TURNSTILE_CONFIG_REQUIRED');
  }

  let api: URL;
  try {
    api = new URL(environment.FRONTEND_PUBLIC_API_URL ?? '');
  } catch {
    fail('FRONTEND_PUBLIC_API_CONFIG_INVALID');
  }
  if (api.href !== PRODUCTION_API || api.username || api.password || api.search || api.hash) {
    fail('FRONTEND_PUBLIC_API_CONFIG_INVALID');
  }
  return Object.freeze({ api: PRODUCTION_API, walletConnect: true, turnstile: true });
}

export async function verifyFrontendProductionRelease({
  environment = process.env,
  git,
}: { environment?: Environment; git?: GitRunner } = {}): Promise<
  Readonly<Record<string, unknown>>
> {
  const { productionContext } = (await import(INDEXNOW_MODULE)) as IndexNowModule;
  const context = await productionContext({
    confirmed: true,
    environment,
    ...(git ? { git } : {}),
  });
  validateFrontendProductionEnvironment(environment);
  return Object.freeze({ ...context, configurationVerified: true });
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    if (typeof code === 'string') return code;
  }
  return 'FRONTEND_PRODUCTION_RELEASE_UNEXPECTED';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyFrontendProductionRelease()
    .then((result) =>
      console.log(JSON.stringify({ event: 'frontend_production_release_verified', ...result })),
    )
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({ event: 'frontend_production_release_blocked', code: errorCode(error) }),
      );
      process.exitCode = 1;
    });
}
