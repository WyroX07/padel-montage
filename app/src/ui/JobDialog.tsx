// Tâche longue (aperçu, export) avec sa progression.

export interface Job {
  title: string;
  detail?: string;
  progress: number;
}

export function JobDialog({ job, onCancel }: { job: Job | null; onCancel?: () => void }) {
  if (!job) return null;
  const pct = Math.round(Math.min(1, Math.max(0, job.progress)) * 100);
  return (
    <div className="scrim">
      <div className="dialog job" role="alertdialog" aria-labelledby="job-title" aria-describedby="job-detail">
        <h2 id="job-title">{job.title}</h2>
        {job.detail && (
          <p id="job-detail" className="muted">
            {job.detail}
          </p>
        )}
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="job-foot">
          <span className="pct">{pct} %</span>
          {onCancel && (
            <button className="btn ghost" onClick={onCancel}>
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
