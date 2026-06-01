import { Info, Share2 } from 'lucide-react'
import { useMemo } from 'react'
import { guidebookPublicUrl } from '../../lib/guidebookDungeonPanel'
import {
  GUIDEBOOK_PROGRESSION_STEPS,
  GUIDEBOOK_TASK_KIND_LABELS,
  guidebookNextStepId,
  guidebookProgressionIndex,
  guidebookProgressionProgressIndex,
  guidebookProgressionProgressSteps,
  guidebookProgressionTrailGroups,
  guidebookTrailClusterLabel,
  type GuidebookProgressionStep,
} from '../../lib/guidebookProgression'
import { useGuidebook } from './GuidebookContext'
import { GuidebookStepContent } from './GuidebookStepContent'

const GUIDEBOOK_AGU_WALK_GIF_URL = guidebookPublicUrl('guidebook/agu_walk.gif')

function boardStepStatus(
  step: GuidebookProgressionStep,
  progressStepId: string,
): 'complete' | 'current' | 'upcoming' | 'informative' {
  if (step.informativeOnly) return 'informative'
  const progressIndex = guidebookProgressionProgressIndex(progressStepId)
  const stepProgressIndex = guidebookProgressionProgressIndex(step.id)
  if (stepProgressIndex < 0 || progressIndex < 0) return 'upcoming'
  if (stepProgressIndex < progressIndex) return 'complete'
  if (stepProgressIndex === progressIndex) return 'current'
  return 'upcoming'
}

function BoardSpace({
  step,
  index,
  progressStepId,
  viewIndex,
  onSelect,
}: {
  step: GuidebookProgressionStep
  index: number
  progressStepId: string
  viewIndex: number
  onSelect: () => void
}) {
  const status = boardStepStatus(step, progressStepId)
  const isViewing = viewIndex === index
  const progressIndex = guidebookProgressionProgressIndex(step.id)

  return (
    <li>
      <button
        type="button"
        className={`guidebook-board__space guidebook-board__space--${step.zoneTone} guidebook-board__space--${status}${isViewing ? ' is-viewing' : ''}`}
        onClick={onSelect}
        aria-current={isViewing ? 'step' : undefined}
      >
        {step.informativeOnly ? (
          <span className="guidebook-board__space-no guidebook-board__space-no--info" aria-label="Informative">
            <Info className="guidebook-board__space-no-icon" size={14} strokeWidth={2.25} aria-hidden />
          </span>
        ) : (
          <span className="guidebook-board__space-no" aria-hidden>
            {progressIndex + 1}
          </span>
        )}
        <span className="guidebook-board__space-body">
          <span className="guidebook-board__space-zone">{step.zone}</span>
          <span className="guidebook-board__space-title">{step.title}</span>
        </span>
        {status === 'complete' ? (
          <span className="guidebook-board__space-mark" aria-label="Completed">
            ✓
          </span>
        ) : status === 'current' ? (
          <span className="guidebook-board__space-mark guidebook-board__space-mark--you" aria-hidden>
            ★
          </span>
        ) : null}
      </button>
    </li>
  )
}

