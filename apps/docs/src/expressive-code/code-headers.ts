import type { ExpressiveCodePlugin } from '@astrojs/starlight/expressive-code';

/**
 * Gives every code block a header, like the main website's code cards. Blocks without a `title`
 * get a label for their language, so a shell command and a TypeScript example look alike: label on
 * the left, copy button on the right (see docs.css).
 */
const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  bash: 'Terminal',
  sh: 'Terminal',
  shell: 'Terminal',
  zsh: 'Terminal',
  powershell: 'PowerShell',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  typescript: 'TypeScript',
  js: 'JavaScript',
  javascript: 'JavaScript',
  json: 'JSON',
  jsonc: 'JSON',
  http: 'HTTP',
  python: 'Python',
  py: 'Python',
  toml: 'TOML',
  yaml: 'YAML',
  yml: 'YAML',
  text: 'Text',
  txt: 'Text',
};

export function codeHeaderLabel(language: string): string {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? 'Code';
}

export function pluginCodeHeaders(): ExpressiveCodePlugin {
  return {
    name: 'OpenSignet code headers',
    hooks: {
      // Runs after the frames plugin has read `title` from the block's meta and file-name comments.
      preprocessCode: ({ codeBlock }) => {
        const props = codeBlock.props as { title?: string; frame?: string };
        if (props.frame === 'none' || props.title) return;
        props.title = codeHeaderLabel(codeBlock.language);
      },
    },
  };
}
