import { useEffect, useMemo, useState } from 'react'
import BootLoader from './components/BootLoader.jsx'
import InitialSetup from './components/InitialSetup.jsx'
import PasswordChangeGate from './components/PasswordChangeGate.jsx'
import StatusToast from './components/StatusToast.jsx'
import ReleaseNotes from './components/lookbook/ReleaseNotes.jsx'
import { APP_VERSION } from './data/releaseNotes.js'
import { buildClosingReportModel, exportClosingReportImage } from './utils/closingReportImage.js'
import ActionDock from './components/lookbook/ActionDock.jsx'
import ClosingSummary from './components/lookbook/ClosingSummary.jsx'
import LookbookHeader from './components/lookbook/LookbookHeader.jsx'
import MainHeadImage from './components/lookbook/MainHeadImage.jsx'
import AttachmentDialog from './components/dialogs/AttachmentDialog.jsx'
import ConfirmClosingDialog from './components/dialogs/ConfirmClosingDialog.jsx'
import KpiDialog from './components/dialogs/KpiDialog.jsx'
import LocalMigrationDialog, { hasLocalV5Data } from './components/dialogs/LocalMigrationDialog.jsx'
import LogDialog from './components/dialogs/LogDialog.jsx'
import CreateUserDialog from './components/dialogs/CreateUserDialog.jsx'
import MenuDialog from './components/dialogs/MenuDialog.jsx'
import OperationHistoryDialog from './components/dialogs/OperationHistoryDialog.jsx'
import PickupConfirmDialog from './components/dialogs/PickupConfirmDialog.jsx'
import RecordEditorDialog from './components/dialogs/RecordEditorDialog.jsx'
import { sceneRecordConfig } from './data/operationsData.js'
import { inferPickupSource } from './data/pickupRecord.js'
import { sceneById } from './data/lookbookScenes.js'
import useActiveScene from './hooks/useActiveScene.js'
import useAuth from './hooks/useAuth.js'
import useRemoteClosingWorkflow from './hooks/useRemoteClosingWorkflow.js'
import useMotionSystem from './hooks/useMotionSystem.js'
import OpeningScene from './scenes/OpeningScene.jsx'
import PickupScene from './scenes/PickupScene.jsx'
import PulseScene from './scenes/PulseScene.jsx'
import RepairScene from './scenes/RepairScene.jsx'
import ResaleScene from './scenes/ResaleScene.jsx'
import SalesScene from './scenes/SalesScene.jsx'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }

