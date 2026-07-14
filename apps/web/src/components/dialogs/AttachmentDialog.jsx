import { useEffect, useState } from 'react'
import { deleteAttachment, listAttachments, uploadAttachment } from '../../api/media.js'
import AppDialog from './AppDialog.jsx'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

export default function AttachmentDialog({ record, onClose, locked, onNotify }) {
  const open = Boolean(record)
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!record) return
    try {
      const payload = await listAttachments(record.id)
      setAttachments(payload.attachments)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => { if (open) void load() }, [open, record?.id])

  const upload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!allowedTypes.includes(file.type)) return setError('只允许 JPEG、PNG 或 WebP 图片。')
    if (file.size > 10 * 1024 * 1024) return setError('单张图片不能超过 10 MB。')
    setBusy(true)
    setError('')
    try {
      await uploadAttachment(record.id, file)
      await load()
      onNotify?.('业务图片已安全上传')
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attachment) => {
    if (!window.confirm(`确认删除图片“${attachment.originalName}”？`)) return
    setBusy(true)
    try {
      await deleteAttachment(attachment.id)
      await load()
      onNotify?.('业务图片已删除')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog open={open} onClose={onClose} title={`${record?.title || '业务记录'} · 图片`} eyebrow="PRIVATE MEDIA · 私有附件" description="图片保存在私有 R2 Bucket，通过 5 分钟短时链接上传和查看。每条记录最多 6 张，单张最大 10 MB。" className="data-dialog">
      <label className="attachment-upload" aria-disabled={locked || busy || attachments.length >= 6 ? 'true' : undefined}>
        <span>{busy ? '正在处理…' : attachments.length >= 6 ? '已达到 6 张上限' : '上传 JPEG / PNG / WebP'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={locked || busy || attachments.length >= 6} />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {attachments.length ? (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.originalName} loading="lazy" /></a>
              <span><strong>{attachment.originalName}</strong><small>{attachment.width} × {attachment.height} · {Math.ceil(attachment.byteSize / 1024)} KB</small></span>
              <button type="button" onClick={() => remove(attachment)} disabled={locked || busy}>删除</button>
            </li>
          ))}
        </ul>
      ) : <div className="dialog-empty"><strong>还没有业务图片</strong><p>选择图片后会直接上传至私有 R2，不经过前端服务器转存。</p></div>}
    </AppDialog>
  )
}
