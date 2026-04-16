export const supportedApps = [
  'Codex',
  'Gmail',
  'Gcal',
  'Slack',
  'Notion'
] as const;

export type SupportedAppName = (typeof supportedApps)[number];
