import { api } from './client.js'

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url) }
    image.onerror = () => { reject(new Error('无法读取图片尺寸。')); URL.revokeObjectURL(url) }
    image.src = url
  })
}

export const listAttachments = (workItemId) => api(`/api/v1/work-items/${workItemId}/attachments`)

export async function uploadAttachment(workItemId, file) {
  const sha256 = toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  const prepared = await api('/api/v1/attachments/prepare', {
    method: 'POST',
    body: { workItemId, fileName: file.name, mimeType: file.type, byteSize: file.size, sha256 }
  })
  const upload = await fetch(prepared.uploadUrl, { method: 'PUT', headers: prepared.requiredHeaders, body: file })
  if (!upload.ok) throw new Error(`图片上传失败（${upload.status}）。`)
  const dimensions = await imageSize(file)
  return api('/api/v1/attachments/complete', { method: 'POST', body: { attachmentId: prepared.attachmentId, ...dimensions } })
}

export const deleteAttachment = (attachmentId) => api(`/api/v1/attachments/${attachmentId}`, { method: 'DELETE', body: {} })
