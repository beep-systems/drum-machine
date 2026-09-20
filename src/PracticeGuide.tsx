import type { Dictionary } from './i18n/en'

export function PracticeGuide({ text }: { text: Dictionary }) {
  return (
    <section className="practice-guide" aria-labelledby="practice-guide-heading">
      <h2 id="practice-guide-heading">{text.guideHeading}</h2>
      <p>{text.guideDescription}</p>
      <ol>
        <li>{text.guideChoose}</li>
        <li>{text.guidePlay}</li>
        <li>{text.guideSave}</li>
      </ol>
    </section>
  )
}
