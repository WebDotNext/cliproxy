/**
 * One credential's quota as a list row: account (icon, name, plan) on the
 * left, every usage window side by side, actions on the right.
 *
 * - idle：整个 body 是一个点击加载按钮（上游直连有速率考虑，不自动拉取）；
 * - loading：双幽灵行骨架（aria-busy，文字等价视觉隐藏）；
 * - error：失败色条 + footer 刷新即重试；
 * - success：provider Body（穿 QuotaBody.module.scss 全页外衣）。
 */

import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import type { ResolvedTheme } from '@/types';
import { resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaAccountLabel, getQuotaDisplayName } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { bindQuotaClasses } from '../types';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ClaudeResetGrantDetails } from '../providers/claude/ClaudeResetGrantDetails';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';

/** 额度页全页外衣：QuotaBody 模块绑定成类型化契约（缺键在模块初始化即抛）。 */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

/**
 * Same look, laid out as cells: each window fills a column (label and percent,
 * bar, then reset time), chips stay narrow, and reset-grant details wrap to
 * their own line after the windows.
 */
const withRowClass = (key: keyof typeof quotaClasses, extra: string) =>
  `${quotaClasses[key]} ${extra}`;
const rowClasses = {
  ...quotaClasses,
  quotaRow: withRowClass('quotaRow', styles.windowCell),
  quotaRowHeader: withRowClass('quotaRowHeader', styles.contents),
  quotaMeta: withRowClass('quotaMeta', styles.contents),
  quotaModel: withRowClass('quotaModel', styles.windowLabel),
  quotaPercent: withRowClass('quotaPercent', styles.windowPercent),
  quotaReset: withRowClass('quotaReset', styles.windowReset),
  quotaResetRelative: withRowClass('quotaResetRelative', styles.windowRelative),
  quotaBar: withRowClass('quotaBar', styles.windowBar),
  codexResetCredits: withRowClass('codexResetCredits', styles.detailsCell),
  antigravityQuotaGroup: withRowClass('antigravityQuotaGroup', styles.groupCell),
};

export type QuotaCardProps = {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  resolvedTheme: ResolvedTheme;
  canRefresh: boolean;
  resetting: boolean;
  /** 首屏级联入场延迟；null = 不入场（切 tab / 翻页 / 刷新新挂载的卡片）。 */
  entranceDelayMs?: number | null;
  /** Colour shared with this account's slice of the pool bars. */
  accentColor?: string;
  /** The router would send the next new session to this account. */
  isNextPick?: boolean;
  onRefresh: () => void;
  onReset: () => void;
};

export function QuotaCard(props: QuotaCardProps) {
  const {
    entry,
    quota,
    resolvedTheme,
    canRefresh,
    resetting,
    entranceDelayMs,
    accentColor,
    isNextPick,
    onRefresh,
    onReset,
  } = props;
  const { t } = useTranslation();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const displayName = getQuotaDisplayName(file);

  // 挂载时捕获一次延迟：后续 props 变 null 不影响本卡（React 19 禁渲染期读 ref）
  const [mountEntranceDelayMs] = useState<number | null>(entranceDelayMs ?? null);
  const entranceStyle =
    mountEntranceDelayMs === null
      ? undefined
      : ({ '--card-delay': `${mountEntranceDelayMs}ms` } as CSSProperties);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );
  const iconSrc = getAuthFileIcon(entry.type, resolvedTheme);
  const typeLabel = getTypeLabel(t, entry.type);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));

  return (
    <article
      className={`${styles.row} ${mountEntranceDelayMs === null ? '' : styles.rowEnter}`}
      style={entranceStyle}
    >
      <header className={styles.head}>
        <span
          className={styles.iconWrap}
          title={typeLabel}
          style={
            isThemeSurfaceIconProvider(entry.type)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.who}>
          <span className={styles.fileName} title={displayName}>
            {accentColor && (
              <i className={styles.swatch} style={{ background: accentColor }} aria-hidden="true" />
            )}
            {getQuotaAccountLabel(file)}
          </span>
          {isNextPick && (
            <span className={styles.nextPick}>{t('quota_management.routing.next_pick')}</span>
          )}
        </span>
      </header>

      <div className={styles.body}>
        {entry.type === 'claude' && status === 'success' && (
          <>
            <div className={quotaClasses.codexPlan}>
              <span className={quotaClasses.codexPlanItem}>
                <span className={quotaClasses.codexPlanLabel}>{t('claude_reset.remaining')}</span>
                <span className={quotaClasses.codexPlanValue}>{claudeReset.count ?? '--'}</span>
              </span>
            </div>
            <ClaudeResetGrantDetails grants={claudeReset.grants} classes={rowClasses} />
            {claudeReset.message && (
              <div role="status" className={quotaClasses.codexResetCreditsError}>
                {t(`claude_reset.${claudeReset.message}`)}
              </div>
            )}
          </>
        )}
        {status === 'idle' ? (
          <button
            type="button"
            className={styles.idleBody}
            onClick={onRefresh}
            disabled={!canRefresh}
          >
            <IconRefreshCw size={15} aria-hidden="true" className={styles.idleGlyph} />
            <span className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</span>
          </button>
        ) : loading ? (
          <div className={styles.skeleton} aria-busy="true">
            <span className={styles.srOnly}>{t(`${adapter.i18nPrefix}.loading`)}</span>
            {[0, 1].map((row) => (
              <div key={row} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skeletonLabel} />
                <span className={styles.skeletonTrack} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <div className={styles.errorStrip} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
          </div>
        ) : quota ? (
          <adapter.Body quota={quota} classes={rowClasses} />
        ) : (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        )}
      </div>

      {status !== 'idle' && (
        <footer className={styles.actionRow}>
          {entry.type === 'claude' && (
            <button
              type="button"
              className={styles.actionPill}
              disabled={claudeReset.blocked}
              onClick={claudeReset.confirm}
              title={t(`claude_reset.${claudeReset.buttonLabel}`)}
            >
              <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
              {t(`claude_reset.${claudeReset.buttonLabel}`)}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              className={styles.actionPill}
              onClick={onReset}
              disabled={!canRefresh || loading || resetting}
              title={t('codex_quota.reset_button')}
            >
              <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
              {t('codex_quota.reset_button')}
            </button>
          )}
          <button
            type="button"
            className={styles.actionPill}
            onClick={onRefresh}
            disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting || claudeReset.busy)}
            title={t('auth_files.quota_refresh_hint')}
          >
            <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
            {t('auth_files.quota_refresh_single')}
          </button>
        </footer>
      )}
    </article>
  );
}
