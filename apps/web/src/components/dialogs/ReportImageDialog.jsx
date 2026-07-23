import AppDialog from './AppDialog.jsx'

export default function ReportImageDialog({ open, onClose, imageUrl, filename, onDownload }) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="闭店日报图"
      eyebrow="SIGNAL REPORT · 保存到相册"
      description="报告已按模块信号、冷白明细和高对比结构输出，并针对聊天压缩与灰度阅读保留文字标签和边界。若未出现下载项，请长按下方大图保存。"
      signalModule="closing"
      registration="REPORT / EXPORT"
    >
      {imageUrl ? (
        <div className="report-image-preview">
          <img src={imageUrl} alt={filename || '闭店日报图'} className="report-image-preview-img" />
          <p className="report-image-preview-tip">长按可保存到相册 / 也可使用下方按钮再次下载</p>
        </div>
      ) : null}
      <div className="dialog-footer">
        <button type="button" className="secondary-action" onClick={onClose}>关闭</button>
        <button type="button" className="primary-action" onClick={onDownload} disabled={!imageUrl}>再次下载</button>
      </div>
    </AppDialog>
  )
}
