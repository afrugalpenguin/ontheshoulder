export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main>
      <header className="page-head">
        <h1>{title}</h1>
      </header>
      <p className="muted">{note}</p>
    </main>
  );
}
