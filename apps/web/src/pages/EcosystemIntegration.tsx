import { useT } from '../i18n.tsx';
import { agentName, type Catalog, type Skill } from '../lib.ts';
import { Badge, Card, ExternalLink, Field, Section } from '../ui.tsx';
import { none } from './shared.tsx';

/**
 * First-party ecosystem integration skills (ES24): the source they read, its documented read-only interface, the
 * projects mapped to it, and what access the skill needs. Everything shown is public registry data; a private
 * source repository is named but never linked.
 */
export function EcosystemIntegration({ catalog, skill }: { catalog: Catalog; skill: Skill }) {
  const t = useT();
  const sources = skill.requires
    .map((r) => catalog.integrations.find((i) => i.id === r))
    .filter((i) => i && (i.type === 'asset-catalog' || i.type === 'config-registry'));
  if (!sources.length) return null;
  return (
    <Section
      id="ecosystem"
      title={t('Ecosystem integration')}
      hint={t(
        'The shared source this skill reads, through its documented interface only. A project mapping is a reference: it grants no permission to read, edit or install anything.',
      )}
    >
      {sources.map((i) => {
        const projects = catalog.consumers.filter((c) => c.ecosystem?.sources.includes(i!.id));
        return (
          <Card key={i!.id} className="mb-3">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Integration type')}>
                <Badge tone="indigo">
                  {i!.type === 'asset-catalog' ? t('Asset catalog') : t('Configuration registry')}
                </Badge>
              </Field>
              <Field label={t('Source repository')}>
                {i!.repository?.url ? (
                  <ExternalLink href={i!.repository.url}>{i!.repository.name}</ExternalLink>
                ) : (
                  <>
                    <code>{i!.repository?.name}</code>{' '}
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {t('(private repository; not linked)')}
                    </span>
                  </>
                )}
                {i!.repository && i!.repository.formerNames.length > 0 && (
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {t('Formerly: {names}', { names: i!.repository.formerNames.join(', ') })}
                  </span>
                )}
              </Field>
              <Field label={t('Source documentation')}>
                <ul className="space-y-0.5 [overflow-wrap:anywhere]">
                  {i!.contract?.docs.map((d) => (
                    <li key={d}>
                      <code>{d}</code>
                    </li>
                  ))}
                </ul>
              </Field>
              <Field label={t('Read-only interface')}>
                <ul className="space-y-0.5 [overflow-wrap:anywhere]">
                  {i!.contract?.reads.map((d) => (
                    <li key={d}>
                      <code>{d}</code>
                    </li>
                  ))}
                </ul>
              </Field>
              <Field label={t('Permissions required')}>
                {t(
                  'Read access to a local checkout of the source. The skill never writes to it, installs dependencies or runs its scripts on its own.',
                )}
              </Field>
              <Field label={t('Compatibility')}>
                {skill.agents.length
                  ? skill.agents.map(agentName).join(', ')
                  : t('Standard SKILL.md; not yet tested with an agent.')}
              </Field>
              <Field label={t('Mapped projects')}>
                {projects.length ? (
                  <span className="flex flex-wrap gap-1">
                    {projects.map((c) => (
                      <Badge key={c.id}>
                        {c.name}
                        {c.ecosystem?.project ? ` · ${c.ecosystem.project}` : ''}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  none
                )}
              </Field>
            </dl>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{i!.description}</p>
          </Card>
        );
      })}
    </Section>
  );
}
