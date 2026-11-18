import { createRequire } from 'node:module';

/**
 * Typed facade for the Playwright surface used by the frontend browser tests.
 *
 * Playwright is intentionally not a frontend dependency: browser tests receive a reviewed
 * `playwright` or `playwright-core` package path as their first argument (the local verification
 * script downloads a pinned, hash-checked `playwright-core` tarball). Its declarations are
 * therefore not resolvable at type-check time, so the exact subset in use is declared here.
 */

export type Serializable = unknown;
export type PageFunction<Arg, R> = (arg: Arg) => R | Promise<R>;
export type ElementFunction<E extends Element, Arg, R> = (element: E, arg: Arg) => R | Promise<R>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Headers {
  [name: string]: string;
}

export interface Request {
  url(): string;
  method(): string;
  headers(): Headers;
  postData(): string | null;
  postDataJSON(): unknown;
  resourceType(): string;
}

export interface Response {
  url(): string;
  status(): number;
  ok(): boolean;
  headers(): Headers;
  request(): Request;
  text(): Promise<string>;
}

export interface FulfillOptions {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
  body?: string | Buffer;
  json?: unknown;
}

export interface Route {
  request(): Request;
  fulfill(options?: FulfillOptions): Promise<void>;
  continue(options?: { headers?: Record<string, string> }): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

export interface Dialog {
  message(): string;
  type(): string;
  accept(promptText?: string): Promise<void>;
  dismiss(): Promise<void>;
}

export interface Download {
  suggestedFilename(): string;
  saveAs(path: string): Promise<void>;
}

export interface ConsoleMessage {
  type(): string;
  text(): string;
}

export type AriaRole =
  | 'alert'
  | 'alertdialog'
  | 'article'
  | 'banner'
  | 'button'
  | 'checkbox'
  | 'combobox'
  | 'contentinfo'
  | 'dialog'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listitem'
  | 'main'
  | 'menu'
  | 'menuitem'
  | 'navigation'
  | 'option'
  | 'progressbar'
  | 'radio'
  | 'region'
  | 'row'
  | 'search'
  | 'status'
  | 'switch'
  | 'tab'
  | 'tabpanel'
  | 'table'
  | 'textbox';

export interface RoleOptions {
  name?: string | RegExp;
  exact?: boolean;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  includeHidden?: boolean;
  level?: number;
  pressed?: boolean;
  selected?: boolean;
}

export interface TextOptions {
  exact?: boolean;
}

export interface FilterOptions {
  has?: Locator;
  hasNot?: Locator;
  hasText?: string | RegExp;
  hasNotText?: string | RegExp;
  visible?: boolean;
}

export interface WaitForOptions {
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  timeout?: number;
}

export interface ScreenshotOptions {
  path?: string;
  fullPage?: boolean;
  animations?: 'disabled' | 'allow';
  caret?: 'hide' | 'initial';
  scale?: 'css' | 'device';
  clip?: Rect;
}

export interface ActionOptions {
  timeout?: number;
  force?: boolean;
  noWaitAfter?: boolean;
  trial?: boolean;
  position?: { x: number; y: number };
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

interface Queryable {
  locator(selector: string, options?: FilterOptions): Locator;
  getByRole(role: AriaRole, options?: RoleOptions): Locator;
  getByText(text: string | RegExp, options?: TextOptions): Locator;
  getByLabel(text: string | RegExp, options?: TextOptions): Locator;
  getByPlaceholder(text: string | RegExp, options?: TextOptions): Locator;
  getByTestId(testId: string | RegExp): Locator;
}

export interface Locator extends Queryable {
  first(): Locator;
  last(): Locator;
  nth(index: number): Locator;
  filter(options: FilterOptions): Locator;
  all(): Promise<Locator[]>;
  count(): Promise<number>;
  click(options?: ActionOptions & { clickCount?: number }): Promise<void>;
  tap(options?: ActionOptions): Promise<void>;
  hover(options?: ActionOptions): Promise<void>;
  focus(options?: { timeout?: number }): Promise<void>;
  fill(value: string, options?: ActionOptions): Promise<void>;
  press(key: string, options?: { delay?: number; timeout?: number }): Promise<void>;
  check(options?: ActionOptions): Promise<void>;
  selectOption(value: string | string[], options?: ActionOptions): Promise<string[]>;
  dispatchEvent(type: string, eventInit?: Record<string, unknown>): Promise<void>;
  scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void>;
  waitFor(options?: WaitForOptions): Promise<void>;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isDisabled(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  innerText(options?: { timeout?: number }): Promise<string>;
  allTextContents(): Promise<string[]>;
  allInnerTexts(): Promise<string[]>;
  textContent(options?: { timeout?: number }): Promise<string | null>;
  inputValue(options?: { timeout?: number }): Promise<string>;
  getAttribute(name: string, options?: { timeout?: number }): Promise<string | null>;
  boundingBox(options?: { timeout?: number }): Promise<Rect | null>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  evaluate<R>(fn: ElementFunction<HTMLElement, undefined, R>): Promise<R>;
  evaluate<R, Arg>(fn: ElementFunction<HTMLElement, Arg, R>, arg: Arg): Promise<R>;
  evaluateAll<R>(fn: (elements: HTMLElement[]) => R | Promise<R>): Promise<R>;
}

export interface Keyboard {
  press(key: string, options?: { delay?: number }): Promise<void>;
  type(text: string, options?: { delay?: number }): Promise<void>;
  down(key: string): Promise<void>;
  up(key: string): Promise<void>;
}

export interface Mouse {
  click(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  wheel(deltaX: number, deltaY: number): Promise<void>;
}

export interface Touchscreen {
  tap(x: number, y: number): Promise<void>;
}

export interface JSHandle {
  dispose(): Promise<void>;
}

export interface Clock {
  install(options?: { time?: number | string | Date }): Promise<void>;
  fastForward(ticks: number | string): Promise<void>;
  runFor(ticks: number | string): Promise<void>;
  setFixedTime(time: number | string | Date): Promise<void>;
}

export interface Page extends Queryable {
  readonly clock: Clock;
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;
  readonly touchscreen: Touchscreen;
  goto(
    url: string,
    options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      timeout?: number;
    },
  ): Promise<Response | null>;
  reload(options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  }): Promise<Response | null>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  setContent(
    html: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' },
  ): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  viewportSize(): { width: number; height: number } | null;
  setDefaultTimeout(timeout: number): void;
  addInitScript<Arg>(
    script: PageFunction<Arg, unknown> | { content: string } | string,
    arg?: Arg,
  ): Promise<void>;
  addScriptTag(options: {
    content?: string;
    url?: string;
    path?: string;
    type?: string;
  }): Promise<unknown>;
  addStyleTag(options: { content?: string; url?: string; path?: string }): Promise<unknown>;
  evaluate<R>(fn: PageFunction<undefined, R>): Promise<R>;
  evaluate<R, Arg>(fn: PageFunction<Arg, R>, arg: Arg): Promise<R>;
  waitForFunction<R>(fn: PageFunction<undefined, R>): Promise<JSHandle>;
  waitForFunction<R, Arg>(
    fn: PageFunction<Arg, R>,
    arg: Arg,
    options?: { timeout?: number; polling?: number | 'raf' },
  ): Promise<JSHandle>;
  waitForTimeout(timeout: number): Promise<void>;
  waitForURL(
    url: string | RegExp | ((url: URL) => boolean),
    options?: { timeout?: number },
  ): Promise<void>;
  waitForResponse(
    predicate: string | RegExp | ((response: Response) => boolean | Promise<boolean>),
    options?: { timeout?: number },
  ): Promise<Response>;
  waitForEvent(event: 'dialog', options?: { timeout?: number }): Promise<Dialog>;
  waitForEvent(event: 'download', options?: { timeout?: number }): Promise<Download>;
  waitForEvent(event: 'request', options?: { timeout?: number }): Promise<Request>;
  waitForEvent(event: 'response', options?: { timeout?: number }): Promise<Response>;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  route(url: string | RegExp, handler: (route: Route) => Promise<void> | void): Promise<void>;
  on(event: 'dialog', listener: (dialog: Dialog) => void): Page;
  on(event: 'console', listener: (message: ConsoleMessage) => void): Page;
  on(event: 'pageerror', listener: (error: Error) => void): Page;
  on(event: 'request', listener: (request: Request) => void): Page;
  on(event: 'response', listener: (response: Response) => void): Page;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  bringToFront(): Promise<void>;
  close(): Promise<void>;
}

export interface ContextOptions {
  viewport?: { width: number; height: number } | null;
  deviceScaleFactor?: number;
  hasTouch?: boolean;
  isMobile?: boolean;
  reducedMotion?: 'reduce' | 'no-preference';
  colorScheme?: 'light' | 'dark' | 'no-preference';
  userAgent?: string;
  locale?: string;
  serviceWorkers?: 'allow' | 'block';
  permissions?: string[];
  storageState?: { cookies: unknown[]; origins: unknown[] };
}

export interface BrowserContext {
  newPage(): Promise<Page>;
  pages(): Page[];
  route(url: string | RegExp, handler: (route: Route) => Promise<void> | void): Promise<void>;
  addInitScript<Arg>(
    script: PageFunction<Arg, unknown> | { content: string } | string,
    arg?: Arg,
  ): Promise<void>;
  on(event: 'page', listener: (page: Page) => void): BrowserContext;
  on(event: 'request', listener: (request: Request) => void): BrowserContext;
  grantPermissions(permissions: string[], options?: { origin?: string }): Promise<void>;
  close(): Promise<void>;
}

export interface Browser {
  newContext(options?: ContextOptions): Promise<BrowserContext>;
  newPage(options?: ContextOptions): Promise<Page>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  channel?: string;
  executablePath?: string;
  headless?: boolean;
  args?: string[];
}

export interface BrowserType {
  launch(options?: LaunchOptions): Promise<Browser>;
}

/**
 * Loads `chromium` from the reviewed Playwright package path given on the command line, or the
 * named fallback package when one is installed in the environment.
 */
export function loadChromium(
  fallback: 'playwright' | 'playwright-core' = 'playwright',
): BrowserType {
  const require = createRequire(import.meta.url);
  const playwright = require(process.argv[2] ?? fallback) as { chromium: BrowserType };
  return playwright.chromium;
}

/** Local runs choose the browser through OPENSIGNET_TEST_BROWSER_EXECUTABLE, else Edge. */
export function browserLaunchOptions(): LaunchOptions {
  const executablePath = process.env.OPENSIGNET_TEST_BROWSER_EXECUTABLE;
  return executablePath
    ? { executablePath, headless: true }
    : { channel: 'msedge', headless: true };
}

/** Returns a rendered element's box, failing the test when the element has no layout box. */
export async function boxOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Expected a rendered element with a layout box');
  return box;
}
