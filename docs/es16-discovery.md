# ES16 — Comprehensive skill discovery and registry expansion

Status: complete (2026-10-30). Discovery, audit and metadata registration only. **Nothing was approved, installed,
assigned or activated**, nothing was executed from a third-party repository, and no consumer repository was touched.

## 0. Summary

|                               |                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Requested items               | 29 (13 original repositories, 13 design/UI candidates, 3 video/animation candidates)           |
| Source records                | 58 (31 from the request, 27 additional)                                                        |
| Source decisions              | 14 register for review, 31 register with warnings, 10 reference only, 3 unresolved, 0 rejected |
| Skills registered by ES16     | **216** unapproved candidates (154 for review, 62 with warnings)                               |
| Registry total                | 245 skills (29 before ES16); approved set unchanged (6)                                        |
| Unresolved identities         | 3 (Anti-slop, Neuform AI, MotionSites)                                                         |
| Licences of registered skills | MIT 153, Apache-2.0 45, unknown 12, BSD-3-Clause 6                                             |

Candidates are registered with `review.status: "unreviewed"` (shown on the site as _Candidate · discovered_), a
`discovery` record (outcome, warnings, dependencies, content hash of the folder) and a link to their source record.
Every pin is a full commit SHA. The new data model is described in [registry.md](registry.md).

## 1. Requested repositories and named candidates (29 items, 31 rows)

Refero (skill vs hosted styles library) and TypeUI (CLI/skill vs registry) each resolved into two sources, hence 31 rows for the 29 requested items.

