import AppDialog from './AppDialog.jsx'
import { APP_VERSION } from '../../data/releaseNotes.js'
import { writeSeenVersion } from '../../utils/appVersion.js'

/**
 * 版本闸门对话框（2026-09-18 用户定案 B）。
 *
 * 场景：门店设备长期挂着页面，服务端已发新版但本地仍是旧缓存。日报图是本地
 * 代码画的，于是 V6.8.3 的页面在 V6.8.6 上线后仍导出黑色主题的日报图（实测）。
 *
 * - 「立即刷新」= 先记 seen 版本再整页重载。记 seen 的目的：重载后不再弹更新
 *   公告，避免「刚刷新又被要求刷新」的连弹（与 UpdateRefreshDialog.refreshNow
 *   同一约定：用户既然已经选择刷新，就不再重复提醒）。
 * - 「仍要{label}」= 逃生门：按旧页面继续本次操作，临近闭店时不会被硬挡。
 * - 背景点击 / Esc / 关闭按钮 = 取消本次操作，不写任何记忆，下次动作仍会校验。
 */
export default function VersionGateDialog({
  open,
  remoteVersion = '',
  localVersion = APP_VERSION,
  label = '继续',
  onContinue,
  onCancel
}) {
  const refreshNow = () => {
    if (remoteVersion) writeSeenVersion(remoteVersion)
    window.location.reload()
  }

  return (
    <AppDialog
      open={open}
      onClose={onCancel}
      className="version-gate-dialog"
      eyebrow="OUTDATED PAGE · 页面版本落后"
      title="请先刷新页面再继续"
      description="检测到服务端已发布新版本，当前页面仍是旧缓存。旧页面导出的日报图等产出可能与最新版本不一致，请先刷新再操作。"
    >
      <div className="version-gate-card" role="status" aria-live="polite">
        <div>
          <span>服务端版本</span>
          <strong>{remoteVersion ? `V${remoteVersion}` : 'V—'}</strong>
        </div>
        <div>
          <span>当前页面</span>
          <strong>{`V${localVersion}`}</strong>
        </div>
      </div>

      <div className="version-gate-copy">
        <p>{`点「立即刷新」加载最新页面，刷新后重新执行本次操作；若现在必须先做（例如临近闭店时间），可点「仍要${label}」，本次将按当前旧页面继续执行。`}</p>
      </div>

      <div className="dialog-footer version-gate-actions">
        <button type="button" className="secondary-action" onClick={onContinue}>{`仍要${label}`}</button>
        <button type="button" className="primary-action" data-autofocus onClick={refreshNow}>立即刷新</button>
      </div>
    </AppDialog>
  )
}
