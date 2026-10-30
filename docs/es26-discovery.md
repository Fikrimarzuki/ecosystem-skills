# ES26 — Resource discovery, source-first UX and catalog navigation

Status: implemented locally (2026-11-08). Nothing was committed, pushed, deployed, approved, installed or assigned. No
third-party code, installer or MCP server was run or connected; external repositories were read with `git ls-remote`,
blob-less shallow clones and `git archive`, and skill folders were scanned with this repository's static scanner
(`review.ts`), as in ES16.

## Summary

|                   | Before ES26 | After ES26                                                                                           |
| ----------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Registered skills | 248         | **263** (+15 unreviewed third-party candidates; the approved set is unchanged: 6)                    |
| Sources           | 58          | **76** (+18 new, 1 ES16 lead resolved in place)                                                      |
| Resources (new)   | —           | **17**: 5 MCP servers, 3 agent toolkits, 2 agent dev tools, 1 reference, 6 other developer resources |

See [resources.md](resources.md) for the model and policies, and [website.md](website.md) for the site changes.

## Classification of the 22 requested items

All 22 upstreams were verified (publisher established from the organisation, licence holder or the publisher's own
site). None was ambiguous or unresolved. Revisions are the commits examined on 2026-11-08.

| #   | Requested as                       | Upstream                                                                                                    | Revision       | Licence                      | Class                     | Source (decision)                                         | Skills registered | Resources                                        | Status                      |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------- | ------------------------- | --------------------------------------------------------- | ----------------- | ------------------------------------------------ | --------------------------- |
| 1   | frontendsupply Bots                | [frontendsupply/bots](https://github.com/frontendsupply/bots)                                               | `57812c1b9384` | MIT                          | skill                     | `frontendsupply-bots` (with warnings)                     | 1                 | —                                                | new                         |
| 2   | AnmolChandiok Claude After Effects | [AnmolChandiok/claude-after-effects-skill](https://github.com/AnmolChandiok/claude-after-effects-skill)     | `4c1902663525` | MIT                          | skill                     | `anmolchandiok-claude-after-effects` (with warnings)      | 1                 | —                                                | new                         |
| 3   | brickystudios AI Fact Checker      | [BrickyStudios/ai-fact-checker-claude-skill](https://github.com/BrickyStudios/ai-fact-checker-claude-skill) | `97c7c6de49d1` | MIT                          | skill                     | `brickystudios-ai-fact-checker` (with warnings)           | 1                 | —                                                | new                         |
| 4   | marwanashraf22 Stack Architect     | [MarwanAshraf22/stack-architect](https://github.com/MarwanAshraf22/stack-architect)                         | `bf60fba666ce` | MIT                          | skill                     | `marwanashraf22-stack-architect` (with warnings)          | 1                 | —                                                | new                         |
| 5   | Google Skills                      | [google/skills](https://github.com/google/skills)                                                           | `2194d3b8b1f3` | Apache-2.0                   | skill collection (187)    | `google-skills` (reference only, registration deferred)   | 0                 | google-developer-knowledge-mcp                   | new                         |
| 6   | heygen-com HyperFrames             | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)                                         | `4e2a1c215a42` | Apache-2.0                   | framework + skills        | `heygen-hyperframes` (with warnings)                      | 4 (unchanged)     | hyperframes-framework, hyperframes-mcp-connector | duplicate of ES16 source    |
| 7   | feitangyuan OneTake                | [feitangyuan/OneTake](https://github.com/feitangyuan/OneTake)                                               | `abb6d17279cd` | PolyForm-Noncommercial-1.0.0 | skill                     | `feitangyuan-onetake` (with warnings)                     | 1                 | —                                                | new                         |
| 8   | pyang5166 gbro-collage-broll       | [pyang5166/gbro-collage-broll](https://github.com/pyang5166/gbro-collage-broll)                             | `a1a4ee2e2abf` | MIT                          | skill                     | `pyang5166-gbro-collage-broll` (with warnings)            | 1                 | —                                                | new                         |
| 9   | johnheibel ClaudeAnimationBase     | [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)                         | `0ac8bf2b3194` | MIT                          | agent toolkit             | `claude-animation-base` (reference only)                  | 0                 | claude-animation-base                            | duplicate of ES16 source    |
| 10  | garrytan gstack                    | [garrytan/gstack](https://github.com/garrytan/gstack)                                                       | `d479c5bf1efe` | MIT                          | agent toolkit (72 skills) | `garrytan-gstack` (reference only)                        | 0                 | gstack                                           | new                         |
| 11  | playcanvas Engine                  | [playcanvas/engine](https://github.com/playcanvas/engine)                                                   | `597f7e999acc` | MIT                          | developer resource        | `playcanvas-engine` (reference only)                      | 0                 | playcanvas-engine                                | new                         |
| 12  | pmndrs cannon-es                   | [pmndrs/cannon-es](https://github.com/pmndrs/cannon-es)                                                     | `dd971c4a604a` | MIT                          | developer resource        | `pmndrs-cannon-es` (reference only)                       | 0                 | cannon-es                                        | new                         |
| 13  | nortikin Sverchok                  | [nortikin/sverchok](https://github.com/nortikin/sverchok)                                                   | `d61aeee84683` | GPL-3.0 (see warnings)       | developer resource        | `nortikin-sverchok` (reference only)                      | 0                 | sverchok                                         | new                         |
| 14  | effekseer Effekseer                | [effekseer/Effekseer](https://github.com/effekseer/Effekseer)                                               | `b5700082b49b` | MIT                          | developer resource        | `effekseer` (reference only)                              | 0                 | effekseer                                        | new                         |
| 15  | doxas twigl                        | [doxas/twigl](https://github.com/doxas/twigl)                                                               | `fc09f1ecee82` | MIT                          | developer resource        | `doxas-twigl` (reference only)                            | 0                 | twigl                                            | new                         |
| 16  | github Spec Kit                    | [github/spec-kit](https://github.com/github/spec-kit)                                                       | `c43849408ac0` | MIT                          | agent dev tool + MCP      | `github-spec-kit` (reference only)                        | 0                 | spec-kit, spec-kit-mcp                           | new                         |
| 17  | miqdadbadjuber Anti-Slop           | [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop)                                     | `9504989f162a` | MIT                          | skill collection + MCP    | `anti-slop-unresolved` (with warnings)                    | 6                 | antislop-contrast-mcp                            | ES16 lead resolved in place |
| 18  | gosom Google Maps Scraper          | [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper)                                   | `903b96d7aa88` | MIT                          | developer resource        | `gosom-google-maps-scraper` (reference only)              | 0                 | google-maps-scraper                              | new                         |
| 19  | kaomei Stickman Video Director     | [kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director)                         | `eb4bb378c471` | MIT                          | skill                     | `kaomei-stickman-video-director` (with warnings)          | 1                 | —                                                | new                         |
| 20  | Appllama Skills                    | [Appllama/appllama-skills](https://github.com/Appllama/appllama-skills)                                     | `dd5caaec3d5d` | MIT                          | skill collection          | `appllama-skills` (with warnings)                         | 2                 | (see 21)                                         | new                         |
| 21  | Appllama MCP                       | [appllama.io/mcp](https://appllama.io/mcp) (endpoint `mcp.appllama.io/mcp`)                                 | — (hosted)     | none published               | MCP server (remote)       | `appllama-skills` (same publisher, no public server repo) | 0                 | appllama-mcp                                     | same source as 20           |
| 22  | Donchitos Claude Code Game Studios | [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)                 | `05ad7c8a5b8a` | MIT                          | agent toolkit (74 skills) | `donchitos-claude-code-game-studios` (reference only)     | 0                 | claude-code-game-studios                         | new                         |

### Duplicates and resolved leads

- **HyperFrames** (6) and **ClaudeAnimationBase** (9) were already sources from ES16; no duplicate source was created.
  HyperFrames' upstream HEAD has moved to `0f5914dc445c` with 9 skills (new: `reverse-any-video`, `style-sampling`);
  the four registered skills stay pinned at `4e2a1c215a42`. Updating them belongs to the upstream-check workflow
  ([library.md](library.md)), not to discovery.
- **Anti-Slop** (17) resolves the ES16 lead `anti-slop-unresolved`: the owner named the repository explicitly. The id
  is kept so existing links stay valid; the record is now verified with six candidates.
- **Appllama MCP** (21) has no public server repository; it is catalogued as a resource of the `appllama-skills`
  source (the same publisher, which ships the client configuration).

### Not registered as skills, on purpose

- **Google Skills**: 187 distinct skills. Registering them is deferred to a dedicated batch: the size alone would
  double the catalogue, and 16 bundled plugins are git submodules from other repositories that were not inspected.
- **gstack** and **Claude Code Game Studios**: their skills are designed to run with setup scripts, hooks, bundled
  tools and subagents, so they are catalogued as toolkits.
- **Spec Kit**: its two `SKILL.md` files are maintainer skills for the repository itself.
- **Google Maps Scraper**: its skill self-updates from the network and drives a scraper whose own README warns about
  terms of service.

## Security notes (recorded, not reviewed)

Every new source carries the concerns seen during discovery as `warnings`; every resource carries them as
`security.concerns` with status `notes-recorded`. Highlights:

- **Hooks and agent configuration.** Claude Code Game Studios ships `.claude/settings.json` with 18 hook scripts that
  run automatically (one checks GitHub for updates daily). _ES27 correction: `settings.json` registers 15 hook
  commands (15 scripts); the hooks folder holds 18 scripts, including the update check that runs through the
  session-start hook, a helper library and one unwired diagnostic. See [es27-security-audit.md](es27-security-audit.md)._ gstack's install prompt asks the agent to write a
  `CLAUDE.md` rule, and its team mode commits a hook and auto-updates. These were recorded as findings only.
- **Paid or remote services.** Appllama MCP (closed, credit-billed), HyperFrames' hosted connector (beta, HeyGen
  account), the Google Developer Knowledge MCP (API key), gbro-collage-broll (paid Gemini key), Stickman Autopilot
  (generation APIs).
- **Data leaving the machine.** Fact Checker sends claims to web search; Google Maps Scraper collects contact data,
  has telemetry on by default and may breach a third party's terms.
- **Licences.** OneTake is PolyForm Noncommercial (an approval blocker); Sverchok's `LICENSE` (GPL-3.0) disagrees
  with its source header (GPL-2.0-or-later); the hosted MCP services publish no licence.
- **Approval blockers.** `bots`, `stack-architect`, `onetake` and `gbro-collage-broll` keep `SKILL.md` at the
  repository root; `onetake` is noncommercial; `appllama-usage` only works through a paid closed remote MCP.

## Not verified

The Appllama MCP authentication mechanism (the README says "approve the connection with your Appllama account";
OAuth is likely), HyperFrames' default telemetry state and its hosted tool list, Effekseer's Vulkan runtime licence
text, release bundles (`.skill` files), and the contents of Google's submodule plugins.
