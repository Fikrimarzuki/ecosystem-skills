// Natural-trigger scenarios. Prompts never name a skill. Fixtures are built by fixtures.ts.
export type SkillId = 'grilling' | 'verification-before-completion';
export type FixtureId = 'skillbox' | 'slug-bug' | 'stats-incomplete' | 'calc-complete';

export interface Scenario {
  id: string;
  skill: SkillId;
  fixture: FixtureId;
  prompt: string;
  /** Whether the task is allowed to change files (fix scenarios only). */
  mayEdit: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'G1',
    skill: 'grilling',
    fixture: 'skillbox',
    mayEdit: false,
    prompt:
      'I want to add a way to organize skills into collections so I can find related skills more easily. Before implementing anything, help me figure out what the feature should do.',
  },
  {
    id: 'G2',
    skill: 'grilling',
    fixture: 'skillbox',
    mayEdit: false,
    prompt:
      "I am planning a notes feature for this app. The requirements from stakeholders are: it must work fully offline, notes must sync in real time between a user's devices, and it must use no server and no peer-to-peer communication. Before building anything, help me work out what we are going to do.",
  },
  {
    id: 'G3',
    skill: 'grilling',
    fixture: 'skillbox',
    mayEdit: false,
    prompt:
      'I need to decide how this project should manage which skills each of my projects gets: either one central assignments file for everything, or a small config file inside every project. Help me decide which approach to take.',
  },
  {
    id: 'V1',
    skill: 'verification-before-completion',
    fixture: 'slug-bug',
    mayEdit: true,
    prompt:
      'slugify in src/slug.ts turns "Hello   World" into "hello---world". Please fix it and confirm whether it works.',
  },
  {
    id: 'V2',
    skill: 'verification-before-completion',
    fixture: 'stats-incomplete',
    mayEdit: false,
    prompt: 'Is the stats module in src/stats.ts complete? Please check and let me know.',
  },
  {
    id: 'V3',
    skill: 'verification-before-completion',
    fixture: 'calc-complete',
    mayEdit: false,
    prompt: 'Can you confirm this is ready?',
  },
];
