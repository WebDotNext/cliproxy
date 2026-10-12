import { useTranslation } from 'react-i18next';
import type { PoolWindow } from '../quotaPool';
import styles from './QuotaPool.module.scss';

/** Headroom per usage window across every account, split by account colour. */
export function QuotaPool({ windows }: { windows: PoolWindow[] }) {
  const { t } = useTranslation();
  if (windows.length === 0) return null;

  return (
    <section className={styles.pool} aria-label={t('quota_management.pool.title')}>
      {windows.map((window) => {
        const spent = window.capacity - window.remaining;
        return (
          <div key={window.id} className={styles.window}>
            <div className={styles.head}>
              <span>{window.label}</span>
              <strong>
                {t('quota_management.pool.left', {
                  left: Math.round(window.remaining),
                  total: window.capacity,
                })}
              </strong>
            </div>
            <div className={styles.stack} aria-hidden="true">
              {window.segments.map((segment) => (
                <i
                  key={segment.key}
                  style={{ flexGrow: segment.remaining, background: segment.color }}
                />
              ))}
              {spent > 0 && <i className={styles.spent} style={{ flexGrow: spent }} />}
            </div>
            <ul className={styles.legend}>
              {window.segments.map((segment) => (
                <li key={segment.key}>
                  <i style={{ background: segment.color }} aria-hidden="true" />
                  <span className={styles.name}>{segment.label}</span>
                  <span className={styles.value}>{Math.round(segment.remaining)}%</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
