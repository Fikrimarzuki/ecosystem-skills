import { lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Agent, Skill } from './schema.ts';

/** Project-local skill directories, confirmed by running each agent (see docs/agent-compatibility.md). */
export const PROJECT_SKILL_DIRS: Partial<Record<Agent, string>> = {
  'claude-code': '.claude/skills',
  codex: '.agents/skills',
};

export type LinkState = 'linked' | 'wrong-target' | 'broken' | 'copy' | 'missing';

export interface LinkReport {
  skill: string;
  agent: Agent;
  state: LinkState;
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};

/**
 * Read-only filesystem check of how skills are exposed in a project directory, for every agent with a known
 * project skill directory. First-party skills should link to their folder in this repo; external skills to
 * their managed install in external/skills/<id>. This does NOT prove an agent discovers the skill.
 */
export function checkLinks(repoRoot: string, skills: Skill[], projectDir: string): LinkReport[] {
  const reports: LinkReport[] = [];
  for (const skill of skills) {
    const canonical = real(
      skill.source.type === 'first-party'
        ? resolve(repoRoot, skill.source.path)
        : resolve(repoRoot, 'external', 'skills', skill.id),
    );
    for (const [agent, dir] of Object.entries(PROJECT_SKILL_DIRS) as [Agent, string][]) {
      const entry = join(projectDir, dir, skill.id);
      let state: LinkState;
      try {
        const st = lstatSync(entry);
        if (st.isSymbolicLink()) {
          const target = real(entry);
          state = !target
            ? 'broken'
            : canonical && target === canonical
              ? 'linked'
              : 'wrong-target';
        } else state = 'copy';
      } catch {
        state = 'missing';
      }
      reports.push({ skill: skill.id, agent, state });
    }
  }
  return reports;
}
