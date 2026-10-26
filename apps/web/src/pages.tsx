import { useMemo, useState } from 'react';
import {
  consumersOf,
  evidenceFor,
  isEvidenceStale,
  agentSummary,
  isStale,
  skillHref,
  sourceTreeUrl,
  stage,
  STAGE_LABEL,
  summarize,
  type Catalog,
  type Evidence,
  type Skill,
  type Stage,
  verifiedAgents,
} from './lib.ts';
import { Badge, Card, Empty, Field, PageHeader, ReviewBadge, VerificationBadge } from './ui.tsx';

const none = <span className="text-zinc-500">—</span>;
const stageTone: Record<Stage, 'indigo' | 'amber' | 'neutral' | 'green' | 'red'> = {
  'first-party': 'indigo',
  discovered: 'amber',
  reviewed: 'amber',
  approved: 'green',
  rejected: 'red',
};
const StageBadge = ({ skill }: { skill: Skill }) => (
  <Badge tone={stageTone[stage(skill)]}>{STAGE_LABEL[stage(skill)]}</Badge>
);
const TrialCounts = ({ e }: { e: Evidence }) => {
  const t = e.trials?.treatment;
  if (!t) return <span className="text-zinc-500">—</span>;
  const c = e.trials?.control;
  return (
    <span className="whitespace-nowrap">
      invoked {t.invoked}/{t.runs} · behavior {t.passed}/{t.runs}
      {c && (
        <span className="block text-xs text-zinc-500">
          control behavior {c.passed}/{c.runs}
        </span>
      )}
    </span>
  );
};
const AgentChip = ({
  catalog,
  skill,
  agent,
}: {
  catalog: Catalog;
  skill?: Skill;
  agent: string;
}) => {
  const a = agentSummary(catalog, skill, agent);
  return (
    <span className="text-xs text-zinc-600 dark:text-zinc-400">
      {agent}: explicit {a.explicit ? '✓' : 'not tested'} · natural{' '}
      {a.naturalRuns ? `${a.naturalInvoked}/${a.naturalRuns} runs invoked` : 'not tested'}
    </span>
  );
};
const StaleBadge = () => <Badge tone="amber">stale: revision changed</Badge>;
const INSTALL_NOTE = (
  <>
    Not part of the public catalog. Installs are local to each machine; run{' '}
    <code>pnpm skills:status</code>.
  </>
);
const list = (xs: string[]) =>
  xs.length ? (
    <span className="flex flex-wrap gap-1">
      {xs.map((x) => (
        <Badge key={x}>{x}</Badge>
      ))}
    </span>
  ) : (
    none
  );

export function Dashboard({ catalog }: { catalog: Catalog }) {
  const s = summarize(catalog);
  const tiles: [string, number | string, string?][] = [
    ['Registered skills', s.skills],
    ['First-party', s.firstParty],
    [
      'External',
      s.external,
      `${s.discovered} discovered · ${s.reviewed} reviewed · ${s.approved} approved · ${s.rejected} rejected`,
    ],
    ['Consumers', s.consumers],
    ['Supported agents', s.agents.length, s.agents.join(', ') || 'none declared'],
    ['Integrations', s.integrations, `${s.mcp} MCP · ${s.cli} CLI · ${s.dependencies} deps`],
    [
      'Agent-verified skills',
      s.agentVerifiedSkills,
      'real agent runs at the pinned revision (see each skill)',
    ],
    [
      'Verified assignments',
      s.verifiedAssignments,
      'consumer + agent checks with recorded evidence',
    ],
  ];
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Summary derived from the generated catalog." />
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([label, value, note]) => (
          <Card key={label}>
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
            {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
          </Card>
        ))}
      </dl>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Discovered → reviewed → approved are recorded here. Installed is local to a machine and is
        not published. Verified is per consumer and agent.
      </p>
      {s.skills === 0 && (
        <div className="mt-6">
          <Empty title="No skills registered yet">
            Add entries to <code>registry/skills.json</code> and run <code>pnpm catalog:build</code>
            .
          </Empty>
        </div>
      )}
    </>
  );
}