export default function App() {
  const auth = useAuth()
  const [loginAnimationDone, setLoginAnimationDone] = useState(false)
  const [setupToken, setSetupToken] = useState(() => {
    const match = window.location.hash.match(/^#setup=([^&]+)$/u)
    return match ? decodeURIComponent(match[1]) : ''
  })
  const authenticated = auth.status === 'authenticated'
  const introDone = authenticated && (auth.source === 'restore' || loginAnimationDone)
  const mustChangePassword = Boolean(auth.user?.mustChangePassword)
  const workflow = useRemoteClosingWorkflow(authenticated && !mustChangePassword)
  const { activeScene, jumpTo } = useActiveScene()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [kpiOpen, setKpiOpen] = useState(false)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [recordEditor, setRecordEditor] = useState(null)
  const [mediaRecord, setMediaRecord] = useState(null)
  const [pickupConfirm, setPickupConfirm] = useState(null)
  const [pickupErrors, setPickupErrors] = useState({})
  const [historyTarget, setHistoryTarget] = useState(null)
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)

  const currentUser = auth.user?.displayName || ''
  const currentStore = auth.stores.find((store) => store.storeId === auth.currentStoreId) || auth.stores[0] || null
  const role = currentStore?.role || 'operator'
  const canManageClosing = role === 'manager' || role === 'admin'
  const writeLocked = Boolean(workflow.closedAt) || !online || Boolean(workflow.storageError)

  useMotionSystem(introDone && workflow.hydrated)

  useEffect(() => {
    if (auth.status === 'anonymous') setLoginAnimationDone(false)
  }, [auth.status])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const historyEvents = useMemo(() => historyTarget
    ? workflow.getOperationHistory(historyTarget.scene, historyTarget.record?.id || null)
    : [], [historyTarget, workflow])

  const historyTitle = historyTarget?.record?.title
    ? `${historyTarget.record.title} · 操作记录`
    : historyTarget ? `${sceneById(historyTarget.scene).cn} · 操作记录` : '操作记录'

  const logout = async () => {
    setMenuOpen(false)
    setHistoryTarget(null)
    setRecordEditor(null)
    setMediaRecord(null)
    await auth.logout()
  }

  const jumpToRequirement = () => {
    jumpTo('pulse')
    setKpiOpen(true)
  }

  const copyReport = async () => {
    const kpi = workflow.kpi
    const pickedUp = workflow.records.filter((record) => record.pickedUpToday)
    const lines = [
      `迪卡侬自行车部门闭店日报 ${workflow.dateKey}`,
      `门店：${currentStore?.storeName || '未命名门店'}`,
      `当前用户：${currentUser}`,
      `闭店状态：${workflow.closedAt ? '已闭店' : workflow.kpiReady ? '销售数据已填写，可闭店' : '等待填写销售数据'}`,
      `当日销售数据：车辆 ${kpi.salesVehicles}｜安全检查 ${kpi.safetyChecks}｜有效评价 ${kpi.validReviews}｜二手售出 ${kpi.usedSold}｜收车 ${kpi.usedReceived}`,
      `长期台账：待取 ${workflow.recordsByScene.pickup?.length || 0}｜维修 ${workflow.recordsByScene.repair?.length || 0}｜二手车 ${workflow.recordsByScene.resale?.length || 0}｜其它交接 ${workflow.recordsByScene.poster?.length || 0}`,
      pickedUp.length ? `今日已取车：${pickedUp.map((record) => record.title).join('、')}` : '今日已取车：无'
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setToast('当日报告已复制')
    } catch {
      setToast({ message: '复制失败，请在 HTTPS 环境中重试。', tone: 'error' })
    }
  }

  const requestClose = () => {
    if (!online) return setToast({ message: '当前离线，不能执行闭店。', tone: 'error' })
    if (workflow.storageError) return setToast({ message: '数据库同步尚未恢复，请先重新同步。', tone: 'error' })
    if (!canManageClosing) return setToast({ message: '只有经理或管理员可以完成闭店。', tone: 'error' })
    if (!workflow.kpiReady) {
      setToast('请先填写今天的销售数据')
      jumpToRequirement()
      return
    }
    setConfirmOpen(true)
  }

  const confirmClose = async () => {
    const result = await workflow.completeClosing()
    if (!result.ok) return setToast({ message: result.error, tone: 'error' })
    setConfirmOpen(false)
    setToast('今日闭店已完成并同步至数据库')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const exportClosingReport = async () => {
    if (!workflow.closedAt) return setToast({ message: '请先完成闭店，再导出日报图。', tone: 'error' })
    try {
      const model = buildClosingReportModel({
        businessDate: workflow.dateKey,
        storeName: currentStore?.storeName || '门店',
        exporterName: currentUser,
        kpi: workflow.kpi,
        records: workflow.records,
        closedAt: workflow.closedAt,
        appVersion: APP_VERSION
      })
      const result = await exportClosingReportImage(model)
      setToast(result.mode === 'share'
        ? '日报图已打开系统分享，请选择保存到相册'
        : '日报图已开始下载，请在浏览器下载项中保存到相册')
    } catch (error) {
      setToast({ message: error?.message || '导出日报图失败。', tone: 'error' })
    }
  }

  const reopen = async () => {
    if (!canManageClosing) return setToast({ message: '只有经理或管理员可以重新打开闭店。', tone: 'error' })
    const result = await workflow.reopenClosing()
    setToast(result.ok ? '闭店状态已重新打开' : { message: result.error, tone: 'error' })
  }

  const perform = async (operation, successMessage) => {
    const result = await operation()
    if (!result.ok) {
      setToast({ message: result.error, tone: 'error' })
      return result
    }
    setToast(successMessage)
    return result
  }

  const recordProps = (scene) => ({
    records: workflow.recordsByScene[scene] || [],
    closedAt: writeLocked,
    onAdd: () => setRecordEditor({ scene, record: null }),
    onEdit: (record) => setRecordEditor({ scene, record }),
    onHistory: (record = null) => setHistoryTarget({ scene, record }),
    onMedia: (record) => setMediaRecord(record),
    onResaleListing: (record) => void perform(() => workflow.completeResaleListing(record.id), `维修完毕，已进入二手车在册：${record.title}`),
    onResaleSold: (record) => void perform(() => workflow.sellResale(record.id), `已售出：${record.title}`),
    onRepairComplete: async (record) => {
      const result = await workflow.completeRepair(record.id)
      if (!result.ok) return setToast({ message: result.error, tone: 'error' })
      if (result.route === 'completed') return setToast(`门店产品维修已完成：${record.title}`)
      setToast(`维修完毕，已携带维修单转入待取：${record.title}`)
      jumpTo('pickup')
    },
    onHandoverComplete: (record) => void perform(() => workflow.completeHandover(record.id), `已完成交接：${record.title}`),
    onPickupNotificationChange: async (record, notificationStatus) => {
      const result = await workflow.updatePickupNotification(record.id, notificationStatus)
      setToast(result.ok ? `${record.title}：${notificationStatus === 'notified' ? '已通知' : '等待确认通知'}` : { message: result.error, tone: 'error' })
    },
    pickupErrors,
    onPickup: async (record) => {
      if (inferPickupSource(record) === 'self-pickup') return setPickupConfirm(record)
      const result = await workflow.completePickup(record.id)
      if (!result.ok) {
        setPickupErrors((current) => ({ ...current, [record.id]: result.error }))
        return setToast({ message: result.error, tone: 'error' })
      }
      setPickupErrors((current) => { const next = { ...current }; delete next[record.id]; return next })
      setToast(`已确认取车：${record.title}`)
    },
    onRemove: async (record) => {
      if (!window.confirm(`确认从长期台账删除“${record.title}”？删除后可在该模块的操作记录中撤回。`)) return
      await perform(() => workflow.removeRecord(record.id), `已删除：${record.title}`)
    }
  })

  if (setupToken && !authenticated) {
    return <InitialSetup token={setupToken} onComplete={() => { setSetupToken(''); setToast('首位管理员已创建，请使用新账号登录。') }} />
  }

  if (auth.status === 'restoring') {
    return <main className="hydration-state" role="status" aria-live="polite"><strong>VERIFYING SESSION</strong><span>正在验证数据库账号…</span></main>
  }

  if (authenticated && mustChangePassword && introDone) {
    return <><PasswordChangeGate userName={currentUser} onChangePassword={auth.changePassword} onLogout={auth.logout} onComplete={() => setToast('密码已更新，业务工作台已解锁。')} /><StatusToast notice={toast} /></>
  }

  if (authenticated && !workflow.hydrated && (auth.source === 'restore' || loginAnimationDone)) {
    return <main className="hydration-state" role="status" aria-live="polite"><strong>SYNCING DATABASE</strong><span>正在读取门店业务台账…</span></main>
  }

  if (authenticated && introDone && workflow.hydrated && !workflow.hasSnapshot) {
    return (
      <main className="hydration-state sync-failure" role="alert" aria-live="assertive">
        <strong>DATABASE UNAVAILABLE</strong>
        <span>{workflow.storageError || '暂时无法读取门店业务台账。'}</span>
        <p>为避免把空页面误认为真实数据，工作台不会在首次同步成功前开放。</p>
        <div className="hydration-state-actions">
          <button type="button" className="primary-action" onClick={() => void workflow.refresh()} disabled={workflow.syncing}>{workflow.syncing ? '正在重试…' : '重新同步'}</button>
          <button type="button" className="secondary-action" onClick={() => void logout()}>退出登录</button>
        </div>
      </main>
    )
  }

  const editorConfig = recordEditor
    ? recordEditor.scene === 'pickup' && inferPickupSource(recordEditor.record) === 'repair'
      ? sceneRecordConfig.repair
      : sceneRecordConfig[recordEditor.scene]
    : sceneRecordConfig.poster
  const showBoot = !introDone

  return (
    <>
      {showBoot ? <BootLoader onLogin={auth.login} onComplete={() => setLoginAnimationDone(true)} /> : null}
      {introDone ? <a className="skip-link" href="#closing-summary">跳到闭店摘要</a> : null}
      <div className="app-runtime" data-ready={introDone && workflow.hydrated ? 'true' : 'false'} inert={!introDone ? '' : undefined} aria-hidden={!introDone ? 'true' : undefined}>
        <main className="lookbook-shell" id="main-content">
          <LookbookHeader />
          <div className="active-user-strip" aria-label={`当前登录用户：${currentUser}`}><span>{currentStore?.storeName || 'DATABASE'} · {roleLabels[role]}</span><strong>{currentUser}</strong><button type="button" onClick={() => setMenuOpen(true)}>菜单</button></div>
          {!online ? <p className="offline-banner" role="status">OFFLINE · 当前离线，仅可查看最近加载的数据；恢复网络后才能修改。</p> : null}
          <div id="closing-summary"><ClosingSummary workflow={workflow} onJumpToRequirement={jumpToRequirement} onCompleteClosing={requestClose} onReopenClosing={() => void reopen()} onExportReport={exportClosingReport} /></div>
          <ReleaseNotes />
          <MainHeadImage />
          <PulseScene dateKey={workflow.dateKey} kpi={workflow.kpi} kpiReady={workflow.kpiReady} records={workflow.records} closedAt={writeLocked} onJump={jumpTo} onEditKpi={() => setKpiOpen(true)} onHistory={() => setHistoryTarget({ scene: 'pulse', record: null })} />
          <PickupScene {...recordProps('pickup')} />
          <OpeningScene {...recordProps('poster')} />
          <RepairScene {...recordProps('repair')} />
          <ResaleScene {...recordProps('resale')} />
          <SalesScene kpi={workflow.kpi} kpiReady={workflow.kpiReady} savedAt={workflow.kpiSavedAt} closedAt={writeLocked} onEditKpi={() => setKpiOpen(true)} onHistory={() => setHistoryTarget({ scene: 'sales', record: null })} />
          <footer className="closing-footer">
            <div className="footer-identity"><span>{currentStore?.storeName || 'ACTIVE USER'} · {roleLabels[role]}</span><strong>{currentUser}</strong></div>
            <span>LAST SYNC · 最后同步</span>
            <strong>{workflow.lastSyncedAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.lastSyncedAt)) : '尚未同步'}</strong>
            <button type="button" className="primary-action" onClick={requestClose} disabled={writeLocked || !canManageClosing}>{workflow.closedAt ? '今日已闭店' : workflow.kpiReady ? '完成闭店' : '填写销售数据'}</button>
            <div className="footer-utility-actions" aria-label="日报辅助操作"><button type="button" onClick={() => setMenuOpen(true)}>日报菜单</button><button type="button" onClick={() => setLogOpen(true)}>当日日志</button></div>
          </footer>
        </main>
        <MenuDialog open={menuOpen} onClose={() => setMenuOpen(false)} onUndo={async () => { const result = await workflow.undoLast(); setToast(result.ok ? '已撤回最近一次数据库操作' : { message: result.error, tone: 'error' }); return result }} onCopyReport={copyReport} canUndo={workflow.canUndo && !writeLocked} onReset={async () => { const result = await workflow.resetDay(); setToast(result.ok ? '今天的销售数据已重置' : { message: result.error, tone: 'error' }); return result }} locked={writeLocked} currentUser={currentUser} currentRole={roleLabels[role]} currentStore={currentStore?.storeName || '门店'} onSwitchUser={logout} hasLocalData={canManageClosing && hasLocalV5Data()} onMigrate={() => setMigrationOpen(true)} canCreateUser={role === 'admin'} onCreateUser={() => setCreateUserOpen(true)} />
        <CreateUserDialog open={createUserOpen} onClose={() => setCreateUserOpen(false)} onNotify={setToast} />
        <LogDialog open={logOpen} onClose={() => setLogOpen(false)} events={workflow.events} />
        <OperationHistoryDialog open={Boolean(historyTarget)} onClose={() => setHistoryTarget(null)} title={historyTitle} events={historyEvents} canUndo={workflow.canUndoHistoryEvent} onUndo={workflow.undoHistoryEvent} onNotify={setToast} />
        <AttachmentDialog record={mediaRecord} onClose={() => setMediaRecord(null)} locked={writeLocked} onNotify={setToast} />
        <LocalMigrationDialog open={migrationOpen} onClose={() => setMigrationOpen(false)} workflow={workflow} onNotify={setToast} />
        <PickupConfirmDialog record={pickupConfirm} onClose={() => setPickupConfirm(null)} onConfirm={async (record, code) => {
          const result = await workflow.completePickup(record.id, code)
          if (!result.ok) {
            setPickupErrors((current) => ({ ...current, [record.id]: result.error }))
            setToast({ message: result.error, tone: 'error' })
            return result
          }
          setPickupErrors((current) => { const next = { ...current }; delete next[record.id]; return next })
          setToast(`已核对取货码并确认取车：${record.title}`)
          return result
        }} />
        <ConfirmClosingDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmClose} />
        <KpiDialog open={kpiOpen} onClose={() => setKpiOpen(false)} values={workflow.kpi} savedAt={workflow.kpiSavedAt} onSave={workflow.saveKpi} onClear={workflow.clearKpi} onNotify={setToast} />
        <RecordEditorDialog open={Boolean(recordEditor)} onClose={() => setRecordEditor(null)} config={editorConfig} record={recordEditor?.record || null} onSave={(values) => recordEditor?.record ? workflow.editRecord(recordEditor.record.id, values) : workflow.addRecord(recordEditor.scene, values)} onNotify={setToast} />
      </div>
      {introDone ? <ActionDock activeScene={activeScene} onJump={jumpTo} closedAt={workflow.closedAt} /> : null}
      <StatusToast notice={toast} />
    </>
  )
}
