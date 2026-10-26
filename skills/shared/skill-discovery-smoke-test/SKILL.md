---
name: skill-discovery-smoke-test
description: Harmless smoke test for agent skill discovery. Use only when the user asks to run the skill discovery smoke test or to verify that skills from Ecosystem Skills are discovered.
---

# Skill discovery smoke test

Verifies that this skill was discovered, that its instructions loaded, and that bundled files resolve.

## Steps

1. Read `references/verification-checklist.md` in this skill's folder and report the marker phrase it defines.
2. Run `scripts/smoke-test.sh` from this skill's folder (resolve the path relative to the folder that contains this `SKILL.md`, not the current working directory) and report its output.
3. Report the three results: skill discovered, reference read, script output.

Do not do anything else. The script takes no arguments, makes no network calls and writes nothing.