export function SkillsExplorer({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [origin, setOrigin] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const categories = useMemo(
    () => [...new Set(catalog.skills.map((s) => s.category))].sort(),
    [catalog],
  );
  const q = query.trim().toLowerCase();
  const shown = catalog.skills.filter(
    (s) =>
      (!category || s.category === category) &&
      (!origin || s.origin === origin) &&
      (!stageFilter || stage(s) === stageFilter) &&
      (!q || [s.id, s.name, s.description, ...s.tags].some((t) => t.toLowerCase().includes(q))),
  );
  const input =
    'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900';
  return (
    <>
      <PageHeader
        title="Skills"
        subtitle="Reusable agent capabilities registered in this ecosystem."
      />
      {catalog.skills.length === 0 ? (
        <Empty title="No skills registered yet">
          External skills are added only after discovery and review.
        </Empty>
      ) : (
        <>
          <form
            role="search"
            className="mb-4 flex flex-wrap gap-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="grow">
              <span className="sr-only">Search skills</span>
              <input
                type="search"
                placeholder="Search name, description, tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${input} w-full`}
              />
            </label>
            <label>
              <span className="sr-only">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={input}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Origin</span>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={input}>
                <option value="">All origins</option>
                <option value="first-party">First-party</option>
                <option value="external">External</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Lifecycle</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className={input}
              >
                <option value="">All stages</option>
                {(Object.keys(STAGE_LABEL) as Stage[]).map((k) => (
                  <option key={k} value={k}>
                    {STAGE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {shown.length} of {catalog.skills.length} skills
          </p>
          {shown.length === 0 ? (
            <Empty title="No skills match these filters" />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.map((s) => (
                <li key={s.id}>
                  <Card className="h-full">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-medium">
                        <a href={skillHref(s.id)} className="hover:underline">
                          {s.name}
                        </a>
                      </h2>
                      <StageBadge skill={s} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      {verifiedAgents(catalog, s).map((a) => (
                        <Badge key={a} tone="green">
                          verified · {a}
                        </Badge>
                      ))}
                      <Badge>{s.category}</Badge>
                      {s.tags.map((t) => (
                        <Badge key={t}>#{t}</Badge>
                      ))}
                    </div>
                    <p className="mt-3 truncate text-xs text-zinc-500">
                      {s.source.type === 'external'
                        ? `${s.author ?? 'unknown author'} · ${s.license ?? 'no license'} · ${s.source.upstream.url.replace('https://github.com/', '')}@${s.source.revision.slice(0, 7)}`
                        : s.source.path}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export function SkillDetail({ catalog, id }: { catalog: Catalog; id: string }) {
  const skill = catalog.skills.find((s) => s.id === id);
  if (!skill)
    return (
      <>
        <PageHeader title="Skill not found" />
        <Empty title={`No skill with id "${id}"`}>
          <a href="#/skills" className="underline">
            Back to skills
          </a>
        </Empty>
      </>
    );
  const requires = skill.requires.map(
    (r) => catalog.integrations.find((i) => i.id === r)?.name ?? r,
  );
  const users = consumersOf(catalog, skill.id);
  const dependents = catalog.skills.filter((s) => s.requiresSkills.includes(skill.id));
  const skillLinks = (ids: string[]) =>
    ids.length ? (
      <span className="flex flex-wrap gap-2">
        {ids.map((d) => (
          <a key={d} href={skillHref(d)} className="underline">
            {catalog.skills.find((x) => x.id === d)?.name ?? d}
          </a>
        ))}
      </span>
    ) : (
      none
    );
  const tree = sourceTreeUrl(skill);
  const src = skill.source;
  return (
    <>
      <a href="#/skills" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        ← All skills
      </a>
      <div className="mt-2">
        <PageHeader title={skill.name} subtitle={skill.description} />
      </div>
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="ID">
            <code>{skill.id}</code>
          </Field>
          <Field label="Stage">
            <StageBadge skill={skill} />
          </Field>
          <Field label="Category">{skill.category}</Field>
          <Field label="Tags">{list(skill.tags)}</Field>
          <Field label={src.type === 'external' ? 'Upstream source' : 'Repository path'}>
            {src.type === 'external' ? (
              <a href={src.upstream.url} rel="noreferrer noopener" className="underline">
                {src.upstream.url}
              </a>
            ) : (
              <code>{src.path}</code>
            )}
          </Field>
          {src.type === 'external' && (
            <>
              <Field label="Skill folder at pinned revision">
                {tree ? (
                  <a href={tree} rel="noreferrer noopener" className="underline">
                    {src.path}
                  </a>
                ) : (
                  <code>{src.path}</code>
                )}
              </Field>
              <Field label="Fork">
                {src.fork ? (
                  <a href={src.fork.url} rel="noreferrer noopener" className="underline">
                    {src.fork.url}
                  </a>
                ) : (
                  none
                )}
              </Field>
              <Field label="Pinned revision">
                <code className="break-all">{src.revision}</code>
              </Field>
            </>
          )}
          <Field label="Author">{skill.author ?? none}</Field>
          <Field label="License">{skill.license ?? none}</Field>
          <Field label="Version">{skill.version ?? none}</Field>
          <Field label="Supported agents">{list(skill.agents)}</Field>
          <Field label="Required integrations">{list(requires)}</Field>
          <Field label="Requires skills">{skillLinks(skill.requiresSkills)}</Field>
          <Field label="Required by">{skillLinks(dependents.map((d) => d.id))}</Field>
          {src.type === 'external' && <Field label="Installation">{INSTALL_NOTE}</Field>}
          <Field label="Review status">
            <ReviewBadge status={skill.review.status} />
            {skill.review.reviewedAt && (
              <span className="ml-2 text-zinc-500">{skill.review.reviewedAt}</span>
            )}
            {skill.review.reviewer && (
              <p className="mt-1 text-zinc-500">Reviewer: {skill.review.reviewer}</p>
            )}
            {skill.review.approvedBy && (
              <p className="mt-1">Approved by {skill.review.approvedBy}</p>
            )}
            {skill.review.notes && <p className="mt-1">{skill.review.notes}</p>}
          </Field>
          {skill.review.contentHash && (
            <Field label="Reviewed content hash">
              <code className="break-all">{skill.review.contentHash}</code>
            </Field>
          )}
          <Field label="Documentation">
            {skill.docs.length ? (
              <ul className="list-inside list-disc">
                {skill.docs.map((d) => (
                  <li key={d.label}>
                    {/^https?:/.test(d.href) ? (
                      <a href={d.href} className="underline" rel="noreferrer noopener">
                        {d.label}
                      </a>
                    ) : (
                      `${d.label} (${d.href})`
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </Field>
        </dl>
      </Card>
      <h2 className="mt-8 mb-3 text-lg font-medium">Agent evidence</h2>
      {evidenceFor(catalog, skill.id).length === 0 ? (
        <Empty title="No agent runs recorded">
          Discovery or approval alone is not evidence of use.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Natural trials</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Discovery</th>
                <th className="px-3 py-2">Instructions</th>
                <th className="px-3 py-2">Invocation</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {evidenceFor(catalog, skill.id).map((e) => (
                <tr key={e.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="px-3 py-2">
                    {e.agent} <span className="text-zinc-500">{e.agentVersion}</span>
                  </td>
                  <td className="px-3 py-2">
                    {e.trigger ?? 'explicit'}
                    {e.scenario && (
                      <span className="text-zinc-500"> ({e.scenario.toUpperCase()})</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TrialCounts e={e} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.date}</td>
                  <td className="px-3 py-2">{e.discovery}</td>
                  <td className="px-3 py-2">{e.instructions}</td>
                  <td className="px-3 py-2">{e.invocation}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        e.result === 'verified' ? 'green' : e.result === 'partial' ? 'amber' : 'red'
                      }
                    >
                      {e.result}
                    </Badge>
                    {isEvidenceStale(e, skill) && <StaleBadge />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-2 border-t border-zinc-200 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {evidenceFor(catalog, skill.id).map((e) => (
              <li key={e.id}>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{e.agent}:</span>{' '}
                {e.task} {e.notes}{' '}
                {e.control && <span className="italic">Control: {e.control} </span>}
                <span className="text-zinc-500">({e.context})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {skill.review.findings.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">Review findings</h2>
          <Card>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {skill.review.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
      <h2 className="mt-8 mb-3 text-lg font-medium">Consumers</h2>
      {users.length === 0 ? (
        <Empty title="Not assigned to any consumer" />
      ) : (
        <ul className="space-y-2">
          {users.map(({ consumer, assignment }) => (
            <li key={consumer.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <span>{consumer.name}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {assignment.agents.map((a) => (
                    <Badge key={a}>{a}</Badge>
                  ))}
                  <VerificationBadge status={assignment.verification.status} />
                  {isStale(assignment, skill) && <StaleBadge />}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Consumers({ catalog }: { catalog: Catalog }) {
  return (
    <>
      <PageHeader
        title="Consumers"
        subtitle="Projects and global agent setups. Assignments are desired state; only “verified” reflects a checked installation."
      />
      {catalog.consumers.length === 0 ? (
        <Empty title="No consumers registered" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {catalog.consumers.map((c) => (
            <li key={c.id}>
              <Card className="h-full">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-medium">{c.name}</h2>
                  <Badge tone={c.kind === 'global' ? 'indigo' : 'neutral'}>{c.kind}</Badge>
                </div>
                {c.description && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.description}</p>
                )}
                <div className="mt-2">{c.agents.length ? list(c.agents) : null}</div>
                <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Assigned skills
                </h3>
                {c.assignments.length === 0 ? (
                  <p className="mt-1 text-sm text-zinc-500">None assigned.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {c.assignments.map((a) => (
                      <li
                        key={a.skill}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <a href={skillHref(a.skill)} className="underline">
                          {catalog.skills.find((s) => s.id === a.skill)?.name ?? a.skill}
                        </a>
                        <span className="flex gap-1">
                          {a.agents.map((ag) => (
                            <Badge key={ag}>{ag}</Badge>
                          ))}
                          <VerificationBadge status={a.verification.status} />
                          {isStale(
                            a,
                            catalog.skills.find((s) => s.id === a.skill),
                          ) && <StaleBadge />}
                        </span>
                        <span className="flex w-full flex-col">
                          {a.agents.map((ag) => (
                            <AgentChip
                              key={ag}
                              catalog={catalog}
                              skill={catalog.skills.find((s) => s.id === a.skill)}
                              agent={ag}
                            />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Integrations({ catalog }: { catalog: Catalog }) {
  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="MCP servers, CLI tools and dependencies that skills may require. Install state is not tracked."
      />
      {catalog.integrations.length === 0 ? (
        <Empty title="No integrations registered yet" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {catalog.integrations.map((i) => {
            const usedBy = catalog.skills.filter((s) => s.requires.includes(i.id));
            return (
              <li key={i.id}>
                <Card className="h-full">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-medium">{i.name}</h2>
                    <Badge tone="indigo">{i.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{i.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {i.transport && <Badge>{i.transport}</Badge>}
                    {i.license && <Badge>{i.license}</Badge>}
                  </div>
                  {i.homepage && (
                    <a
                      href={i.homepage}
                      rel="noreferrer noopener"
                      className="mt-2 block truncate text-xs underline"
                    >
                      {i.homepage}
                    </a>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">
                    Required by:{' '}
                    {usedBy.length ? usedBy.map((s) => s.name).join(', ') : 'no registered skill'}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
