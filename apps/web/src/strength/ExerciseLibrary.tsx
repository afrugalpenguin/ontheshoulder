import { EQUIPMENT_TYPES, EXERCISE_PATTERNS, type Exercise, type ExerciseInput } from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorText } from '../api.js';
import { keys, useExercises } from '../queries.js';

function ExerciseForm({ exercise, onDone }: { exercise: Exercise | null; onDone: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: exercise?.name ?? '',
    pattern: exercise?.pattern ?? '',
    equipment: exercise?.equipment ?? '',
    unilateral: exercise?.unilateral ?? false,
    cues: exercise?.cues ?? '',
    video_url: exercise?.video_url ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        pattern: form.pattern,
        equipment: form.equipment,
        unilateral: form.unilateral,
        cues: form.cues.trim() || null,
        video_url: form.video_url.trim() || null,
      } as ExerciseInput;
      return exercise
        ? api('PATCH', `/exercises/${exercise.id}`, body)
        : api('POST', '/exercises', body);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.exercises });
      onDone();
    },
  });

  return (
    <form
      className="stack event-form"
      aria-label={exercise ? `Edit ${exercise.name}` : 'Add exercise'}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      {/* Pattern and equipment are required: substitution matches on them. */}
      <label>
        Pattern
        <select
          required
          value={form.pattern}
          onChange={(e) => setForm({ ...form, pattern: e.target.value as Exercise['pattern'] })}
        >
          <option value="">Choose a pattern</option>
          {EXERCISE_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Equipment
        <select
          required
          value={form.equipment}
          onChange={(e) => setForm({ ...form, equipment: e.target.value as Exercise['equipment'] })}
        >
          <option value="">Choose equipment</option>
          {EQUIPMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={form.unilateral}
          onChange={(e) => setForm({ ...form, unilateral: e.target.checked })}
        />
        One side at a time
      </label>
      <label>
        Cues
        <textarea
          rows={3}
          value={form.cues}
          onChange={(e) => setForm({ ...form, cues: e.target.value })}
        />
      </label>
      <label>
        Video link
        <input
          type="url"
          placeholder="optional"
          value={form.video_url}
          onChange={(e) => setForm({ ...form, video_url: e.target.value })}
        />
      </label>
      {save.isError && (
        <p role="alert" className="error">
          {errorText(save.error)}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary grow" disabled={save.isPending}>
          {exercise ? 'Save exercise' : 'Add exercise'}
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Exercise library: list, detail with cues, add and edit. */
export function ExerciseLibrary() {
  const exercises = useExercises();
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  return (
    <main>
      <header className="page-head">
        <div className="row">
          <h1 className="grow">Exercises</h1>
          <Link className="button quiet" to="/strength">
            Back
          </Link>
        </div>
      </header>

      {editing === 'new' ? (
        <ExerciseForm exercise={null} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')}>
          Add an exercise
        </button>
      )}

      <ul className="plain stack">
        {(exercises.data ?? []).map((e) => (
          <li key={e.id} className="card">
            {editing === e.id ? (
              <ExerciseForm exercise={e} onDone={() => setEditing(null)} />
            ) : (
              <>
                <button
                  type="button"
                  className="quiet exercise-row"
                  aria-expanded={open === e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                >
                  <span className="grow">
                    <strong>{e.name}</strong>
                    <span className="muted sub">
                      {e.pattern}, {e.equipment}
                      {e.unilateral ? ', each side' : ''}
                    </span>
                  </span>
                </button>
                {open === e.id && (
                  <div className="stack">
                    <p>{e.cues ?? 'No cues written yet.'}</p>
                    {e.video_url && (
                      <a href={e.video_url} rel="noreferrer" target="_blank">
                        Video
                      </a>
                    )}
                    <button type="button" onClick={() => setEditing(e.id)}>
                      Edit {e.name}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