function StepDetailPanel({ step }: { step: GuidebookProgressionStep }) {
  const { progressStepId, setProgressStep, advanceProgress, copyStepLink, linkCopiedId } = useGuidebook()
  const progressIndex = guidebookProgressionProgressIndex(progressStepId)
  const stepProgressIndex = guidebookProgressionProgressIndex(step.id)
  const isCurrent = !step.informativeOnly && step.id === progressStepId
  const copied = linkCopiedId === step.id
  const showAdvance =
    !step.informativeOnly &&
    stepProgressIndex >= 0 &&
    stepProgressIndex >= progressIndex &&
    guidebookNextStepId(step.id) != null

  return (
    <article className="guidebook-board-detail" aria-labelledby={`guidebook-step-${step.id}`}>
      <header className="guidebook-board-detail__head">
        <div>
          <p className="guidebook-board-detail__zone">{step.zone}</p>
          <h2 id={`guidebook-step-${step.id}`} className="guidebook-board-detail__title">
            {step.title}
          </h2>
          {step.summary ? (
            <p className="guidebook-board-detail__summary muted">{step.summary}</p>
          ) : null}
        </div>
        <div
          className={`guidebook-board-detail__actions${isCurrent ? ' guidebook-board-detail__actions--current' : ''}${step.informativeOnly ? ' guidebook-board-detail__actions--informative' : ''}`}
        >
          {!isCurrent && !step.informativeOnly ? (
            <button
              type="button"
              className="guidebook-board-detail__set-step"
              onClick={() => setProgressStep(step.id)}
            >
              <img
                className="guidebook-board-detail__set-step-gif"
                src={GUIDEBOOK_AGU_WALK_GIF_URL}
                alt=""
                width={36}
                height={36}
              />
              <span className="guidebook-board-detail__set-step-label">Set as my step</span>
            </button>
          ) : null}
          <div className="guidebook-board-detail__actions-side">
            {showAdvance ? (
              <button
                type="button"
                className="guidebook-board-detail__advance"
                onClick={() => advanceProgress(step.id)}
              >
                Complete &amp; next
              </button>
            ) : null}
            <button
              type="button"
              className={`guidebook-board-detail__share${copied ? ' is-copied' : ''}`}
              onClick={() => void copyStepLink(step.id)}
            >
              <Share2 className="guidebook-board-detail__share-icon" size={15} strokeWidth={2.25} aria-hidden />
              {copied ? 'Link copied' : 'Share link'}
            </button>
          </div>
        </div>
      </header>

      <section className="guidebook-board-detail__objectives" aria-label="Objectives">
        <h3 className="guidebook-board-detail__label">
          {step.informativeOnly ? 'Overview' : 'Steps'}
        </h3>
        <ul className="guidebook-board-detail__tasks">
          {step.tasks.map((task) => (
            <li key={`${task.kind}-${task.text}`} className={`guidebook-board-detail__task guidebook-board-detail__task--${task.kind}`}>
              <span className="guidebook-board-detail__task-kind">{GUIDEBOOK_TASK_KIND_LABELS[task.kind]}</span>
              <span>{task.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="guidebook-board-detail__wiki" aria-label="Detailed guide">
        <h3 className="guidebook-board-detail__label">Details</h3>
        <GuidebookStepContent stepId={step.id} />
      </section>
    </article>
  )
}

export function GuidebookBoard() {
  const { viewStepId, progressStepId, selectStep } = useGuidebook()

  const viewStep = useMemo(
    () => GUIDEBOOK_PROGRESSION_STEPS.find((s) => s.id === viewStepId) ?? GUIDEBOOK_PROGRESSION_STEPS[0]!,
    [viewStepId],
  )

  const progressIndex = guidebookProgressionProgressIndex(progressStepId)
  const viewIndex = guidebookProgressionIndex(viewStep.id)
  const progressSteps = guidebookProgressionProgressSteps()
  const currentProgressStep = progressSteps[progressIndex]

  return (
    <div className="guidebook-board">
      <div className="guidebook-board__trail-wrap">
        <div className="guidebook-board__trail-head">
          <h2 className="guidebook-board__trail-title">Progression</h2>
          <p className="guidebook-board__trail-meta muted">
            Your step: <strong>{progressIndex + 1}</strong> / {progressSteps.length}:{' '}
            {currentProgressStep?.title ?? 'Unknown'}
          </p>
        </div>
        <ol className="guidebook-board__trail guidebook-scroll--themed">
          {guidebookProgressionTrailGroups().map((group) =>
            group.kind === 'solo' ? (
              <li key={group.step.id} className="guidebook-board__trail-item">
                <BoardSpace
                  step={group.step}
                  index={group.index}
                  progressStepId={progressStepId}
                  viewIndex={viewIndex}
                  onSelect={() => selectStep(group.step.id)}
                />
              </li>
            ) : (
              <li
                key={group.cluster}
                className={`guidebook-board__cluster guidebook-board__cluster--${group.cluster}`}
              >
                <span className="guidebook-board__cluster-label">
                  {guidebookTrailClusterLabel(group.cluster)}
                </span>
                <ol className="guidebook-board__cluster-trail">
                  {group.steps.map(({ step, index }) => (
                    <li key={step.id}>
                      <BoardSpace
                        step={step}
                        index={index}
                        progressStepId={progressStepId}
                        viewIndex={viewIndex}
                        onSelect={() => selectStep(step.id)}
                      />
                    </li>
                  ))}
                </ol>
              </li>
            ),
          )}
        </ol>
      </div>

      <div className="guidebook-board__detail-wrap">
        <StepDetailPanel step={viewStep} />
      </div>
    </div>
  )
}
