import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from '../data/releaseNotes.js'
import {
  buildEmergencyHandoverText,
  buildEmergencyImportRecords,
  exportEmergencyHandoverImage,
  loadEmergencyHandoverDraft,
  parseEmergencyHandoverText,
  saveEmergencyHandoverDraft
} from '../utils/emergencyHandover.js'

// 应急交接单的共享逻辑：桌面（EmergencyHandoverDesktop）与移动（EmergencyHandoverMobile）
// 两套独立 DOM 共用本钩子；DOM 与样式各自实现（项目铁律 memory 23）。
export default function useEmergencyHandover({ open, storeId, storeName, groups, onImport, onNotify }) {
  const [tab, setTab] = useState('generate')
  const [text, setText] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState('')
  const imageRef = useRef(null)
  imageRef.current = image

  // 卸载时释放图片对象 URL（防内存泄漏）
  useEffect(() => () => { imageRef.current?.revoke?.() }, [])

  // 打开时：优先恢复本机草稿；没有草稿则按当前台账生成默认文字。
  // 刻意不把 groups 放进依赖：打开瞬间取一次列表快照即可，避免编辑中途被覆盖。
  useEffect(() => {
    if (!open) return
    setTab('generate')
    const draft = loadEmergencyHandoverDraft(storeId)
    if (draft) {
      setText(draft.text)
      setDraftSavedAt(draft.savedAt)
    } else {
      setText(buildEmergencyHandoverText({ storeName, generatedAt: new Date(), groups }))
      setDraftSavedAt('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeId])

  const regenerate = useCallback(() => {
    setText(buildEmergencyHandoverText({ storeName, generatedAt: new Date(), groups }))
    setDraftSavedAt('')
    setImage((current) => { current?.revoke?.(); return null })
  }, [groups, storeName])

  const saveDraft = useCallback(() => {
    const saved = saveEmergencyHandoverDraft(storeId, text)
    setDraftSavedAt(saved?.savedAt || '')
    if (saved) onNotify?.('已保存到本机（关掉页面也不丢）')
    else onNotify?.({ message: '本机保存失败：浏览器可能禁用了本地存储。', tone: 'error' })
  }, [storeId, text, onNotify])

  const copyText = useCallback(async () => {
    const value = text
    const fallback = () => {
      try {
        const area = document.createElement('textarea')
        area.value = value
        area.setAttribute('readonly', 'true')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        if (ok) onNotify?.('已复制文字，可直接粘贴到微信')
        else onNotify?.({ message: '复制失败：请手动全选复制。', tone: 'error' })
      } catch {
        onNotify?.({ message: '复制失败：请手动全选复制。', tone: 'error' })
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        onNotify?.('已复制文字，可直接粘贴到微信')
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }, [text, onNotify])

  const generateImage = useCallback(async () => {
    setBusy('image')
    try {
      const next = await exportEmergencyHandoverImage({ text, storeName, generatedAt: new Date(), appVersion: APP_VERSION })
      setImage((current) => { current?.revoke?.(); return next })
      try {
        const anchor = document.createElement('a')
        anchor.href = next.objectUrl
        anchor.download = next.filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        onNotify?.('已生成图片；没自动下载时可在预览里长按保存')
      } catch {
        onNotify?.('已生成图片，请在预览里长按保存')
      }
    } catch (error) {
      onNotify?.({ message: `图片生成失败：${error?.message || '未知错误'}`, tone: 'error' })
    } finally {
      setBusy('')
    }
  }, [text, storeName, onNotify])

  const downloadImage = useCallback(() => {
    if (!image?.objectUrl) return
    try {
      const anchor = document.createElement('a')
      anchor.href = image.objectUrl
      anchor.download = image.filename || '应急交接.png'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      onNotify?.('已再次触发下载')
    } catch {
      onNotify?.('下载被浏览器拦截，请在预览里长按保存')
    }
  }, [image, onNotify])

  const importSummary = useMemo(() => parseEmergencyHandoverText(text), [text])
  const importRecords = useMemo(() => buildEmergencyImportRecords(text, { storeName, date: new Date() }), [text, storeName])

  // 导入补录：把（编辑后的）文字逐条写进「其它交接」台账（标记应急补录）。
  // 长文会被拆成多条（单条 ≤ 500 字，契约上限），一条不丢。
  const importToSystem = useCallback(async () => {
    if (!importRecords.length) {
      onNotify?.({ message: '没有可导入的内容。', tone: 'error' })
      return { ok: false }
    }
    setBusy('import')
    try {
      let okCount = 0
      let firstError = ''
      for (const record of importRecords) {
        const result = await onImport(record)
        if (result?.ok) okCount += 1
        else if (!firstError) firstError = result?.error || '导入失败'
      }
      if (firstError) {
        onNotify?.({ message: `导入未完成：${firstError}`, tone: 'error' })
        return { ok: false }
      }
      onNotify?.(`已导入 ${okCount} 条到「其它交接」台账`)
      return { ok: true, count: okCount }
    } finally {
      setBusy('')
    }
  }, [importRecords, onImport, onNotify])

  return {
    tab, setTab, text, setText, draftSavedAt, image, busy,
    importSummary, importRecords,
    regenerate, saveDraft, copyText, generateImage, downloadImage, importToSystem
  }
}
