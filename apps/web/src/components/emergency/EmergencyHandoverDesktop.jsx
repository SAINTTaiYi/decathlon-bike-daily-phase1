import AppDialog from '../dialogs/AppDialog.jsx'
import useEmergencyHandover from '../../hooks/useEmergencyHandover.js'
import { formatEmergencyStamp } from '../../utils/emergencyHandover.js'

// 桌面端应急交接（独立实现 + 独立样式；移动端见 EmergencyHandoverMobile）。
export default function EmergencyHandoverDesktop({ open, onClose, storeId, storeName, groups, onImport, onNotify }) {
  const sheet = useEmergencyHandover({ open, storeId, storeName, groups, onImport, onNotify })

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="应急交接"
      eyebrow="EMERGENCY HANDOVER"
      description="数据库写入受限时用本单完成交接：图片与文字都保存在本机；额度恢复后在「导入补录」里把它录进系统。"
      className="emergency-dialog-desktop"
    >
      <div className="emergency-tabs" role="tablist" aria-label="应急交接操作">
        <button type="button" className="emergency-tab" data-active={sheet.tab === 'generate'} aria-selected={sheet.tab === 'generate'} role="tab" onClick={() => sheet.setTab('generate')}>生成交接单</button>
        <button type="button" className="emergency-tab" data-active={sheet.tab === 'import'} aria-selected={sheet.tab === 'import'} role="tab" onClick={() => sheet.setTab('import')}>导入补录</button>
      </div>

      {sheet.tab === 'generate' ? (
        <div className="emergency-body">
          <div className="emergency-col">
            <p className="emergency-hint">
              文字可直接编辑（补上经手人 / 实际交付情况等）。
              {sheet.draftSavedAt ? ` 本机草稿：${formatEmergencyStamp(sheet.draftSavedAt)}` : ' 尚未保存到本机。'}
            </p>
            <textarea
              className="emergency-editor"
              value={sheet.text}
              onChange={(event) => sheet.setText(event.target.value)}
              aria-label="应急交接文字"
              spellCheck="false"
              data-autofocus
            />
            <div className="emergency-actions">
              <button type="button" onClick={sheet.regenerate}>重新生成</button>
              <button type="button" onClick={sheet.saveDraft}>保存到本机</button>
              <button type="button" onClick={() => void sheet.copyText()}>复制文字</button>
              <button type="button" data-primary="true" onClick={() => void sheet.generateImage()} disabled={sheet.busy === 'image'}>
                {sheet.busy === 'image' ? '正在生成图片…' : '生成图片'}
              </button>
            </div>
          </div>
          <div className="emergency-col">
            {sheet.image?.objectUrl
              ? <img className="emergency-preview" src={sheet.image.objectUrl} alt="应急交接单图片预览" />
              : <div className="emergency-empty-preview">点「生成图片」后这里显示预览（可长按 / 右键保存）</div>}
            <div className="emergency-actions">
              <button type="button" onClick={sheet.downloadImage} disabled={!sheet.image?.objectUrl}>再次下载图片</button>
            </div>
            <p className="emergency-meta">默认不上传任何内容；缓存留在本机。恢复后把文字粘到「导入补录」即可入库（其它交接台账）。</p>
          </div>
        </div>
      ) : (
        <div className="emergency-body">
          <div className="emergency-col">
            <p className="emergency-hint">
              把（编辑好的）交接文字录进系统：将写入「其它交接」台账并标记「应急补录」。
              共 {sheet.importSummary.chars} 字 / {sheet.importSummary.contentLines} 行 → 拆成 {sheet.importRecords.length} 条记录。
            </p>
            <textarea
              className="emergency-editor"
              value={sheet.text}
              onChange={(event) => sheet.setText(event.target.value)}
              aria-label="待导入的应急交接文字"
              spellCheck="false"
            />
          </div>
          <div className="emergency-col">
            <div className="emergency-actions">
              <button type="button" data-primary="true" onClick={() => void sheet.importToSystem()} disabled={sheet.busy === 'import' || !sheet.importRecords.length}>
                {sheet.busy === 'import' ? '正在导入…' : `导入到系统（${sheet.importRecords.length} 条）`}
              </button>
              <button type="button" onClick={() => void sheet.copyText()}>复制文字</button>
            </div>
            <p className="emergency-meta">导入需要数据库可写（额度已恢复）且处于登录状态。导入后可在「其它交接」台账里查看与编辑。</p>
          </div>
        </div>
      )}
    </AppDialog>
  )
}
