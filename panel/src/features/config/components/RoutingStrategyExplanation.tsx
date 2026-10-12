import { useTranslation } from 'react-i18next';
import { routingStrategyKey, type RoutingStrategy } from '@/types/visualConfig';
import styles from './RoutingStrategyExplanation.module.scss';

const QUOTA_AWARE: ReadonlySet<RoutingStrategy> = new Set(['soonest-reset', 'burn-rate']);

/** Describes the selected routing strategy beneath its select. */
export function RoutingStrategyExplanation({ strategy }: { strategy: RoutingStrategy }) {
  const { t } = useTranslation();
  const prefix = `config_management.visual.sections.network.strategy_explain.${routingStrategyKey(strategy)}`;
  return (
    <div className={styles.explain} aria-live="polite">
      <p>{t(`${prefix}.summary`)}</p>
      <p>
        <span className={styles.label}>
          {t('config_management.visual.sections.network.strategy_explain.how_label')}
        </span>{' '}
        {t(`${prefix}.how`)}
      </p>
      <p>
        <span className={styles.label}>
          {t('config_management.visual.sections.network.strategy_explain.best_for_label')}
        </span>{' '}
        {t(`${prefix}.best_for`)}
      </p>
      {QUOTA_AWARE.has(strategy) && (
        <>
          <p>{t('config_management.visual.sections.network.strategy_explain.quota_note')}</p>
          <a className={styles.link} href="#/quota">
            {t('config_management.visual.sections.network.strategy_explain.preview_link')}
          </a>
        </>
      )}
    </div>
  );
}