| #   | Requested as                                                          | Resolved upstream                                                                                       | Commit         | Identity   | Classification   | Decision               | Skills found | Registered         |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------- | ---------- | ---------------- | ---------------------- | ------------ | ------------------ |
| 1   | addyosmani/agent-skills                                               | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)                                   | `eb07f19f52c2` | verified   | skill collection | register with warnings | 25           | 25 new             |
| 2   | mattpocock/skills                                                     | [mattpocock/skills](https://github.com/mattpocock/skills)                                               | `a496f5513d4a` | verified   | skill collection | register with warnings | 38           | 22 new + 5 earlier |
| 3   | obra/superpowers                                                      | [obra/superpowers](https://github.com/obra/superpowers)                                                 | `2ce8aa15d05b` | verified   | skill collection | register with warnings | 15           | 8 new + 6 earlier  |
| 4   | cloudflare/security-audit-skill                                       | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)                   | `c1c8a8c14710` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 5   | agentskills/agentskills                                               | [agentskills/agentskills](https://github.com/agentskills/agentskills)                                   | `69ef37e9424c` | verified   | standard         | reference only         | 0            | 0                  |
| 6   | oil-oil/oil-ui                                                        | [oil-oil/oil-ui](https://github.com/oil-oil/oil-ui)                                                     | `e3334bd5f6e7` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 7   | krillinai/OpenCreator                                                 | [krillinai/OpenCreator](https://github.com/krillinai/OpenCreator)                                       | `d17bdc16d431` | verified   | application      | reference only         | 15           | 0                  |
| 8   | cloudai-x/threejs-skills                                              | [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills)                                 | `0e181866f095` | verified   | skill collection | register for review    | 13           | 12 new + 1 earlier |
| 9   | greensock/gsap-skills                                                 | [greensock/gsap-skills](https://github.com/greensock/gsap-skills)                                       | `aed9cfd32777` | verified   | skill collection | register for review    | 8            | 8 new              |
| 10  | zanwei/design-dna                                                     | [zanwei/design-dna](https://github.com/zanwei/design-dna)                                               | `593e39bc9e36` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 11  | lottiefiles/motion-design-skill                                       | [lottiefiles/motion-design-skill](https://github.com/lottiefiles/motion-design-skill)                   | `f9a8a041b851` | verified   | single skill     | register for review    | 1            | 1 new              |
| 12  | AThevon/genjutsu                                                      | [AThevon/genjutsu](https://github.com/AThevon/genjutsu)                                                 | `1f518a71378b` | verified   | plugin/framework | register with warnings | 20           | 3 new              |
| 13  | pbakaus/impeccable                                                    | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                             | `3930843f0c21` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 14  | Hallmark                                                              | [nutlope/hallmark](https://github.com/nutlope/hallmark)                                                 | `4f6a46c6dc32` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 15  | Taste Skill                                                           | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)                                         | `12af471f627f` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 16  | Anti-slop                                                             | —                                                                                                       | —              | ambiguous  | unverified lead  | unresolved             | 0            | 0                  |
| 17  | UI UX Pro Max                                                         | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)         | `28b3b8dee8c9` | verified   | skill collection | register with warnings | 7            | 7 new              |
| 18  | VoltAgent Awesome DESIGN.md                                           | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)                           | `fcc702849322` | verified   | design reference | reference only         | 0            | 0                  |
| 19  | Nexu Open Design                                                      | [nexu-io/open-design](https://github.com/nexu-io/open-design)                                           | `fa19ff40e34d` | verified   | application      | reference only         | 562          | 0                  |
| 20  | Elaya AI Design Skills                                                | [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills)                         | `ded7efc9d5c0` | verified   | skill collection | register for review    | 1            | 1 new              |
| 21  | Design MD — Hyperbrowser AI                                           | [hyperbrowserai/hyperbrowser-app-examples](https://github.com/hyperbrowserai/hyperbrowser-app-examples) | `4fdaa93d77ed` | verified   | application      | reference only         | 0            | 0                  |
| 22  | Styles — Refero Design (skill)                                        | [referodesign/refero_skill](https://github.com/referodesign/refero_skill)                               | `2382e518f900` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 23  | Styles — Refero Design                                                | [https://styles.refero.design](https://styles.refero.design)                                            | —              | verified   | design reference | reference only         | 0            | 0                  |
| 24  | DesignMD — Supply                                                     | [context-dot-dev/designmd-supply](https://github.com/context-dot-dev/designmd-supply)                   | `e6bedb59fe97` | verified   | application      | reference only         | 0            | 0                  |
| 25  | TypeUI.sh                                                             | [bergside/typeui](https://github.com/bergside/typeui)                                                   | `efc5f21dff38` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 26  | TypeUI.sh (design-skill library)                                      | [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills)                     | `f631a09b4fcc` | verified   | design reference | reference only         | 67           | 0                  |
| 27  | Neuform AI                                                            | —                                                                                                       | —              | unresolved | unverified lead  | unresolved             | 0            | 0                  |
| 28  | MotionSites AI Claude Skill                                           | —                                                                                                       | —              | ambiguous  | unverified lead  | unresolved             | 0            | 0                  |
| 29  | John Heibel — Claude Animation Base (johnheibel/claudeanimation-base) | [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)                     | `0ac8bf2b3194` | verified   | application      | reference only         | 0            | 0                  |
| 30  | Vincentwei1021 — Video Shotcraft                                      | [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft)                     | `1266a3ec4831` | verified   | single skill     | register with warnings | 1            | 1 new              |
| 31  | Vincentwei1021 — MG Styles 15                                         | [Vincentwei1021/mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15)                           | `49052d80bfaf` | verified   | design reference | reference only         | 0            | 0                  |

"Skills found" counts SKILL.md folders at the examined commit, excluding copies made for other agents and test
fixtures where they were identified. For Open Design and OpenCreator it is a raw count (562 and 15 files named
SKILL.md); the applications are not skill sources (section 12).

## 2. Exact upstream resolution

Evidence standard: a repository is "verified" when ownership is shown by an independent link or identity (the
project's own site or docs naming the repository, the same author on both sides, the licence/copyright line, the
organisation's own domain). A search hit, similarly named fork, directory listing or marketplace wrapper is not
proof. Where the link only runs one way, the identity is recorded as ambiguous.

- **The 13 original repositories** were all verified as given. `agentskills/agentskills` contains no installable
  skill, so it is a standard.
- **Hallmark** — `nutlope/hallmark`; README states "Made by Together AI", homepage usehallmark.com.
- **Taste Skill** — `Leonxlnx/taste-skill`; folder `taste-skill`, but the frontmatter name is `design-taste-frontend`
  (a mismatch with the Agent Skills spec; registered under the id `taste-skill`).
- **Anti-slop — ambiguous, unresolved.** `miqdadbadjuber/anti-slop` (MIT, 6 skills, antislop.ai.id links to it) is the
  most plausible single project, but the label is used by several projects, including two requested separately
  (Hallmark, Taste Skill). Not registered; the audit of its six skills is ready if it is confirmed.
- **UI UX Pro Max** — `nextlevelbuilder/ui-ux-pro-max-skill` (7 skills).
- **VoltAgent Awesome DESIGN.md** — `VoltAgent/awesome-design-md`: 84 DESIGN.md files, no skill.
- **Nexu Open Design** — `nexu-io/open-design`: an application.
- **Elaya AI Design Skills** — `elayadesign/ai-design-skills`: despite the plural name, one skill.
- **Design MD (Hyperbrowser)** — resolved to an _application_: `design-md.hyperbrowser.ai`, source in
  `hyperbrowserai/hyperbrowser-app-examples` (folder `hyperdesign/`). Not a skill. A flat `design-skill.md` exists in
  `hyperbrowserai/examples` but it is not a skill folder.
- **Styles — Refero Design** — two separate things: the official skill `referodesign/refero_skill` (registered) and the
  hosted library styles.refero.design (no repository; reference only).
- **DesignMD — Supply** — `context-dot-dev/designmd-supply`: a Next.js application, no skill. (The site returned
  HTTP 429, so ownership rests on the repository homepage field.)
- **TypeUI.sh** — Bergside LLC: `bergside/typeui` (CLI/MCP, one skill, registered) and `bergside/awesome-design-skills`
  (67 style skills, reference only). Both repositories name typeui.sh as homepage; the reverse link could not be fetched.
- **Neuform AI — unresolved.** neuform.ai is a commercial, login-walled service with no repository or skill.
- **MotionSites AI Claude Skill — ambiguous, unresolved.** `Motionsites-AI/claude-skill` exists, but motionsites.ai
  does not link to it, and the organisation was created on the day of its last commit. Not registered.
- **John Heibel — Claude Animation Base.** The requested `johnheibel/claudeanimation-base` does not exist (verified).
  The real repository is **`JohnHeibel/ClaudeAnimationBase`** (copyright line and commits name John Heibel). It has
  no SKILL.md: a starter kit with an instruction guide, so reference only.
- **Vincentwei1021 — Video Shotcraft** — verified; one root-level skill.
- **Vincentwei1021 — MG Styles 15** — the repository is `Vincentwei1021/mg-styles-15` (MIT, verified through its
  LICENSE); a showcase and prompt library, no SKILL.md.

## 3. Repository classification

Of the 31 requested sources: 10 single skill, 7 skill collection, 5 application, 4 design reference, 3 unverified lead, 1 standard, 1 plugin/framework.
Representation in the registry:

| Kind                               | Where it lives                                                                         | Can it carry skills?        |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------- |
| Installable individual skill       | `registry/skills.json` (`origin: external`)                                            | yes, pinned to SHA + folder |
| Multi-skill collection / framework | `registry/sources.json` (`kind: skill-collection`, `framework`) + one skill entry each | yes                         |
| Application with a skills layer    | source, `kind: application`, `reference-only`                                          | no                          |
| Design-system reference collection | source, `kind: design-reference`, `reference-only`                                     | no                          |
| Standard / specification           | source, `kind: standard`, `reference-only`                                             | no                          |
| Unverified lead                    | source, `kind: lead`, `unresolved` (no upstream, no pin)                               | no                          |

Lifecycle is unchanged: **discovered → reviewed → approved → installed → activated**. Registration here is the first step
only.

## 4. Individual skills discovered

Totals per source are in the tables (column "Skills found"). In the original 13 repositories: addyosmani/agent-skills 25,
mattpocock/skills 38, obra/superpowers 15, cloudflare/security-audit-skill 1, oil-ui 1, OpenCreator 15 (application-bound),
threejs-skills 13, gsap-skills 8, design-dna 1, motion-design-skill 1, genjutsu 20 (3 entry skills + 17 internal modules),
impeccable 1 (about 21 generated harness copies plus fixtures), agentskills 0.

## 5. Individual skills registered (216)

Categories: planning 24, mobile 22, frontend-design 21, video 17, ai-engineering 17, game-dev 16, graphics-3d 12, motion-design 11, devops 10, performance 9, security 9, architecture 8, testing 7, accessibility 7, database 7, react 6, code-review 3, debugging 3, documentation 3, code-quality 2, tooling 1, vue 1.

### Original 13 repositories and design/video candidates

- **addyosmani/agent-skills** (25): `addy-test-driven-development`, `api-and-interface-design`, `browser-testing-with-devtools`, `ci-cd-and-automation`, `code-review-and-quality`, `code-simplification`, `constraint-driven-development`, `context-engineering`, `debugging-and-error-recovery`, `deprecation-and-migration`, `documentation-and-adrs`, `doubt-driven-development`, `frontend-ui-engineering`, `git-workflow-and-versioning`, `idea-refine`, `incremental-implementation`, `interview-me`, `observability-and-instrumentation`, `performance-optimization`, `planning-and-task-breakdown`, `security-and-hardening`, `shipping-and-launch`, `source-driven-development`, `spec-driven-development`, `using-agent-skills`
- **mattpocock/skills** (22): `ask-matt`, `diagnosing-bugs`, `grill-with-docs`, `implement-spec`, `mattpocock-code-review`, `mattpocock-handoff`, `mattpocock-implement`, `mattpocock-pr`, `mattpocock-prototype`, `mattpocock-research`, `mattpocock-retro`, `mattpocock-teach`, `mattpocock-triage`, `mattpocock-wizard`, `setup-matt-pocock-skills`, `tdd`, `to-questionnaire`, `to-spec`, `to-tickets`, `wait-what`, `wayfinder`, `writing-for-agents`
- **obra/superpowers** (8): `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `subagent-driven-development`, `using-git-worktrees`, `using-superpowers`, `writing-skills`
- **cloudflare/security-audit-skill** (1): `cloudflare-security-audit`
- **oil-oil/oil-ui** (1): `oil-ui`
- **CloudAI-X/threejs-skills** (12): `threejs-animation`, `threejs-asset-pipeline`, `threejs-geometry`, `threejs-interaction`, `threejs-lighting`, `threejs-loaders`, `threejs-materials`, `threejs-performance`, `threejs-postprocessing`, `threejs-react-three-fiber`, `threejs-shaders`, `threejs-textures`
- **greensock/gsap-skills** (8): `gsap-core`, `gsap-frameworks`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-utils`
- **zanwei/design-dna** (1): `design-dna`
- **LottieFiles/motion-design-skill** (1): `lottie-motion-design`
- **AThevon/genjutsu** (3): `genjutsu-bunshin`, `genjutsu-cast`, `genjutsu-paint`
- **pbakaus/impeccable** (1): `impeccable`
- **nutlope/hallmark** (1): `hallmark`
- **Leonxlnx/taste-skill** (1): `taste-skill`
- **nextlevelbuilder/ui-ux-pro-max-skill** (7): `ui-ux-pro-max`, `uipro-banner-design`, `uipro-brand`, `uipro-design`, `uipro-design-system`, `uipro-slides`, `uipro-ui-styling`
- **elayadesign/ai-design-skills** (1): `landing-page-design`
- **referodesign/refero_skill** (1): `refero-design`
- **bergside/typeui** (1): `typeui-fundamentals`
- **Vincentwei1021/video-shotcraft** (1): `video-shotcraft`

### Additional sources

- **vercel/next.js (skills/)** (6): `next-bundle-optimizer`, `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-dev-loop`, `next-partial-prefetching-adoption`, `next-partial-prefetching-optimizer`
- **nuxt/ui (skills/)** (1): `nuxt-ui`
- **shadcn-ui/ui (skills/)** (2): `migrate-radix-to-base`, `shadcn`
- **addyosmani/web-quality-skills** (6): `web-quality-accessibility`, `web-quality-audit`, `web-quality-best-practices`, `web-quality-core-web-vitals`, `web-quality-performance`, `web-quality-seo`
- **masup9/a11y-specialist-skills** (6): `a11y-knowledge`, `auditing-wcag`, `implementing-a11y`, `planning-a11y-improvement`, `planning-wcag-audit`, `reviewing-a11y`
- **phaserjs/phaser (skills/)** (10): `phaser-animations`, `phaser-audio-and-sound`, `phaser-game-setup-and-config`, `phaser-input-keyboard-mouse-touch`, `phaser-loading-assets`, `phaser-physics-arcade`, `phaser-scale-and-responsive`, `phaser-scenes`, `phaser-sprites-and-images`, `phaser-tweens`
- **expo/skills** (10): `eas-update`, `eas-workflows`, `expo-animation`, `expo-data-fetching`, `expo-design-system`, `expo-dev-client`, `expo-native-ui`, `expo-project-structure`, `expo-router`, `expo-upgrade`
- **remotion-dev/skills** (12): `remotion-best-practices`, `remotion-captions`, `remotion-create`, `remotion-docs`, `remotion-interactivity`, `remotion-maps`, `remotion-markup`, `remotion-multimedia`, `remotion-render`, `remotion-saas`, `remotion-studio`, `remotion-upgrade`
- **heygen-com/hyperframes (skills/)** (4): `hyperframes`, `hyperframes-cli`, `hyperframes-media-use`, `remotion-to-hyperframes`
- **rive-app/skills** (1): `rive`
- **microsoft/playwright-cli** (1): `playwright-cli`
- **neondatabase/agent-skills** (2): `neon-postgres`, `neon-postgres-branches`
- **prisma/skills** (5): `prisma-cli`, `prisma-client-api`, `prisma-orm-setup`, `prisma-postgres`, `prisma-upgrade-v7`
- **cloudflare/skills** (6): `cloudflare-agents-sdk`, `cloudflare-durable-objects`, `cloudflare-web-perf`, `cloudflare-workers-best-practices`, `cloudflare-workers-profiling`, `cloudflare-wrangler`
- **flutter/agent-plugins** (6): `flutter-add-integration-test`, `flutter-add-widget-test`, `flutter-apply-architecture-best-practices`, `flutter-build-responsive-layout`, `flutter-fix-layout-issues`, `flutter-setup-declarative-routing`
- **android/skills** (7): `android-anr-audit-and-fix`, `android-intent-security`, `android-jetpack-compose-performance`, `android-navigation-3`, `android-permissions-security`, `android-r8-analyzer`, `android-testing-setup`
- **Kotlin/kotlin-agent-skills** (2): `kotlin-backend-jpa-entity-mapping`, `kotlin-tooling-java-to-kotlin`
- **twostraws/SwiftUI-Agent-Skill** (1): `swiftui-pro`
- **AvdLee/SwiftUI-Agent-Skill** (1): `swiftui-expert-skill`
- **AvdLee/Swift-Concurrency-Agent-Skill** (1): `swift-concurrency`
- **langchain-ai/langchain-skills** (6): `langchain-eval-engineering`, `langchain-fundamentals`, `langchain-rag`, `langgraph-fundamentals`, `langgraph-human-in-the-loop`, `langgraph-persistence`
- **huggingface/skills** (5): `hf-cli`, `hf-mcp`, `huggingface-local-models`, `train-sentence-transformers`, `transformers-js`
- **run-llama/llamaparse-agent-skills** (3): `liteparse`, `llamacloud-index`, `llamaparse`
- **anthropics/claude-plugins-official (mcp-server-dev)** (3): `build-mcp-app`, `build-mcp-server`, `build-mcpb`
- **getsentry/skills** (4): `sentry-find-bugs`, `sentry-gha-security-review`, `sentry-security-review`, `sentry-skill-scanner`
- **openai/skills** (3): `playwright`, `security-best-practices`, `security-ownership-map`
- **gamedev-skills/awesome-gamedev-agent-skills (Godot)** (6): `godot-animation`, `godot-export`, `godot-gdscript`, `godot-nodes-scenes`, `godot-signals-groups`, `godot-ui-control`

Registration rules applied: every verified, installable, portable skill of a _skill-centric_ upstream was registered
(addy, superpowers, gsap, threejs, design skills). For **large vendor packs** (Phaser 28, Expo 24, Android 36, Cloudflare 19,
LangChain 22, Hugging Face 26, Godot 16 of 77, Sentry 30, openai 44, Neon 9, Prisma 10, Flutter 25, Kotlin 10) only the skills in
the requested priority areas were registered, and the number discovered is recorded on the source (`skillsFound`) so the rest can
be added on request. Skills that are in-progress per upstream (7 in mattpocock), internal modules (17 genjutsu `_jutsu`),
repository-internal tooling (`expo-skill-eval`, playwright-cli `.claude/dev`, flutter `.agents`) and application-bound skills
(OpenCreator, Open Design) were not registered.

## 6. Additional sources

Registered (27 source records; table):

| #   | Source                                              | Resolved upstream                                                                                             | Commit         | Identity | Classification   | Decision               | Skills found | Registered        |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------- | -------- | ---------------- | ---------------------- | ------------ | ----------------- |
| 1   | vercel/next.js (skills/)                            | [vercel/next.js](https://github.com/vercel/next.js)                                                           | `79107ebd94e5` | verified | skill collection | register for review    | 6            | 6 new             |
| 2   | nuxt/ui (skills/)                                   | [nuxt/ui](https://github.com/nuxt/ui)                                                                         | `366e94845868` | verified | single skill     | register for review    | 1            | 1 new             |
| 3   | shadcn-ui/ui (skills/)                              | [shadcn-ui/ui](https://github.com/shadcn-ui/ui)                                                               | `96da9cc7f1aa` | verified | skill collection | register with warnings | 2            | 2 new             |
| 4   | addyosmani/web-quality-skills                       | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills)                             | `afa8da942115` | verified | skill collection | register with warnings | 6            | 6 new             |
| 5   | masup9/a11y-specialist-skills                       | [masup9/a11y-specialist-skills](https://github.com/masup9/a11y-specialist-skills)                             | `93d4afe2336a` | verified | skill collection | register with warnings | 6            | 6 new             |
| 6   | phaserjs/phaser (skills/)                           | [phaserjs/phaser](https://github.com/phaserjs/phaser)                                                         | `02d8931b626d` | verified | skill collection | register for review    | 28           | 10 new            |
| 7   | expo/skills                                         | [expo/skills](https://github.com/expo/skills)                                                                 | `05754e71d02a` | verified | skill collection | register with warnings | 24           | 10 new            |
| 8   | remotion-dev/skills                                 | [remotion-dev/skills](https://github.com/remotion-dev/skills)                                                 | `30d4553ecd46` | verified | skill collection | register with warnings | 12           | 12 new            |
| 9   | heygen-com/hyperframes (skills/)                    | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)                                           | `4e2a1c215a42` | verified | skill collection | register with warnings | 7            | 4 new             |
| 10  | rive-app/skills                                     | [rive-app/skills](https://github.com/rive-app/skills)                                                         | `0516522e5216` | verified | single skill     | register for review    | 1            | 1 new             |
| 11  | microsoft/playwright-cli                            | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)                                       | `b1a5903c5b63` | verified | single skill     | register with warnings | 1            | 1 new             |
| 12  | neondatabase/agent-skills                           | [neondatabase/agent-skills](https://github.com/neondatabase/agent-skills)                                     | `9df568a3f88a` | verified | skill collection | register for review    | 9            | 2 new             |
| 13  | prisma/skills                                       | [prisma/skills](https://github.com/prisma/skills)                                                             | `8ea289b730c2` | verified | skill collection | register for review    | 10           | 5 new             |
| 14  | cloudflare/skills                                   | [cloudflare/skills](https://github.com/cloudflare/skills)                                                     | `49a31e0b3229` | verified | skill collection | register for review    | 19           | 6 new             |
| 15  | flutter/agent-plugins                               | [flutter/agent-plugins](https://github.com/flutter/agent-plugins)                                             | `90fa51dc9d1b` | verified | skill collection | register for review    | 25           | 6 new             |
| 16  | android/skills                                      | [android/skills](https://github.com/android/skills)                                                           | `6daa53ef27fa` | verified | skill collection | register with warnings | 36           | 7 new             |
| 17  | Kotlin/kotlin-agent-skills                          | [Kotlin/kotlin-agent-skills](https://github.com/Kotlin/kotlin-agent-skills)                                   | `c2f90697bf71` | verified | skill collection | register for review    | 10           | 2 new             |
| 18  | twostraws/SwiftUI-Agent-Skill                       | [twostraws/SwiftUI-Agent-Skill](https://github.com/twostraws/SwiftUI-Agent-Skill)                             | `f2920b639952` | verified | single skill     | register with warnings | 1            | 1 new             |
| 19  | AvdLee/SwiftUI-Agent-Skill                          | [AvdLee/SwiftUI-Agent-Skill](https://github.com/AvdLee/SwiftUI-Agent-Skill)                                   | `204dba7c6725` | verified | single skill     | register with warnings | 1            | 1 new             |
| 20  | AvdLee/Swift-Concurrency-Agent-Skill                | [AvdLee/Swift-Concurrency-Agent-Skill](https://github.com/AvdLee/Swift-Concurrency-Agent-Skill)               | `d5770817d262` | verified | single skill     | register with warnings | 1            | 1 new             |
| 21  | langchain-ai/langchain-skills                       | [langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills)                             | `126c384d8552` | verified | skill collection | register with warnings | 22           | 6 new             |
| 22  | huggingface/skills                                  | [huggingface/skills](https://github.com/huggingface/skills)                                                   | `25910b3d0ba3` | verified | skill collection | register with warnings | 26           | 5 new             |
| 23  | run-llama/llamaparse-agent-skills                   | [run-llama/llamaparse-agent-skills](https://github.com/run-llama/llamaparse-agent-skills)                     | `2dcef7c62417` | verified | skill collection | register with warnings | 3            | 3 new             |
| 24  | anthropics/claude-plugins-official (mcp-server-dev) | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)                   | `f8c5e7a1dcb7` | verified | skill collection | register for review    | 27           | 3 new             |
| 25  | getsentry/skills                                    | [getsentry/skills](https://github.com/getsentry/skills)                                                       | `d12f250460ff` | verified | skill collection | register with warnings | 30           | 4 new             |
| 26  | openai/skills                                       | [openai/skills](https://github.com/openai/skills)                                                             | `49f948faa925` | verified | skill collection | register with warnings | 44           | 3 new + 1 earlier |
| 27  | gamedev-skills/awesome-gamedev-agent-skills (Godot) | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | `19d93f97c9c1` | verified | skill collection | register with warnings | 77           | 6 new             |

Examined or reported but **not registered** (leads only, not independently verified by this audit unless stated):
`callstackincubator/agent-skills` (React Native; overlaps Expo), `software-mansion-labs/skills` (no LICENSE file), `google-labs-code/stitch-skills`
(Apache-2.0; needs the Stitch MCP and has network shell scripts), `figma/mcp-server-guide` (**no licence found**),
`pixijs/pixijs` skills (not a priority), `openai/plugins`, `supermemoryai/skills` (no licence), `calesthio/OpenMontage`
(AGPL-3.0), `htdt/godogen` (installer scripts), `vercel-labs/json-render`, `tursodatabase/agent-skills`, `timescale/pg-aiguide`,
`firebase/agent-skills`, `planetscale/skills`, `stripe/ai`, and further skills inside already-registered sources
(trailofbits, openai/skills). **Gaps — no official upstream found:** Babylon.js, a pmndrs/React Three Fiber pack, Godot (only
the community pack), Vitest/Jest, Drizzle, Ollama/llama.cpp, an FFmpeg skill, an official Lottie skill, an SVG character-animation
skill under a permissive licence.

## 7. Duplicates and overlaps

**Duplicates handled.** No entry was created for a copy: Impeccable's ~21 per-harness copies, UI UX Pro Max's `cli/assets/skills`,
TypeUI's plugin copies, Neon's `plugins/` mirror and Open Design's vendored copies of `gsap-*`, `frontend-design`,
`web-design-guidelines`, `taste-skill`, `ui-ux-pro-max` and `impeccable-design-polish` all point back to an upstream that is registered
once. The registry rejects two entries with the same upstream and folder (tested). Five earlier mattpocock entries,
six earlier obra entries, `threejs-fundamentals` and `security-threat-model` were recognised as existing and kept unchanged.

**Name collisions** (ids are prefixed): `addy-test-driven-development` vs obra's `test-driven-development`; `genjutsu-*`,
`uipro-*`, `phaser-*`, `cloudflare-*`, `android-*`, `sentry-*`, `web-quality-*`, `mattpocock-*` for generic names such as
`design`, `scenes`, `wrangler`, `research`.

**Functional overlaps** (register all, activate few):

| Area                                     | Skills                                                                                                                      | Note                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Design direction for new pages           | `frontend-design` (approved), `hallmark`, `taste-skill`, genjutsu `paint`                                                   | Hallmark and Taste Skill both "deal" art directions and ban slop defaults; running both will conflict. Pick one to evaluate. |
| Critique / audit / polish of existing UI | `impeccable`, genjutsu `design-audit` module, `web-design-guidelines` (reviewed, recommended reject)                        | Impeccable is the only dedicated review/polish command set.                                                                  |
| Design data lookup                       | `ui-ux-pro-max` (styles, palettes, fonts, charts)                                                                           | Complements, rather than competes with, the direction skills; Python scripts.                                                |
| Extract a design from a reference        | `design-dna`, `refero-design`, Design MD (application)                                                                      | Different inputs: image/URL vs Refero's reference library.                                                                   |
| Motion                                   | `gsap-*` (official), `lottie-motion-design`, genjutsu `cast`, `expo-animation`, `phaser-tweens`                             | genjutsu bundles its own GSAP module; use the official `gsap-*` skills alone for plain GSAP.                                 |
| Accessibility                            | `wcag-guide` (reviewed), `web-quality-accessibility`, `a11y-knowledge`/`auditing-wcag`/`reviewing-a11y`/…                   | Three overlapping sets; start with one.                                                                                      |
| Security review                          | `cloudflare-security-audit`, `sentry-security-review`, `security-threat-model` (reviewed), `differential-review` (reviewed) | Distinct methods; do not stack.                                                                                              |
| MCP building                             | `mcp-builder` (reviewed), `build-mcp-server`                                                                                | Same purpose, different upstream.                                                                                            |
| Anti-slop                                | `hallmark`, `taste-skill`, `impeccable`, genjutsu `tells`, Anti-slop (unresolved)                                           | The label covers a family; no single skill owns it.                                                                          |

**Recommended complementary roles for design work (do not activate all together):**

1. Base: `frontend-design` (already approved).
2. Direction for _new_ pages: one of `hallmark` or `taste-skill`, chosen by a controlled A/B evaluation.
3. Critique/polish of _existing_ UI: `impeccable` (only after its binary-downloading launcher is reviewed).
4. Data lookup on demand: `ui-ux-pro-max`.
5. Motion only when the task needs it: official `gsap-*`, never layered under genjutsu's own GSAP module.
6. Genjutsu, Open Design and Design DNA remain reference or opt-in.

## 8. Security warnings

Method: every file of every registered folder was scanned by the repository's heuristic scanner (`review.ts`); SKILL.md
and flagged script locations were read for the skills named below; the rest were not read line by line.
Hits in documentation (for example attack examples in security-review skills or `npm install` instructions) are
noted as data, not as defects. Nothing was executed.

**Higher concern** (needs explicit review before any approval):

| Skill                             | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `impeccable`                      | SKILL.md runs a launcher at the start of every session. It executes `$IMPECCABLE_BIN`, then (after an engine handshake only, not checksum-verified) `~/.impeccable/bin/impeccable` or an `impeccable` on PATH, then a cached engine, or downloads engine v0.1.18 from the project's GitHub releases into `~/.impeccable`; downloads and cached copies are checked against `engine-checksums.txt` (shipped in the pinned folder, fail-closed). The engine binary itself was not inspected. |
| `oil-ui`                          | Load-time shell injection runs `check_update.sh` whenever the skill loads (skipped with `OIL_NO_UPDATE_CHECK` or a `.git` folder); it fetches version data from an external API, writes state files, and its output enters the prompt as text. `check_update.py --update` is pre-approved by the frontmatter pattern and can run a pinned `npx` CLI that rewrites the skill's own folder. Root-level skill.                                                                               |
| `hallmark`                        | `install-hook.mjs` (adds an advisory PostToolUse hook to Claude Code `settings.json`; `--print` and `--remove` supported) and `install.mjs` are optional and user-run: nothing instructs the agent to run them, and a registry install needs neither. Optional Together AI API key; 53 binary assets; 755 referenced photos (licences unverified).                                                                                                                                        |
| `video-shotcraft`                 | About 53 MB in 1,217 files at the pinned commit (67 scripts, 439 media files); runtime downloads (Freesound), optional publishing API key, mixed audio licences (one BGM track recorded as not traceable), starts a dev server and browser, promotional prompts. Root-level skill.                                                                                                                                                                                                        |
| `genjutsu-cast/paint/bunshin`     | Incomplete without the 17 `_jutsu` modules (probed from sibling and plugin-cache paths); workflow scripts `rm -rf` scratch directories and spawn many subagents (~10M tokens per full run).                                                                                                                                                                                                                                                                                               |
| `eas-workflows`                   | Says fetching a schema and unpinned `main` docs is NECESSARY; `fetch.js` caches into `scripts/.cache` inside the skill folder (an installed copy would drift from its hash); frontmatter pre-approves `Bash(node:*)`.                                                                                                                                                                                                                                                                     |
| `hf-cli`                          | The first line of SKILL.md is a `curl … \| bash` installer line (informational, but an agent could follow it).                                                                                                                                                                                                                                                                                                                                                                            |
| `auditing-wcag`, `reviewing-a11y` | Frontmatter `allowed-tools` pre-approves WebFetch and Playwright MCP navigate/click (and type/key-press for `auditing-wcag`): in Claude Code they can browse and interact with live pages without a permission prompt.                                                                                                                                                                                                                                                                    |
| `design-dna`                      | Instructs `npm install` inside the skill folder at use time. Root-level skill.                                                                                                                                                                                                                                                                                                                                                                                                            |

**Medium:** `taste-skill` (browser CDP client, network asset fetching), `ui-ux-pro-max` family (Python scripts, `pip install`, image-generation API keys),
`shadcn` (npx, remote registries), `typeui-fundamentals` (npx and hosted MCP), `refero-design` (paid plan, OAuth MCP), `hyperframes*` and
`remotion-*` (large Node projects with scripts/binaries), `swiftui-expert-skill`, `train-sentence-transformers`, `liteparse`/`llamaparse`
(cloud API), `sentry-skill-scanner`, `security-ownership-map` (Python scripts), `android-r8-analyzer` (Python).

**Low:** 154 registered candidates have no recorded warning: instruction-only with no scripts, binaries or flagged hits (all of `threejs-*`, `gsap-*`,
`phaser-*`, `next-*`, `prisma-*`, `neon-*`, `flutter-*`, most `addy-*`/superpowers/mattpocock skills).

No instruction-override, concealment or base64-payload content was found in a skill's own instructions. The only "ignore previous
instructions" strings sit inside security-detection references (`sentry-skill-scanner`, `sentry-security-review`). The three
invisible-Unicode hits were read: emoji zero-width-joiner sequences inside regular expressions (`hallmark`, `oil-ui`) and a documentation example
(`sentry-skill-scanner`). HTML comments (flagged by the scanner in several skills) were not reviewed one by one.
Per-skill warnings are on each skill's page and in `registry/skills.json` (`discovery.warnings`).

## 9. Licensing findings

- Registered skills: MIT: 153, Apache-2.0: 45, unknown: 12, BSD-3-Clause: 6. `unknown` = the 12 Remotion skills (the publish mirror has
  no LICENSE; the parent project uses the custom Remotion License; free for individuals and small teams, a company licence above that).
- `video-shotcraft`: code Apache-2.0, but bundled audio is under mixed licences (Mixkit; Freesound CC0/CC BY with attribution). Do not redistribute media.
- `hallmark`: MIT, but 755 referenced photos are "openly licensed" per upstream; not verified per file.
- `Motionsites-AI/claude-skill` (unresolved): skill text MIT, `examples/` and `media/` are (c) MotionSites, not mirrorable.
- `hyperbrowser-app-examples`: README says MIT, no root LICENSE file. `mg-styles-15`: MIT with third-party files under their own terms; fonts not bundled.
- `VoltAgent/awesome-design-md`, TypeUI, Refero styles: the DESIGN.md files describe third-party brands; repository licence does not cover brand rights.
- `JohnHeibel/ClaudeAnimationBase`: MIT, but the "Clawd" mascot likeness may raise brand questions.
- `flutter/agent-plugins`: BSD-style (BSD-3-Clause); `openai/skills`: no root licence, per-skill LICENSE files (Apache-2.0 for the three registered);
  `anthropics/claude-plugins-official`: Apache-2.0 at root, plugins carry their own notices.
- No third-party content was copied into this repository (only metadata, short descriptions and hashes).

## 10. Runtime dependencies

| Need                                             | Skills                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remotion project (Node), ffmpeg                  | `remotion-*`, `video-shotcraft`, `remotion-to-hyperframes`                                                                                                                                |
| Chrome/Chromium via puppeteer-core or Playwright | `hallmark`, `taste-skill`, `video-shotcraft`, `design-dna` (indirect), `auditing-wcag`, `playwright-cli`, `playwright`                                                                    |
| Python 3                                         | `ui-ux-pro-max` family, `oil-ui`, `swiftui-expert-skill`, `sentry-skill-scanner`, `security-ownership-map`, `android-r8-analyzer`, `train-sentence-transformers`                          |
| Paid or keyed services                           | `refero-design` (Refero plan + MCP), `hallmark` imagegen (Together), `llamaparse`/`llamacloud-index` (LlamaCloud), `uipro-design` (Google GenAI), `video-shotcraft` publish (Upload-Post) |
| Hosted MCP / CLI                                 | `typeui-fundamentals`, `impeccable` (self-downloaded binary), `hyperframes-cli`, `shadcn`                                                                                                 |
| Framework project                                | `next-*` (Next.js), `nuxt-ui`, `expo-*`/`eas-*`, `flutter-*`, `android-*`, `kotlin-*`, `phaser-*`, `godot-*`, `prisma-*`, `neon-*`, `langchain-*`/`langgraph-*`                           |
| Network at run time                              | `taste-skill` (photo lookup), `eas-workflows` (docs), `video-shotcraft` (Freesound), `oil-ui` (update check), `impeccable` (binary)                                                       |

## 11. Unresolved candidates

| Name                        | State      | Information needed                                                                                                                   |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Anti-slop                   | ambiguous  | Where the name was seen, or the exact owner/repository. If `miqdadbadjuber/anti-slop` is intended, confirm and it can be registered. |
| Neuform AI                  | unresolved | A link from Neuform docs or terms to an open repository/skill, or the page the skill was seen on.                                    |
| MotionSites AI Claude Skill | ambiguous  | A link from motionsites.ai or its creator's official channels to `Motionsites-AI/claude-skill`.                                      |

## 12. Reference-only resources

`agentskills/agentskills` (standard), `krillinai/OpenCreator` and `nexu-io/open-design` (applications with bundled, application-bound or
vendored skills), `VoltAgent/awesome-design-md` (84 DESIGN.md files), `bergside/awesome-design-skills` (67 style skills),
Refero Styles (hosted library), Hyperbrowser Design MD and DesignMD Supply (applications), `JohnHeibel/ClaudeAnimationBase` (starter kit),
`Vincentwei1021/mg-styles-15` (showcase and prompts).

## 13. Recommended approval priorities (for a controlled approval and behavioural evaluation; nothing is approved)

Priority 1 — instruction-only, official or well-known upstream, clear project fit, low risk:

1. `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-react` (official; motion for web apps).
2. `web-quality-accessibility`, `web-quality-core-web-vitals`, `web-quality-performance` (PWA quality).
3. `cloudflare-security-audit` (official; local-only validators) and `sentry-skill-scanner` (useful for reviewing future skills).
4. `expo-router`, `expo-data-fetching`, `expo-animation`, `expo-upgrade` (official; Expo project).
5. `addy-*`: `spec-driven-development`, `performance-optimization`, `security-and-hardening` (check overlap with approved superpowers skills first).
6. `playwright-cli` (official; e2e).

Priority 2 — high value but needs a hands-on review of scripts first: one of `hallmark` or `taste-skill`, then `impeccable`,
then `ui-ux-pro-max`. Evaluate Hallmark vs Taste with the ES8 harness against the approved `frontend-design` baseline.

Priority 3 — conditional on a project need: `remotion-*` and `hyperframes` (licence decision first), `phaser-*`, `godot-*`, `nuxt-ui`,
`prisma-*`/`neon-*`, `langchain-*`/`huggingface-*` (only when starting RAG/local-LLM work), Swift/Kotlin/Flutter/Android skills.

Not recommended without further work: genjutsu (framework dependency), `oil-ui`, `video-shotcraft`, `eas-workflows`, `hf-cli`.

## 14. Recommended future project assignments (suggestions, not assignments)

| Project                   | Candidates                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playnest (kids PWA)       | `gsap-*`, `web-quality-*` (accessibility, vitals), one design-direction skill, `a11y` skills for WCAG, `phaser-*` only if a Phaser game is added    |
| Gateway                   | `frontend-design` plus one direction skill, `web-quality-*`, `cloudflare-security-audit` and `cloudflare-web-perf` if hosted on Cloudflare          |
| Momee (SVG character art) | `lottie-motion-design`, `rive`, `gsap-*`, genjutsu `cast` for SVG motion (after framework review). Gap: no permissive SVG character-animation skill |
| FM Studios                | `playwright-cli`, `addy-*` debugging/TDD overlap with approved superpowers skills, `cloudflare-security-audit`                                      |
| Codyssey (Expo)           | `expo-*`, `eas-update`, `expo-upgrade`; later `langchain-*` only if an LLM feature is added                                                         |
| ecosystem-skills itself   | `sentry-skill-scanner` and `cloudflare-security-audit` for reviewing candidates                                                                     |

## ES16.1 — Discovery hardening and pre-commit verification (2026-10-30)

Scope: verify ES16 before it is committed. No new skills were discovered, nothing was approved, installed, synchronised or
activated, no third-party script ran, and no other repository was modified. Sources were read as inert text from the
snapshots ES16 already used (and, for Remotion's licence, two raw files fetched as data).

### Registry integrity

| Check              | Result                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline           | `main` at `d04b07d`, 25 uncommitted paths, nothing staged; the reflog's only entry is the original clone                                                   |
| Historical entries | all 29 pre-ES16 entries deep-equal their `HEAD` versions and keep their positions (this includes the 13 entries that overlap ES16 sources)                 |
| Ids and locations  | 245 unique ids (also case-insensitively); 243 unique upstream+folder locations; 58 unique source ids                                                       |
| Pins               | all 216 candidate pins are full 40-character SHAs equal to the snapshot that was scanned; all 55 distinct repository@SHA pairs resolve upstream (HTTP 200) |
| Content hashes     | all 216 `discovery.contentHash` values were recomputed from the snapshots with the repository's own `scanTree` and match                                   |
| Source relations   | every candidate is listed by exactly one source; source revision equals skill revision; no source decision is weaker than its skills                       |
| Status             | 216 candidates `unreviewed`, 21 `reviewed`, 6 `approved`, 2 first-party; no candidate has `approvedBy`, an assignment or evidence                          |
| Catalog            | generated catalog is deterministic and byte-identical to `dist/catalog.json`                                                                               |

**Finding 1 — implicit status.** The candidates' `unreviewed` status came from the schema default (the raw JSON had no
`review` field), so a tool reading the raw registry could misparse a candidate. All 216 now carry
`"review": { "status": "unreviewed", "findings": [] }` explicitly (a test pins it).

**Finding 2 — tool grants were under-reported.** ES16's scan did not read frontmatter `allowed-tools`. A check across all candidates found
14 skills that pre-approve shell, write, web, agent or MCP tools. Each now carries a warning, which moved
5 skills from "for review" to "with warnings": `eas-update`, `planning-a11y-improvement`, `planning-wcag-audit`, `playwright-cli`, `sentry-security-review`. Total with warnings: 62 (ES16 reported 57).

**Finding 3 — corrections to ES16 text.** `video-shotcraft` is about 53 MB in 1,217 files at the pinned commit (ES16 said about 200 MB, a figure
for the repository, not the snapshot); `mg-styles-15`'s size is a reported figure; Impeccable, Hallmark and oil-ui findings were sharpened below.
No historical (pre-ES16) data was changed.

### Warning enforcement

| #   | Question                                          | Finding                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Warning-bearing candidates display their warnings | Yes: every warning, dependency and blocker is rendered on the skill page (a test renders all 216 pages) and the card shows **Has warnings**                                                                                                     |
| 2   | Detail page exposes the relevant information      | Yes: "Discovery scan" block (outcome, source link, hash, warnings, dependencies, scan limits). It was renamed from "Discovery audit" so it is not read as a security audit                                                                      |
| 3   | Sources page represents source-level warnings     | Yes, in a "Warnings (n)" disclosure, plus a per-source count of skills with warnings and blockers                                                                                                                                               |
| 4   | Search and filters do not hide status             | Every result is a card with its status badge; the status filter finds all 216 candidates and none under Approved. Search now also matches the source repository                                                                                 |
| 5   | Approval workflow does not silently drop warnings | **Gap closed.** Approval is refused (registry validation) while `discovery.approvalBlockers` is non-empty, and when discovery recorded warnings but the review has no findings. A review at the pinned revision must hash to the discovery hash |
| 6   | Install does not bypass checks                    | `installBlocker()` runs first (not approved, approval not covering the pin, root-level path, unresolved blockers), then the existing hash and symlink checks                                                                                    |
| 7   | Unknown licences visible                          | Yes: `unknown` shows on card, header and detail; the 12 Remotion skills also carry a licence blocker                                                                                                                                            |
| 8   | Missing dependencies visible                      | Yes (`discovery.dependencies`); genjutsu's missing module skills is a blocker                                                                                                                                                                   |
| 9   | Hooks and scripts identified                      | Yes, per skill: script names, binaries, tool grants; plugin-layer hooks (outside skill folders) are named on the source                                                                                                                         |
| 10  | Unsupported install methods not shown as ready    | Root-level and blocked skills show "Must be resolved before approval … cannot be installed as registered"                                                                                                                                       |

**New safeguards** (all covered by tests; nothing here approves anything):

- `discovery.approvalBlockers` (schema): conditions that must be resolved before approval. 23 candidates have them:
  3 repository-root skills, 3 genjutsu entry skills, `impeccable`, `eas-workflows`, `hf-cli`, `auditing-wcag`, `reviewing-a11y`, and the 12 Remotion skills (licence).
  Clearing a blocker is a deliberate registry edit that must come with review findings.
- Validation: approved with blockers is an error; approved with discovery warnings and no findings is an error; review hash different from the discovery hash at the same revision is an error;
  an approved repository-root skill is an error; `register-for-review` cannot carry warnings; blockers must also be warnings;
  **a consumer assignment to any external skill that is not approved is now a registry error** (before, only the `assign` command refused it).
- `installBlocker(skill)`: a pure check run before any file or network access, with actionable messages.
- Existing gates kept and re-tested: the `assign` policy; the approval policy in `resolveCanonical` (sync and verify), now also tested with a stale local copy listed in `installed.json`; content-hash and symlink checks.

Lifecycle gates, and what enforces each:

| Step                      | Enforced by                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Discovery → Review        | nothing needed: discovery records are metadata (`unreviewed`)                       |
| Review → Approval         | registry validation (owner `approvedBy`, pin and hash, the discovery gates above)   |
| Approval → Installation   | `installBlocker` plus hash, symlink and `installed.json` checks                     |
| Installation → Assignment | `assignmentPolicy` in `assign`, and now registry validation                         |
| Assignment → Activation   | `resolveCanonical` (approval, install, hash, lock) in `skills:sync`; all-or-nothing |
| Activation → Verification | `skills:verify` is read-only; recorded verification is never inferred from links    |

### Root-level skills (`source.path: "."`)

`design-dna`, `oil-ui` and `video-shotcraft` validate as candidates and display their blocker. Verified with tests and the real CLI in disposable fixtures:
the installer and `fetchSkill` refuse `.` before creating any directory or touching the network (the message says to inspect with
`pnpm skills:review --dir <folder>` and to define a subset first); an unapproved root candidate is refused with "not approved"; a root skill marked approved
makes the whole registry invalid, so no command proceeds; `install` has no dry-run (there is nothing to preview, it refuses); the rollback and uninstall code is untouched and
its tests pass; the supported install paths still pass their tests. Root-level installation was not enabled.

### High-risk candidate findings (from the pinned snapshots, read as text)

| Candidate                         | What was read                                    | Finding                                                                                                                                                                                                                                                                                                                                                   | Registry state                      |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `impeccable`                      | `scripts/impeccable` (full), checksums, SKILL.md | Run at every session start. Two execution paths are not checksum-verified (home binary, PATH binary: handshake only); the download path is verified against a checksum file that ships in the pinned folder (fail-closed), but the Rust engine itself was not inspected; writes `~/.impeccable`. Hooks live in the plugin layer, outside the skill folder | warning sharpened, approval blocker |
| `oil-ui`                          | SKILL.md, `check_update.sh` and `.py`            | Load-time shell injection every time the skill loads; remote-derived text enters the prompt; `--update` is pre-approved and can rewrite the skill's own folder through a pinned npx CLI; skipped with `OIL_NO_UPDATE_CHECK` or `.git`. Root-level                                                                                                         | warnings sharpened, 2 blockers      |
| `hallmark`                        | install scripts, `lint-hook.mjs`, flow.md        | The hook is **optional and user-run** (`--print`, `--remove`, atomic write); nothing tells the agent to run it; advisory once installed                                                                                                                                                                                                                   | warning corrected, no blocker       |
| `video-shotcraft`                 | README licence section, `ATTRIBUTION.md`, size   | 53 MB in 1,217 files; Mixkit and Freesound-CC media with required credits; first BGM track "cannot be traced". Root-level                                                                                                                                                                                                                                 | warnings corrected, blockers        |
| `genjutsu-cast/paint/bunshin`     | SKILL.md module-resolution block                 | **Not independently usable**: the entry skills stop with "could not find the genjutsu modules" and tell the user to install the full bundle. Fails safe, but useless alone                                                                                                                                                                                | 3 blockers                          |
| `eas-workflows`                   | SKILL.md, `scripts/fetch.js`                     | "NECESSARY to fetch" unpinned docs; cache written inside the skill folder; `Bash(node:*)` pre-approved                                                                                                                                                                                                                                                    | warnings, blocker                   |
| `hf-cli`                          | SKILL.md line 1                                  | `curl \| bash` is an informational install line, not a required step; the skill text is generated from huggingface_hub v2.4.0                                                                                                                                                                                                                             | warning, blocker (owner decides)    |
| `auditing-wcag`, `reviewing-a11y` | frontmatter                                      | WebFetch and Playwright navigate/click (and type/key-press) pre-approved                                                                                                                                                                                                                                                                                  | warnings, blocker                   |
| `remotion-*` (12)                 | mirror `package.json`, parent LICENSE.md         | The mirror has no licence file; the package is private `@remotion/skills`; the parent licence is free only for individuals, for-profits with up to 3 employees and non-profits                                                                                                                                                                            | licence `unknown`, blocker          |

This is a **targeted** read of the named locations, not a full manual audit of every file.

### Playnest verification diagnosis (read-only)

- **Directory checked:** `<ecosystem-skills>/external/skills/verification-before-completion` (`resolveCanonical` in `sync.ts`).
- **Expected:** that folder, an entry in `external/installed.json`, and Playnest's two relative symlinks (`.claude/skills/…` and `.agents/skills/…` pointing to `../../../ecosystem-skills/external/skills/verification-before-completion`). The links exist and now dangle.
- **Cause:** environmental. This checkout is a fresh clone (the reflog's only entry is `clone`; `README.md` and `packages/` were created at 23:55:23 on 2026-10-29; `external/` holds only its tracked README). `external/` is git-ignored, so installs made on the previous checkout did not come with the clone.
- **Not an ES16 regression:** ES16 did not touch `sync.ts` or `fsguard.ts`, and its `consumers.ts` change only adds `sources` to the registry loader. A pre-ES16 copy of the code (`git archive HEAD` in a temp folder) reports the same `not installed` error against the same Playnest (its link message differs only because the temp copy does not own the links). The verifier correctly refuses to infer verification from dangling links.
- **Other consumers:** `ecosystem-assets` passes (first-party skill). `ecosystem-skills` (grilling and verification-before-completion: 6 errors) and `gateway` (frontend-design: 3 errors) fail for the same reason. Consumers without assignments are unaffected.
- **Recovery** (not run in ES16.1): from the repository root, `pnpm skills:install grilling`, `verification-before-completion`, `frontend-design`, `writing-plans` (the four ES6 skills; each downloads the pinned SHA, checks the reviewed content hash and writes only `external/`), then `pnpm skills:verify playnest --project <absolute path>`. No link needs recreating. `caveman` and `ponytail` are approved but were never installed. A note was added to [consumers.md](consumers.md).

### Remaining risks and recommendations

| Item                                                                                                                     | Class                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Playnest, gateway and ecosystem-skills verification fail until the four approved skills are reinstalled on this checkout | non-blocking for the commit (environmental, documented)   |
| ES16 scans are heuristic; named high-risk files were read, the rest were not read line by line                           | non-blocking; stated on every record                      |
| Three unresolved identities (Anti-slop, Neuform AI, MotionSites)                                                         | non-blocking; need owner input                            |
| The pipeline that generated the entries lives in a session scratch folder, not in the repository                         | non-blocking; the registry and this report are the record |
| Indonesian strings for the new interface have had no native-speaker review                                               | non-blocking                                              |
| `agents` on candidates are README mentions, not tests                                                                    | non-blocking                                              |
| `/sources` on Vercel production not checked (the SPA rewrite already covers it)                                          | non-blocking                                              |

Approval readiness: nothing is ready to approve without an owner decision. The cleanest first reviews, with **no warnings and no blockers recorded**, are
`gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-react`, `gsap-performance`, `web-quality-accessibility`, `web-quality-core-web-vitals`, `web-quality-performance`, `expo-router`, `expo-data-fetching`, `expo-animation`, `expo-upgrade`. These still need the normal read-and-hash review (`pnpm skills:review`), an owner approval and an ES8-style evaluation before any activation.

## Appendix — method, limits and reproducibility

- Sources were downloaded as inert tarballs at the commit named by `git ls-remote` (a few large monorepos with a blobless sparse clone with hooks disabled), into scratch directories outside the repository, and were never executed.
- The scan is the repository's own `reviewTree` (same rules as `pnpm skills:review`) over every file of each registered folder; content hashes use `scanTree`.
- Four research agents contributed leads (identity of the 13 design/video candidates and discovery of additional repositories). Their claims were treated as untrusted: every SHA was re-read with `git ls-remote`, every registered repository was fetched and audited by this milestone, and the identity conclusions were re-derived from the repository text where possible. Claims that could not be re-verified are marked as leads or reflected as ambiguous.
- Not verified: the typeui.sh and designmd.supply sites (HTTP 429); mg-styles-15 content beyond its README and LICENSE (about 570 MB, not downloaded); star counts; per-file licences of bundled media; scripts were not read line by line.
- Compatibility (`agents`) is _documented_ (the repository README names the agent), not tested; large product monorepos have it empty. None of the candidates has evidence records.
- Rate limits: the unauthenticated GitHub API was exhausted by research, so last-commit dates were read from public Atom feeds (two cross-checked against the agents' API values).
