import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoutingPreview, RoutingPreviewWindow } from '@/services/api';
import { ROUTING_STRATEGIES, routingStrategyKey } from '@/types/visualConfig';
import { formatInstantShort } from '@/utils/quota';
import {
  accountLabel,
  explainRouting,
  formatBurnRate,
  type RoutingSentence,
} from '../routingExplanation';
import styles from './RoutingSummary.module.scss';

const PREFIX = 'quota_management.routing';

function WindowCell({ window }: { window: RoutingPreviewWindow | null }) {
  if (!window) return <td className={styles.dim}>-</td>;
  const used = Math.round(window.utilization * 100);
  return (
    <td>
      <span className={styles.usage}>{used}%</span>
      <span className={styles.bar} aria-hidden="true">
        <i style={{ width: `${Math.min(used, 100)}%` }} />
      </span>
      <span className={styles.dim}>{formatInstantShort(window.resetAtMs)}</span>
    </td>
  );
}

/**
 * Active routing strategy and the account it would pick for a new session.
 * The steps and the rank table stay behind the toggle; the rows below already
 * show each account's usage.
 */
export function RoutingSummary({ preview }: { preview: RoutingPreview | null }) {
  const { t } = useTranslation();
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();

  if (!preview) return null;

  const strategy = ROUTING_STRATEGIES.find((candidate) => candidate === preview.strategy);
  const strategyLabel = strategy
    ? t(`config_management.visual.sections.network.strategy_${routingStrategyKey(strategy)}`)
    : preview.strategy;
  const say = (sentence: RoutingSentence) => t(`${PREFIX}.${sentence.key}`, sentence.params);

  const strategyBlock = (
    <div className={styles.cell}>
      <span className={styles.tag}>{t(`${PREFIX}.strategy`)}</span>
      <span>
        <strong>{strategyLabel}</strong>{' '}
        <a className={styles.link} href="#/config">
          {t(`${PREFIX}.change`)}
        </a>
      </span>
    </div>
  );

  if (!preview.quotaAware) {
    return (
      <section className={styles.summary} aria-label={t(`${PREFIX}.title`)} data-reveal>
        <div className={styles.strip}>
          {strategyBlock}
          <p className={styles.dim}>{t(`${PREFIX}.not_quota_aware`)}</p>
        </div>
      </section>
    );
  }

  const explanation = explainRouting(preview);
  return (
    <section className={styles.summary} aria-label={t(`${PREFIX}.title`)} data-reveal>
      <div className={styles.strip}>
        {strategyBlock}
        <div className={styles.cell}>
          <span className={styles.tag}>{t(`${PREFIX}.next`)}</span>
          <strong className={styles.pick}>
            {explanation.next ? accountLabel(explanation.next) : t(`${PREFIX}.next_rotating`)}
          </strong>
        </div>
        <div className={`${styles.cell} ${styles.reason}`}>
          <span className={styles.tag}>{t(`${PREFIX}.why`)}</span>
          <span>{say(explanation.summary)}</span>
        </div>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={showWhy}
          aria-controls={whyId}
          onClick={() => setShowWhy((open) => !open)}
        >
          {t(showWhy ? `${PREFIX}.hide_steps` : `${PREFIX}.show_steps`)}
        </button>
      </div>

      {showWhy && (
        <div id={whyId} className={styles.details}>
          <ol className={styles.steps}>
            {explanation.steps.map((step, index) => (
              <li key={index}>{say(step)}</li>
            ))}
          </ol>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t(`${PREFIX}.col_rank`)}</th>
                  <th>{t(`${PREFIX}.col_account`)}</th>
                  <th>{t(`${PREFIX}.col_five_hour`)}</th>
                  <th>{t(`${PREFIX}.col_weekly`)}</th>
                  {preview.strategy === 'burn-rate' && (
                    <th className={styles.num}>{t(`${PREFIX}.col_rate`)}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {explanation.rows.map((candidate) => (
                  <tr
                    key={candidate.authId}
                    className={candidate.authId === preview.nextAuthId ? styles.picked : undefined}
                  >
                    <td>
                      {candidate.rank > 0 ? candidate.rank : t(`${PREFIX}.tier_${candidate.tier}`)}
                    </td>
                    <td className={styles.account}>{accountLabel(candidate)}</td>
                    <WindowCell window={candidate.fiveHour} />
                    <WindowCell window={candidate.weekly} />
                    {preview.strategy === 'burn-rate' && (
                      <td className={styles.num}>
                        {candidate.weekly ? `${formatBurnRate(candidate.weeklyBurnRate)}%/h` : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
