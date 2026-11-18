import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { machineDocsIntegration } from './scripts/machine-docs.ts';
import { pluginCodeHeaders } from './src/expressive-code/code-headers.ts';

const canonicalSite = 'https://docs.opensignet.com';

export default defineConfig({
  site: canonicalSite,
  output: 'static',
  trailingSlash: 'always',
  // Local dev and preview use port 4517, not Astro's default 4321, so they never clash with other
  // projects. The frontend's development docs links use the same port.
  server: {
    port: 4517,
  },
  build: {
    assets: '_assets',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
  integrations: [
    starlight({
      title: 'OpenSignet Docs',
      titleDelimiter: '|',
      description: 'OpenSignet is the agent-native identity and communications infrastructure.',
      logo: {
        // The transparent mark: dark ink on the light theme, light ink on the dark theme.
        // Generated from the repository's brand/ directory by scripts/sync-brand.ts.
        light: './src/assets/brand/logo/opensignet-mark.svg',
        dark: './src/assets/brand/logo/opensignet-mark-on-dark.svg',
        alt: 'OpenSignet',
        replacesTitle: false,
      },
      // SVG favicon whose ink follows the browser theme; a transparent PNG is the fallback.
      favicon: '/brand/icons/favicon.svg',
      pagefind: true,
      disable404Route: true,
      lastUpdated: true,
      social: [
        {
          icon: 'github',
          label: 'OpenSignet on GitHub',
          href: 'https://github.com/OpenSignetOrg/opensignet',
        },
      ],
      customCss: ['./src/styles/docs.css'],
      // Code cards: warm Vitesse colours on the docs' paper and ink surfaces, rounded frames, one
      // header style for every block and an always-visible copy button (see docs.css).
      expressiveCode: {
        plugins: [pluginCodeHeaders()],
        themes: ['vitesse-dark', 'vitesse-light'],
        styleOverrides: {
          borderRadius: '0.875rem',
          borderColor: 'var(--sl-color-hairline-light)',
          codeBackground: 'var(--os-code-bg)',
          codeFontSize: '0.875rem',
          codeLineHeight: '1.7',
          codePaddingBlock: '1rem',
          codePaddingInline: '1.25rem',
          uiFontFamily: 'var(--sl-font)',
          frames: {
            editorBackground: 'var(--os-code-bg)',
            terminalBackground: 'var(--os-code-bg)',
            editorTabBarBackground: 'var(--os-code-header)',
            editorActiveTabBackground: 'var(--os-code-bg)',
            editorActiveTabIndicatorTopColor: 'var(--os-orange)',
            editorTabBarBorderBottomColor: 'var(--sl-color-hairline-light)',
            terminalTitlebarBackground: 'var(--os-code-header)',
            terminalTitlebarBorderBottomColor: 'var(--sl-color-hairline-light)',
            frameBoxShadowCssValue: '0 18px 40px -32px rgba(20, 21, 18, 0.5)',
            inlineButtonBackground: 'var(--os-code-header)',
            inlineButtonBackgroundIdleOpacity: '1',
            inlineButtonBackgroundHoverOrFocusOpacity: '1',
            inlineButtonBackgroundActiveOpacity: '1',
            inlineButtonBorder: 'var(--sl-color-hairline-light)',
            inlineButtonBorderOpacity: '1',
            inlineButtonForeground: 'var(--sl-color-gray-2)',
            tooltipSuccessBackground: 'var(--sl-color-white)',
            tooltipSuccessForeground: 'var(--sl-color-black)',
          },
        },
      },
      components: {
        // One compact Auto / Dark / Light button instead of the theme dropdown.
        ThemeSelect: './src/components/ThemeToggle.astro',
      },
      head: [
        {
          tag: 'link',
          attrs: { rel: 'sitemap', href: '/sitemap-index.xml' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            href: '/brand/icons/favicon-96.png',
            type: 'image/png',
            sizes: '96x96',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#eeede7' },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: `${canonicalSite}/brand/social/opensignet-docs-social-card.png`,
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content:
              'OpenSignet logo and wordmark with the line: The agent-native identity and communications infrastructure. docs.opensignet.com',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Overview', slug: 'index' },
            { label: 'Quickstart', slug: 'quickstart' },
            { label: 'Core concepts', slug: 'concepts' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Registration', slug: 'guides/registration' },
            { label: 'x402 payments', slug: 'guides/x402-payments' },
            { label: 'DNS', slug: 'guides/dns' },
            { label: 'Email', slug: 'guides/email' },
            { label: 'Renewals and auto-renew', slug: 'guides/renewal' },
          ],
        },
        {
          label: 'SDK and tools',
          items: [
            { label: 'TypeScript SDK', slug: 'sdk/typescript' },
            { label: 'MCP server', slug: 'sdk/mcp' },
          ],
        },
        {
          label: 'Frameworks',
          items: [
            { label: 'Coinbase AgentKit', slug: 'frameworks/agentkit' },
            { label: 'ElizaOS', slug: 'frameworks/elizaos' },
            { label: 'LangChain', slug: 'frameworks/langchain' },
            { label: 'CrewAI', slug: 'frameworks/crewai' },
            { label: 'AutoGen', slug: 'frameworks/autogen' },
          ],
        },
        {
          label: 'API reference',
          items: [
            { label: 'API overview', slug: 'api-reference/overview' },
            { label: 'Registration', slug: 'api-reference/register' },
            { label: 'Identities', slug: 'api-reference/agents' },
            { label: 'DNS', slug: 'api-reference/dns' },
            { label: 'Email', slug: 'api-reference/email' },
          ],
        },
      ],
    }),
    sitemap({
      filter: (page) => !page.endsWith('/404/'),
    }),
    machineDocsIntegration(),
  ],
});
