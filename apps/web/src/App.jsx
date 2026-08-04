import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BootLoader from './components/BootLoader.jsx'
import InitialSetup from './components/InitialSetup.jsx'
import PlatformAdminSetup from './components/PlatformAdminSetup.jsx'
import RegistrationWizard from './components/RegistrationWizard.jsx'
import PasswordChangeGate from './components/PasswordChangeGate.jsx'
import StatusToast from './components/StatusToast.jsx'
import { APP_VERSION } from './data/releaseNotes.js'
import { buildClosingReportModel, exportClosingReportImage } from './utils/closingReportImage.js'
import ActionDock from './components/lookbook/ActionDock.jsx'
import WorkshopShellHeader from './components/workshop/WorkshopShellHeader.jsx'
import WorkshopOverviewPage from './components/overview/WorkshopOverviewPage.jsx'
import AttachmentDialog from './components/dialogs/AttachmentDialog.jsx'
import ConfirmClosingDialog from './components/dialogs/ConfirmClosingDialog.jsx'
import KpiDialog from './components/dialogs/KpiDialog.jsx'
import LocalMigrationDialog, { hasLocalV5Data } from './components/dialogs/LocalMigrationDialog.jsx'
import LogDialog from './components/dialogs/LogDialog.jsx'
import PermanentHistoryDialog from './components/dialogs/PermanentHistoryDialog.jsx'
import GovernanceDialog from './components/dialogs/GovernanceDialog.jsx'
import ReportImageDialog from './components/dialogs/ReportImageDialog.jsx'
import UpdateRefreshDialog from './components/dialogs/UpdateRefreshDialog.jsx'
import MenuDialog from './components/dialogs/MenuDialog.jsx'
import OperationHistoryDialog from './components/dialogs/OperationHistoryDialog.jsx'
import PickupConfirmDialog from './components/dialogs/PickupConfirmDialog.jsx'
import RecordEditorDialog from './components/dialogs/RecordEditorDialog.jsx'
import { sceneRecordConfig } from './data/operationsData.js'
import { inferPickupSource } from './data/pickupRecord.js'
import { REPAIR_POS_REMINDER_STATUS } from './data/repairRecord.js'
import { sceneById } from './data/lookbookScenes.js'
import useAuth from './hooks/useAuth.js'
import useRemoteClosingWorkflow from './hooks/useRemoteClosingWorkflow.js'
import useActiveScene from './hooks/useActiveScene.js'
import useDesktopSceneTransition from './hooks/useDesktopSceneTransition.js'
import useMotionSystem from './hooks/useMotionSystem.js'
import useWorkspaceMotion from './hooks/useWorkspaceMotion.js'
import useVisualViewportMetrics from './hooks/useVisualViewportMetrics.js'
import OpeningScene from './scenes/OpeningScene.jsx'
import PickupScene from './scenes/PickupScene.jsx'
import RepairScene from './scenes/RepairScene.jsx'
import ResaleScene from './scenes/ResaleScene.jsx'
import SalesScene from './scenes/SalesScene.jsx'

const roleLabels = { operator: '操作员', manager: '经理', admin: '管理员' }

function WorkshopModuleSection({ children, className = '', sceneId }) {
  return (
    <section
      className={`workshop-module-panel ${className}`.trim()}
      id={`module-${sceneId}`}
      tabIndex="-1"
      data-workspace-module="true"
      data-scene-id={sceneId}
    >
      <div className="workshop-module-flow-inner">{children}</div>
    </section>
  )
}

