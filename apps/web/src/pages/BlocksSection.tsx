import {
  BLOCK_PURPOSES,
  addDays,
  isoWeekOf,
  mondayOf,
  validateRules,
  type Block,
  type BlockInput,
  type GeneratedWeek,
} from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../api.js';
import { hasChanges, lineDiff } from '../lib/diff.js';
import { longDate, shortDate, targetText } from '../lib/format.js';
import { keys } from '../queries.js';
import { Button } from '../ui/index.js';

const pretty = (rules: unknown) => JSON.stringify(rules ?? {}, null, 2);

/** Checks rules text: it must be JSON, and it must fit the rules schema. */
export function checkRulesText(
  text: string,
): { ok: true; rules: unknown } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${errorText(err)}` };
  }
  const checked = validateRules(parsed);
  return checked.ok
    ? { ok: true, rules: checked.rules }
    : { ok: false, error: `${checked.key} ${checked.message}` };
}

function BlockForm({ block, onDone }: { block: Block | null; onDone: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: block?.name ?? '',
    start_date: block?.start_date ?? '',
    end_date: block?.end_date ?? '',
    purpose: block?.purpose ?? 'base',
  });
  const save = useMutation({
    mutationFn: () => {
      const body: BlockInput = { ...form, name: form.name.trim() };
      return block ? api('PATCH', `/blocks/${block.id}`, body) : api('POST', '/blocks', body);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.blocks });
      onDone();
    },
  });
  return (
    <form
      className="stack event-form"
      aria-label={block ? `Edit ${block.name}` : 'Add block'}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Block name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      <label>
        Starts
        <input
          required
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
        />
      </label>
      <label>
        Ends
        <input
          required
          type="date"
          value={form.end_date}
          onChange={(e) => setForm({ ...form, end_date: e.target.value })}
        />
      </label>
      <label>
        Purpose
        <select
          value={form.purpose}
          onChange={(e) => setForm({ ...form, purpose: e.target.value as Block['purpose'] })}
        >
          {BLOCK_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {save.isError && (
        <p role="alert" className="error">
          {errorText(save.error)}
        </p>
      )}
      <div className="row">
        <Button type="submit" variant="primary" className="grow" disabled={save.isPending}>
          {block ? 'Save block' : 'Add block'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** JSON editor for one block's rules: validate, diff against saved, dry run, save. */
export function RulesEditor({ block, today }: { block: Block; today: string }) {
  const client = useQueryClient();
  const saved = pretty(block.progression_rules);
  const [text, setText] = useState(saved);
  const checked = checkRulesText(text);
  const diff = lineDiff(saved, text);
  const changed = hasChanges(diff);
  const nextWeek = isoWeekOf(addDays(mondayOf(today), 7));

  const save = useMutation({
    mutationFn: (rules: unknown) =>
      api<Block>('PATCH', `/blocks/${block.id}`, { progression_rules: rules }),
    onSuccess: async (updated) => {
      setText(pretty(updated.progression_rules));
      await client.invalidateQueries({ queryKey: keys.blocks });
    },
  });
  const dryRun = useMutation({
    mutationFn: (rules: unknown) =>
      api<GeneratedWeek>('POST', `/weeks/${nextWeek}/dry-run`, { rules }),
  });

  return (
    <section className="stack" aria-label={`Rules for ${block.name}`}>
      <label>
        Progression rules (JSON)
        <textarea
          className="rules-input"
          rows={16}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {checked.ok ? (
        <p className="muted" role="status">
          {changed ? 'Valid. Not saved yet.' : 'Valid. Same as saved.'}
        </p>
      ) : (
        <p role="alert" className="error">
          {checked.error}
        </p>
      )}

      {changed && (
        <details open>
          <summary>Changes against the saved rules</summary>
          <pre className="rules diff" aria-label="Rules diff">
            {diff
              .filter((line) => line.kind !== 'same')
              .map((line, i) => (
                <span key={i} className={`diff-${line.kind}`}>
                  {line.kind === 'added' ? '+ ' : '- '}
                  {line.text.trim()}
                  {'\n'}
                </span>
              ))}
          </pre>
        </details>
      )}

      <div className="row wrap">
        <Button
          disabled={!checked.ok || dryRun.isPending}
          onClick={() => checked.ok && dryRun.mutate(checked.rules)}
        >
          Dry run next week
        </Button>
        <Button
          variant="primary"
          disabled={!checked.ok || !changed || save.isPending}
          onClick={() => checked.ok && save.mutate(checked.rules)}
        >
          Save rules
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => setText(saved)}>
            Discard changes
          </Button>
        )}
      </div>
      {(save.isError || dryRun.isError) && (
        <p role="alert" className="error">
          {errorText(save.error ?? dryRun.error)}
        </p>
      )}
      {save.isSuccess && !changed && (
        <p role="status" className="muted">
          Rules saved. They apply from the next generated week.
        </p>
      )}

      {dryRun.data && (
        <section className="stack dry-run" aria-label="Dry run result">
          <h3>
            {nextWeek}, starting {longDate(dryRun.data.week.start_date)}
          </h3>
          <p className="muted">Nothing was saved. This is what generating that week would give.</p>
          <ul>
            {dryRun.data.week.reasoning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="plain">
            {dryRun.data.week.sessions.map((s) => (
              <li key={`${s.date}-${s.slot}-${s.template_id}`}>
                <strong>{shortDate(s.date)}</strong> {s.slot} {s.template.name}{' '}
                <span className="muted">{targetText(s)}</span>
                {s.optional ? ' (optional)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** Blocks in Settings: create, edit, reorder, and edit the rules of each. */
export function BlocksSection({ blocks, today }: { blocks: Block[]; today: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [rulesFor, setRulesFor] = useState<number | null>(
    () => blocks.find((b) => b.start_date <= today && b.end_date >= today)?.id ?? null,
  );
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api('POST', '/blocks/reorder', { ids }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.blocks }),
  });
  const move = (index: number, by: -1 | 1) => {
    const ids = blocks.map((b) => b.id);
    const target = index + by;
    [ids[index], ids[target]] = [ids[target] as number, ids[index] as number];
    reorder.mutate(ids);
  };

  return (
    <>
      <p className="muted">
        Blocks follow one another on the calendar and cannot overlap. Moving one reflows the dates,
        each block keeping its length.
      </p>
      <ol className="plain stack">
        {blocks.map((b, index) => (
          <li key={b.id} className="stack block-row">
            {editing === b.id ? (
              <BlockForm block={b} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="row">
                  <span className="grow">
                    <strong>{b.name}</strong>
                    <span className="muted sub">
                      {b.purpose}, {shortDate(b.start_date)} {b.start_date.slice(0, 4)} to{' '}
                      {shortDate(b.end_date)} {b.end_date.slice(0, 4)}
                      {b.start_date <= today && b.end_date >= today ? ', current' : ''}
                    </span>
                  </span>
                </div>
                <div className="row wrap">
                  <Button aria-label={`Edit ${b.name}`} onClick={() => setEditing(b.id)}>
                    Edit
                  </Button>
                  <Button
                    aria-label={`Rules for ${b.name}`}
                    aria-expanded={rulesFor === b.id}
                    onClick={() => setRulesFor(rulesFor === b.id ? null : b.id)}
                  >
                    Rules
                  </Button>
                  <Button
                    aria-label={`Move ${b.name} earlier`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    Earlier
                  </Button>
                  <Button
                    aria-label={`Move ${b.name} later`}
                    disabled={index === blocks.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    Later
                  </Button>
                </div>
                {rulesFor === b.id && <RulesEditor key={b.id} block={b} today={today} />}
              </>
            )}
          </li>
        ))}
      </ol>
      {reorder.isError && (
        <p role="alert" className="error">
          {errorText(reorder.error)}
        </p>
      )}
      {editing === 'new' ? (
        <BlockForm block={null} onDone={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing('new')}>Add a block</Button>
      )}
    </>
  );
}
