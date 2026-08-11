import AppDialog from './AppDialog.jsx'

export default function ReportImageDialog({ open, onClose, imageUrl, filename, onDownload }) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="闭店日报图"
      eyebrow="SAVE IMAGE · 保存到相册"
      description="已优先尝试直接下载。若未出现下载项，请长按下方大图选择“保存图片/添加到相册”。"
    >
      {imageUrl ? (
        <div className="report-image-preview">
          <img src={imageUrl} alt={filename || '闭店日报图'} className="report-image-preview-img" />
          <p className="report-image-preview-tip">长按图片可保存到相册 · 也可点下方按钮再次下载</p>
        </div>
      ) : null}
      <div className="dialog-footer">
        <button type="button" className="secondary-action" onClick={onClose}>关闭</button>
        <button type="button" className="primary-action" onClick={onDownload} disabled={!imageUrl}>再次下载</button>
      </div>
    </AppDialog>
  )
}