export default function App() {
  useVisualViewportMetrics()
  const auth = useAuth()
  const [loginAnimationDone, setLoginAnimationDone] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [workspaceAssemblyDone, setWorkspaceAssemblyDone] = useState(false)
  const [taskInputFocused, setTaskInputFocused] = useState(false)
  const [desktopLayout, setDesktopLayout] = useState(() => window.matchMedia?.('(min-width: 768px)').matches ?? false)
  const [desktopScene, setDesktopScene] = useState('pulse')
  const workspaceRootRef = useRef(null)
  const [setupToken, setSetupToken] = useState(() => {
    const match = window.location.hash.match(/^#setup=([^&]+)$/u)
    return match ? decodeURIComponent(match[1]) : ''
  })
  const [platformAdminToken, setPlatformAdminToken] = useState(() => {
    const match = window.location.hash.match(/^#platform-admin=([^&]+)$/u)
    return match ? decodeURIComponent(match[1]) : ''
  })
  const authenticated = auth.status === 'authenticated'
  const introDone = authenticated && (auth.source === 'restore' || auth.source === 'registration' || loginAnimationDone)
  const mustChangePassword = Boolean(auth.user?.mustChangePassword)
  const deferUpdatePrompt = auth.source === 'login' && !mustChangePassword && !workspaceAssemblyDone
  const workflow = useRemoteClosingWorkflow(authenticated && !mustChangePassword)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [permanentHistoryOpen, setPermanentHistoryOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [kpiOpen, setKpiOpen] = useState(false)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [governanceOpen, setGovernanceOpen] = useState(false)
  const [reportImage, setReportImage] = useState(null)
  const [recordEditor, setRecordEditor] = useState(null)
  const [mediaRecord, setMediaRecord] = useState(null)
  const [pickupConfirm, setPickupConfirm] = useState(null)
  const [pickupErrors, setPickupErrors] = useState({})
  const [primaryProcessingId, setPrimaryProcessingId] = useState('')
  const [pickupPixelFillId, setPickupPixelFillId] = useState('')
  const [repairPixelDissolveId, setRepairPixelDissolveId] = useState('')
  const primaryProcessingRef = useRef('')
  const deferredPickupResultRef = useRef(null)
  const deferredRepairResultRef = useRef(null)
  const [historyTarget, setHistoryTarget] = useState(null)
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)

  const currentUser = auth.user?.displayName || ''
  const currentStore = auth.stores.find((store) => store.storeId === auth.currentStoreId) || auth.stores[0] || null
  const role = currentStore?.role || 'operator'
  const canReopenClosing = role === 'manager' || role === 'admin'
  const writeLocked = Boolean(workflow.closedAt) || !online || Boolean(workflow.storageError)

  const workspaceLaunching = authenticated && auth.source === 'login' && loginAnimationDone && workflow.hydrated && !workspaceAssemblyDone
  const loginScrollResetRef = useRef(false)
  useLayoutEffect(() => {
    if (!authenticated) {
      loginScrollResetRef.current = false
      return undefined
    }
    if (auth.source !== 'login' || !introDone || !workflow.hydrated || loginScrollResetRef.current) return undefined

    loginScrollResetRef.current = true
    const root = document.documentElement
    const previousScrollBehavior = root.style.scrollBehavior
    const resetToTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    root.style.scrollBehavior = 'auto'
    resetToTop()
    const frame = window.requestAnimationFrame(() => {
      resetToTop()
      root.style.scrollBehavior = previousScrollBehavior
    })
    return () => {
      window.cancelAnimationFrame(frame)
      root.style.scrollBehavior = previousScrollBehavior
    }
  }, [authenticated, auth.source, introDone, workflow.hydrated])
  const completeWorkspaceAssembly = useCallback(() => {
    setWorkspaceAssemblyDone(true)
    window.requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
  }, [])
  const { skip: skipWorkspaceAssembly } = useWorkspaceMotion({
    active: workspaceLaunching,
    rootRef: workspaceRootRef,
    onComplete: completeWorkspaceAssembly
  })
  const taskFocused = Boolean(taskInputFocused || menuOpen || logOpen || permanentHistoryOpen || confirmOpen || kpiOpen || migrationOpen || governanceOpen || reportImage || recordEditor || mediaRecord || pickupConfirm || historyTarget)
  const { activeScene, jumpTo } = useActiveScene({
    enabled: introDone && workflow.hydrated && !workspaceLaunching,
    rootRef: workspaceRootRef
  })

  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 768px)')
    if (!media) return undefined
    const sync = () => setDesktopLayout(media.matches)
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])


  const transitionToDesktopScene = useDesktopSceneTransition({
    enabled: desktopLayout,
    activeScene: desktopScene,
    rootRef: workspaceRootRef,
    onSceneChange: setDesktopScene
  })
  const navigateToScene = useCallback((sceneId) => {
    if (desktopLayout) {
      transitionToDesktopScene(sceneId)
      return
    }
    jumpTo(sceneId)
  }, [desktopLayout, jumpTo, transitionToDesktopScene])
  const visibleScene = desktopLayout ? desktopScene : activeScene

  useMotionSystem({ enabled: introDone && workflow.hydrated && !workspaceLaunching, rootRef: workspaceRootRef, quiet: taskFocused })

  useEffect(() => {
    if (auth.status === 'anonymous') {
      setLoginAnimationDone(false)
      setWorkspaceAssemblyDone(false)
      setAuthMode('login')
    }
  }, [auth.status])

  useEffect(() => {
    if (!workspaceLaunching) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        skipWorkspaceAssembly()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [skipWorkspaceAssembly, workspaceLaunching])

  useEffect(() => {
    const root = workspaceRootRef.current
    if (!root) return undefined
    const syncTaskFocus = () => {
      const focused = document.activeElement
      setTaskInputFocused(Boolean(focused && root.contains(focused) && focused.matches('input, textarea, select, [contenteditable="true"], [role="combobox"]')))
    }
    const deferTaskFocusSync = () => window.setTimeout(syncTaskFocus, 0)
    root.addEventListener('focusin', syncTaskFocus)
    root.addEventListener('focusout', deferTaskFocusSync)
    return () => {
      root.removeEventListener('focusin', syncTaskFocus)
      root.removeEventListener('focusout', deferTaskFocusSync)
    }
  }, [introDone, workflow.hydrated])

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
    if (!workflow.kpiReady) {
      setToast('请先填写今天的销售数据')
      jumpToRequirement()
      return
    }
    setConfirmOpen(true)
  }

  const generateClosingReport = useCallback(async (snapshot = {}, { automatic = false } = {}) => {
    const closedAt = snapshot.closedAt ?? workflow.closedAt
    if (!closedAt) return { ok: false, error: '请先完成闭店，再导出日报图。' }
    try {
      // Never read KPI values again after canvas work begins. The close response is the server-confirmed snapshot for automatic reports.
      const model = buildClosingReportModel({
        businessDate: snapshot.businessDate ?? workflow.dateKey,
        storeName: currentStore?.storeName || '门店',
        exporterName: currentUser,
        kpi: { ...(snapshot.kpi ?? workflow.kpi) },
        records: (snapshot.records ?? workflow.records).map((record) => ({ ...record })),
        closedAt,
        appVersion: APP_VERSION
      })
      if (reportImage?.revoke) reportImage.revoke()
      const image = await exportClosingReportImage(model)
      setReportImage(image)
      setToast(automatic
        ? '闭店日报图已按服务器确认的销售快照生成'
        : image.mode === 'download'
          ? '已开始下载；也可在预览里长按图片保存到相册'
          : '请在预览中长按图片保存到相册，或点“再次下载”')
      return { ok: true, image }
    } catch (error) {
      const message = error?.message || '导出日报图失败。'
      setToast({ message, tone: 'error' })
      return { ok: false, error: message }
    }
  }, [currentStore?.storeName, currentUser, reportImage, workflow.closedAt, workflow.dateKey, workflow.kpi, workflow.records])

  const confirmClose = async () => {
    // `result.day` is returned by the close transaction itself. It is authoritative even before React's background refresh settles.
    const result = await workflow.completeClosing()
    if (!result.ok) return setToast({ message: result.error, tone: 'error' })
    setConfirmOpen(false)
    const report = await generateClosingReport({
      businessDate: workflow.dateKey,
      kpi: result.day?.kpi,
      records: workflow.records,
      closedAt: result.day?.closedAt
    }, { automatic: true })
    if (!report.ok) setToast({ message: `闭店已完成，但日报图未生成：${report.error}`, tone: 'error' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const exportClosingReport = async () => generateClosingReport()

  const closeReportImage = () => {
    if (reportImage?.revoke) reportImage.revoke()
    setReportImage(null)
  }

  const redownloadReportImage = () => {
    if (!reportImage?.objectUrl) return
    const anchor = document.createElement('a')
    anchor.href = reportImage.objectUrl
    anchor.download = reportImage.filename || '闭店日报.png'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setToast('已再次触发下载')
  }

  const reopen = async () => {
    if (!canReopenClosing) return setToast({ message: '只有经理或管理员可以重新打开闭店。', tone: 'error' })
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

  const beginPrimaryConfirmation = useCallback((recordId) => {
    if (primaryProcessingRef.current) return false
    primaryProcessingRef.current = recordId
    setPrimaryProcessingId(recordId)
    return true
  }, [])

  const clearPrimaryConfirmation = useCallback((recordId) => {
    if (primaryProcessingRef.current !== recordId) return
    primaryProcessingRef.current = ''
    setPrimaryProcessingId('')
  }, [])

  const waitForPrimaryFeedback = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
    return new Promise((resolve) => window.setTimeout(resolve, 180))
  }, [])

  const performPrimaryAction = useCallback(async (record, operation, successMessage) => {
    if (!beginPrimaryConfirmation(record.id)) {
      return { ok: false, error: '已有业务操作正在确认，请稍候。' }
    }
    try {
      await waitForPrimaryFeedback()
      const result = await operation()
      if (!result.ok) {
        setToast({ message: result.error, tone: 'error' })
        return result
      }
      setToast(typeof successMessage === 'function' ? successMessage(result) : successMessage)
      return result
    } catch (error) {
      const result = { ok: false, error: error?.message || '业务操作未完成，请重试。' }
      setToast({ message: result.error, tone: 'error' })
      return result
    } finally {
      clearPrimaryConfirmation(record.id)
    }
  }, [beginPrimaryConfirmation, clearPrimaryConfirmation, waitForPrimaryFeedback])

  const completePickupWithPixelFill = useCallback(async (record, pickupCode = '') => {
    if (!beginPrimaryConfirmation(record.id)) return { ok: false, error: '该取车操作正在确认，请稍候。' }
    await waitForPrimaryFeedback()
    const result = await workflow.completePickup(record.id, pickupCode, { apply: false, sync: 'none' })
    if (!result.ok) {
      clearPrimaryConfirmation(record.id)
      return result
    }
    deferredPickupResultRef.current = { id: record.id, result, title: record.title }
    setPickupPixelFillId(record.id)
    return result
  }, [beginPrimaryConfirmation, clearPrimaryConfirmation, waitForPrimaryFeedback, workflow])

  const completePickupPixelFill = useCallback((recordId) => {
    const pending = deferredPickupResultRef.current
    if (!pending || pending.id !== recordId) return
    deferredPickupResultRef.current = null
    workflow.commitDeferredResult(pending.result)
    setPickupPixelFillId('')
    clearPrimaryConfirmation(recordId)
    setPickupErrors((current) => { const next = { ...current }; delete next[recordId]; return next })
    setToast(`已确认取车：${pending.title}`)
  }, [clearPrimaryConfirmation, workflow])

  const completeRepairWithConfirmation = useCallback(async (record) => {
    if (!beginPrimaryConfirmation(record.id)) return
    await waitForPrimaryFeedback()
    const result = await workflow.completeRepair(record.id, { apply: false, sync: 'none' })
    if (!result.ok) {
      clearPrimaryConfirmation(record.id)
      setToast({ message: result.error, tone: 'error' })
      return
    }
    // Only a confirmed server transition is allowed to start the repair card's visual departure.
    deferredRepairResultRef.current = { id: record.id, result, title: record.title }
    setRepairPixelDissolveId(record.id)
  }, [beginPrimaryConfirmation, clearPrimaryConfirmation, waitForPrimaryFeedback, workflow])

  const completeRepairPixelDissolve = useCallback((recordId) => {
    const pending = deferredRepairResultRef.current
    if (!pending || pending.id !== recordId) return
    deferredRepairResultRef.current = null
    workflow.commitDeferredResult(pending.result)
    setRepairPixelDissolveId('')
    clearPrimaryConfirmation(recordId)
    setToast(pending.result.route === 'completed'
      ? `门店产品维修已完成：${pending.title}`
      : `维修完成，已携带维修单转入待取：${pending.title}`)
  }, [clearPrimaryConfirmation, workflow])

  const recordProps = (scene) => ({
    records: workflow.recordsByScene[scene] || [],
    closedAt: writeLocked,
    onAdd: () => setRecordEditor({ scene, record: null }),
    onEdit: (record) => setRecordEditor({ scene, record }),
    onHistory: (record = null) => setHistoryTarget({ scene, record }),
    onMedia: (record) => setMediaRecord(record),
    onResaleListing: (record) => void performPrimaryAction(record, () => workflow.completeResaleListing(record.id), `维修完毕，已进入二手车在册：${record.title}`),
    onResaleSold: (record) => void performPrimaryAction(record, () => workflow.sellResale(record.id), `已售出，已转入待取（二手车）：${record.title}`),
    onRepairComplete: (record) => void completeRepairWithConfirmation(record),
    onHandoverComplete: (record) => void performPrimaryAction(record, () => workflow.completeHandover(record.id), `已完成交接：${record.title}`),
    onPickupNotificationChange: async (record, notificationStatus) => {
      const result = await workflow.updatePickupNotification(record.id, notificationStatus)
      setToast(result.ok ? `${record.title}：${notificationStatus === 'notified' ? '已通知' : '等待确认通知'}` : { message: result.error, tone: 'error' })
    },
    pickupErrors,
    primaryProcessingId,
    primaryActionBusy: Boolean(primaryProcessingId),
    pickupPixelFillId,
    onPickupPixelFillComplete: completePickupPixelFill,
    repairPixelDissolveId,
    onRepairPixelDissolveComplete: completeRepairPixelDissolve,
    onPickup: async (record) => {
      if (inferPickupSource(record) === 'self-pickup' || record.status === REPAIR_POS_REMINDER_STATUS) return setPickupConfirm(record)
      const result = await completePickupWithPixelFill(record)
      if (!result.ok) {
        setPickupErrors((current) => ({ ...current, [record.id]: result.error }))
        setToast({ message: result.error, tone: 'error' })
      }
    },
    onRemove: (record) => perform(() => workflow.removeRecord(record.id), `已删除：${record.title}`)
  })

  if (setupToken && !authenticated) {
    return <><InitialSetup token={setupToken} onComplete={() => { setSetupToken(''); setToast('首位管理员已创建，请使用新账号登录。') }} /><UpdateRefreshDialog enabled={!deferUpdatePrompt} /></>
  }

  if (platformAdminToken && !authenticated) {
    return <><PlatformAdminSetup token={platformAdminToken} onComplete={() => { setPlatformAdminToken(''); setToast('CHU13 已创建，请使用 CHU13 登录。') }} /><UpdateRefreshDialog enabled={!deferUpdatePrompt} /></>
  }

  if (!authenticated && authMode === 'register') {
    return <><RegistrationWizard onBack={() => setAuthMode('login')} onComplete={(payload) => { auth.acceptRegistration(payload); setToast('注册完成，已加入所选门店。') }} /><UpdateRefreshDialog enabled={!deferUpdatePrompt} /></>
  }

  if (auth.status === 'restoring') {
    return <><main className="hydration-state" role="status" aria-live="polite"><strong>VERIFYING SESSION</strong><span>正在验证数据库账号…</span></main><UpdateRefreshDialog enabled={!deferUpdatePrompt} /></>
  }

  if (authenticated && mustChangePassword && introDone) {
    return <><PasswordChangeGate userName={currentUser} onChangePassword={auth.changePassword} onLogout={auth.logout} onComplete={() => setToast('密码已更新，业务工作台已解锁。')} /><ReportImageDialog
        open={Boolean(reportImage?.objectUrl)}
        onClose={closeReportImage}
        imageUrl={reportImage?.objectUrl || ''}
        filename={reportImage?.filename || ''}
        onDownload={redownloadReportImage}
      />
      <UpdateRefreshDialog /><StatusToast notice={toast} /></>
  }

  if (authenticated && !workflow.hydrated && (auth.source === 'restore' || loginAnimationDone)) {
    return <><main className="hydration-state" role="status" aria-live="polite"><strong>SYNCING DATABASE</strong><span>正在读取门店业务台账…</span></main><UpdateRefreshDialog enabled={!deferUpdatePrompt} /></>
  }

  if (authenticated && introDone && workflow.hydrated && !workflow.hasSnapshot) {
    return (
      <>
        <main className="hydration-state sync-failure" role="alert" aria-live="assertive">
          <strong>DATABASE UNAVAILABLE</strong>
          <span>{workflow.storageError || '暂时无法读取门店业务台账。'}</span>
          <p>为避免把空页面误认为真实数据，工作台不会在首次同步成功前开放。</p>
          <div className="hydration-state-actions">
            <button type="button" className="primary-action" onClick={() => void workflow.refresh()} disabled={workflow.syncing}>{workflow.syncing ? '正在重试…' : '重新同步'}</button>
            <button type="button" className="secondary-action" onClick={() => void logout()}>退出登录</button>
          </div>
        </main>
        <UpdateRefreshDialog enabled={!deferUpdatePrompt} />
      </>
    )
  }

  const jumpFromOverview = (sceneId) => navigateToScene(sceneId)

  const editorConfig = recordEditor
    ? recordEditor.scene === 'pickup' && inferPickupSource(recordEditor.record) === 'repair'
      ? sceneRecordConfig.repair
      : sceneRecordConfig[recordEditor.scene]
    : sceneRecordConfig.poster
  const showBoot = !introDone && authMode === 'login'

  return (
    <>
      {showBoot ? <BootLoader onLogin={auth.login} onComplete={() => setLoginAnimationDone(true)} onRegister={() => setAuthMode('register')} /> : null}
      {introDone ? <a className="skip-link" href="#closing-summary-anchor">跳到闭店摘要</a> : null}
      <div ref={workspaceRootRef} className="app-runtime workshop-runtime" data-ready={introDone && workflow.hydrated ? 'true' : 'false'} data-workspace-launching={workspaceLaunching ? 'true' : 'false'} inert={!introDone || workspaceLaunching ? '' : undefined} aria-hidden={!introDone || workspaceLaunching ? 'true' : undefined}>
        <div className="workspace-environment" data-workspace-layer="environment" aria-hidden="true" />
        <span className="desktop-scene-transition-wipe" aria-hidden="true" />
        <div data-workspace-layer="navigation" data-workspace-priority="true">
          <WorkshopShellHeader
            activeScene={visibleScene}
            dateKey={workflow.dateKey}
            storeName={currentStore?.storeName}
            roleLabel={roleLabels[role]}
            userName={currentUser}
            onMenu={() => setMenuOpen(true)}
            onLog={() => setLogOpen(true)}
            onSearch={() => navigateToScene('pickup')}
            hasUnread={Boolean(workflow.events?.length)}
          />
        </div>
        {!online ? <p className="workshop-global-alert" role="status">OFFLINE · 当前仅可查看最近成功加载的数据；恢复网络后才能修改。</p> : null}
        <main className="workshop-shell" data-desktop-scene={desktopScene} id="main-content" tabIndex="-1" data-workspace-layer="structure">
          <div className="workshop-module-stack" data-workspace-layer="focus">
            <WorkshopModuleSection sceneId="pulse" className="workshop-overview-panel">
              <span className="closing-summary-anchor" id="closing-summary-anchor" aria-hidden="true" />
              <WorkshopOverviewPage
                workflow={workflow}
                online={online}
                onEditKpi={() => setKpiOpen(true)}
                onCompleteClosing={requestClose}
                onHistory={() => setHistoryTarget({ scene: 'pulse', record: null })}
                onRefresh={() => void workflow.refresh()}
                onReopenClosing={() => void reopen()}
                onExportReport={exportClosingReport}
                onJump={jumpFromOverview}
                showUsed={desktopLayout}
              />
            </WorkshopModuleSection>
            <WorkshopModuleSection sceneId="pickup"><PickupScene {...recordProps('pickup')} /></WorkshopModuleSection>
            <WorkshopModuleSection sceneId="poster"><OpeningScene {...recordProps('poster')} /></WorkshopModuleSection>
            <WorkshopModuleSection sceneId="repair"><RepairScene {...recordProps('repair')} /></WorkshopModuleSection>
            {desktopLayout ? <WorkshopModuleSection sceneId="resale"><ResaleScene {...recordProps('resale')} /></WorkshopModuleSection> : null}
            <WorkshopModuleSection sceneId="sales"><SalesScene kpi={workflow.kpi} kpiReady={workflow.kpiReady} savedAt={workflow.kpiSavedAt} closedAt={writeLocked} onEditKpi={() => setKpiOpen(true)} onHistory={() => setHistoryTarget({ scene: 'sales', record: null })} /></WorkshopModuleSection>
          </div>
          <footer className="closing-footer workshop-footer">
            <div className="footer-identity"><span>{currentStore?.storeName || 'ACTIVE USER'} · {roleLabels[role]}</span><strong>{currentUser}</strong></div>
            <span>LAST SYNC · 最后同步</span>
            <strong>{workflow.lastSyncedAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(workflow.lastSyncedAt)) : '尚未同步'}</strong>
            <button type="button" className="primary-action" onClick={requestClose} disabled={writeLocked}>{workflow.closedAt ? '今日已闭店' : workflow.kpiReady ? '完成闭店' : '填写销售数据'}</button>
            <div className="footer-utility-actions" aria-label="日报辅助操作"><button type="button" onClick={() => setMenuOpen(true)}>日报菜单</button><button type="button" onClick={() => setLogOpen(true)}>当日日志</button><button type="button" onClick={() => setPermanentHistoryOpen(true)}>永久历史</button></div>
          </footer>
        </main>
        <MenuDialog open={menuOpen} onClose={() => setMenuOpen(false)} onUndo={async () => { const result = await workflow.undoLast(); setToast(result.ok ? '已撤回最近一次数据库操作' : { message: result.error, tone: 'error' }); return result }} onCopyReport={copyReport} canUndo={workflow.canUndo && !writeLocked} onReset={async () => { const result = await workflow.resetDay(); setToast(result.ok ? '今天的销售数据已重置' : { message: result.error, tone: 'error' }); return result }} locked={writeLocked} currentUser={currentUser} currentRole={roleLabels[role]} currentStore={currentStore?.storeName || '门店'} onSwitchUser={logout} hasLocalData={canReopenClosing && hasLocalV5Data()} onMigrate={() => setMigrationOpen(true)} canGovernance={true} onGovernance={() => setGovernanceOpen(true)} onOpenPermanentHistory={() => setPermanentHistoryOpen(true)} />
        <GovernanceDialog open={governanceOpen} onClose={() => setGovernanceOpen(false)} currentStoreId={currentStore?.storeId || auth.currentStoreId} onNotify={setToast} />
        <LogDialog open={logOpen} onClose={() => setLogOpen(false)} events={workflow.events} />
        <PermanentHistoryDialog open={permanentHistoryOpen} onClose={() => setPermanentHistoryOpen(false)} onLoad={workflow.getPermanentHistory} canUndo={workflow.canUndoHistoryEvent} onUndo={workflow.undoHistoryEvent} onNotify={setToast} />
        <OperationHistoryDialog open={Boolean(historyTarget)} onClose={() => setHistoryTarget(null)} title={historyTitle} events={historyEvents} canUndo={workflow.canUndoHistoryEvent} onUndo={workflow.undoHistoryEvent} onNotify={setToast} />
        <AttachmentDialog record={mediaRecord} onClose={() => setMediaRecord(null)} locked={writeLocked} onNotify={setToast} />
        <LocalMigrationDialog open={migrationOpen} onClose={() => setMigrationOpen(false)} workflow={workflow} onNotify={setToast} />
        <PickupConfirmDialog record={pickupConfirm} onClose={() => setPickupConfirm(null)} onConfirm={async (record, code) => {
          const result = await completePickupWithPixelFill(record, code)
          if (!result.ok) {
            setPickupErrors((current) => ({ ...current, [record.id]: result.error }))
            setToast({ message: result.error, tone: 'error' })
          }
          return result
        }} />
        <ConfirmClosingDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmClose} />
        <KpiDialog open={kpiOpen} onClose={() => setKpiOpen(false)} values={workflow.kpi} savedAt={workflow.kpiSavedAt} onSave={workflow.saveKpi} onClear={workflow.clearKpi} onNotify={setToast} />
        <RecordEditorDialog open={Boolean(recordEditor)} onClose={() => setRecordEditor(null)} config={editorConfig} record={recordEditor?.record || null} onSave={(values) => recordEditor?.record ? workflow.editRecord(recordEditor.record.id, values) : workflow.addRecord(recordEditor.scene, values)} onNotify={setToast} />
        {introDone ? <div data-workspace-layer="dock" data-workspace-priority="true"><ActionDock activeScene={visibleScene} onJump={jumpFromOverview} closedAt={workflow.closedAt} desktopLayout={desktopLayout} /></div> : null}
      </div>
      {workspaceLaunching ? <div className="workspace-launch-overlay" data-workspace-launch-overlay role="dialog" aria-modal="true" aria-label="工作台入场动画" onPointerDown={(event) => { if (event.currentTarget === event.target) skipWorkspaceAssembly() }}><button type="button" autoFocus onClick={skipWorkspaceAssembly}>跳过入场动画 <small>ESC</small></button></div> : null}
      <ReportImageDialog
        open={Boolean(reportImage?.objectUrl)}
        onClose={closeReportImage}
        imageUrl={reportImage?.objectUrl || ''}
        filename={reportImage?.filename || ''}
        onDownload={redownloadReportImage}
      />
      {introDone ? <UpdateRefreshDialog enabled={!deferUpdatePrompt && !workspaceLaunching} /> : null}
      <StatusToast notice={toast} />
    </>
  )
}
