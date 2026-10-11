import { describe, expect, it } from 'vitest';
import { checkRulesText } from '../pages/BlocksSection.js';
import { hasChanges, lineDiff } from './diff.js';

describe('lineDiff', () => {
  it('reports no changes for identical text', () => {
    const diff = lineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.map((d) => d.kind)).toEqual(['same', 'same', 'same']);
    expect(hasChanges(diff)).toBe(false);
  });

  it('shows a changed line as one removed and one added, in place', () => {
    const before = '{\n  "run_sec_increment": 30,\n  "repeats": 8\n}';
    const after = '{\n  "run_sec_increment": 60,\n  "repeats": 8\n}';
    expect(lineDiff(before, after)).toEqual([
      { kind: 'same', text: '{' },
      { kind: 'removed', text: '  "run_sec_increment": 30,' },
      { kind: 'added', text: '  "run_sec_increment": 60,' },
      { kind: 'same', text: '  "repeats": 8' },
      { kind: 'same', text: '}' },
    ]);
  });

  it('handles lines added and removed at either end', () => {
    expect(lineDiff('b\nc', 'a\nb\nc\nd').filter((d) => d.kind !== 'same')).toEqual([
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'd' },
    ]);
    expect(lineDiff('a\nb\nc', 'b').filter((d) => d.kind !== 'same')).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'removed', text: 'c' },
    ]);
    expect(hasChanges(lineDiff('a', 'b'))).toBe(true);
  });
});

describe('checkRulesText', () => {
  it('accepts valid rules', () => {
    const text = JSON.stringify({ vest: { default_kg: 20, unloaded_weekdays: [5] } });
    expect(checkRulesText(text)).toEqual({
      ok: true,
      rules: { vest: { default_kg: 20, unloaded_weekdays: [5] } },
    });
  });

  it('says when the text is not JSON', () => {
    const result = checkRulesText('{ "vest": ');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringMatching(/^Not valid JSON/) });
  });

  it('names the key the schema rejects', () => {
    const text = JSON.stringify({
      vest: { default_kg: 20, unloaded_weekdays: [5], colour: 'red' },
    });
    expect(checkRulesText(text)).toEqual({
      ok: false,
      error: 'vest/colour is not a known rule key',
    });
  });
});
