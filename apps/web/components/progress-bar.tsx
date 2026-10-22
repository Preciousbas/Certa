export function ProgressBar({ released, review, locked }: { released: number; review: number; locked: number }) {
  return (
    <div
      className="progress"
      role="img"
      aria-label={`Released ${released} percent, in review ${review} percent, locked ${locked} percent`}
    >
      <span className="seg seg-released" style={{ width: `${released}%` }} />
      <span className="seg seg-review" style={{ width: `${review}%` }} />
      <span className="seg seg-locked" style={{ width: `${locked}%` }} />
    </div>
  );
}
