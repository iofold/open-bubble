export interface RepoMapping {
  id: string;
  cwd: string;
  aliases?: string[];
  isDefault?: boolean;
}

export interface RepoSelection {
  id: string;
  cwd: string;
  reason: 'alias_match' | 'default_repo' | 'single_repo';
}

const normalize = (value: string): string =>
  value.trim().toLowerCase();

const countAliasHits = (promptText: string, aliases: string[]): number => {
  const haystack = normalize(promptText);

  return aliases.reduce((total, alias) => {
    const needle = normalize(alias);

    if (!needle) {
      return total;
    }

    return haystack.includes(needle) ? total + needle.length : total;
  }, 0);
};

export const inferRepoFromPrompt = (
  promptText: string,
  mappings: RepoMapping[]
): RepoSelection => {
  if (mappings.length === 0) {
    throw new Error('No repo mappings are configured.');
  }

  if (mappings.length === 1) {
    const [only] = mappings;

    if (!only) {
      throw new Error('No repo mappings are configured.');
    }

    return {
      id: only.id,
      cwd: only.cwd,
      reason: 'single_repo'
    };
  }

  const ranked = mappings
    .map((mapping) => ({
      mapping,
      score: countAliasHits(promptText, mapping.aliases ?? [])
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];

  if (best && best.score > 0) {
    return {
      id: best.mapping.id,
      cwd: best.mapping.cwd,
      reason: 'alias_match'
    };
  }

  const fallback = mappings.find((mapping) => mapping.isDefault);

  if (fallback) {
    return {
      id: fallback.id,
      cwd: fallback.cwd,
      reason: 'default_repo'
    };
  }

  throw new Error('No repo mapping matched the prompt and no default repo is configured.');
};
