/** Shared pieces of the exercise-book layout. */

export const ANSWER_DISCLAIMER = "AceMate can get things wrong. Check key facts in your textbook.";

/** The printed "Date ____" box from the corner of a school notebook page, filled in with today. */
export function DateStamp() {
  const now = new Date();
  const short = now.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
  const long = now.toLocaleDateString(undefined, { dateStyle: "long" });
  return (
    <div className="date-stamp" title={long}>
      <span className="label-mono">Date</span>
      <span className="date-stamp-value">
        <span className="sr-only">{long}</span>
        <span aria-hidden="true">{short}</span>
      </span>
    </div>
  );
}
