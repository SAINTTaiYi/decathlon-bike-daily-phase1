import AppDialog from '../dialogs/AppDialog.jsx'
import useEmergencyHandover from '../../hooks/useEmergencyHandover.js'
import { formatEmergencyStamp } from '../../utils/emergencyHandover.js'

// 移动端应急交接（独立实现 + 独立样式；桌面端见 EmergencyHandoverDesktop）。
// 移动优先：单列堆叠、底部粘性操作区、44px 触控高度、预览可长按存相册。
export default function EmergencyHandoverMobile({ open, onClose, storeId, storeName, groups, onImport, onNotify }) {
  const sheet = useEmergencyHandover({ open, storeId, storeName, groups, onImport, onNotify })

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="应急交接"
      eyebrow="EMERGENCY HANDOVER"
      description="先把车交接清楚：文字可直接改，图片长按存相册；恢复后回来点「导入补录」。"
      className="emergency-dialog-mobile"
    >
      <div className="emergency-tabs" role="tablist" aria-label="应急交接操作">
        <button type="button" className="emergency-tab" data-active={sheet.tab === 'generate'} aria-selected={sheet.tab === 'generate'} role="tab" onClick={() => sheet.setTab('generate')}>交接单</button>
        <button type="button" className="emergency-tab" data-active={sheet.tab === 'import'} aria-selected={sheet.tab === 'import'} role="tab" onClick={() => sheet.setTab('import')}>导入补录</button>
      </div>

      {sheet.tab === 'generate' ? (
        <div className="emergency-body">
          <p className="emergency-hint">
            文字可直接编辑。
            {sheet.draftSavedAt ? ` 本机草稿：${formatEmergencyStamp(sheet.draftSavedAt)}` : ' 记得点「保存到本机」。'}
          </p>
          <textarea
            className="emergency-editor"
            value={sheet.text}
            onChange={(event) => sheet.setText(event.target.value)}
            aria-label="应急交接文字"
            spellCheck="false"
          />
          {sheet.image?.objectUrl ? <img className="emergency-preview" src={sheet.image.objectUrl} alt="应急交接单图片预览（可长按保存）" /> : null}
          <div className="emergency-actions">
            <button type="button" onClick={sheet.saveDraft}>保存到本机</button>
            <button type="button" onClick={() => void sheet.copyText()}>复制文字</button>
            <button type="button" data-primary="true" onClick={() => void sheet.generateImage()} disabled={sheet.busy === 'image'}>
              {sheet.busy === 'image' ? '正在生成…' : '生成图片'}
            </button>
            <button type="button" onClick={sheet.regenerate}>重新生成</button>
          </div>
        </div>
      ) : (
        <div className="emergency-body">
          <p className="emergency-hint">
            恢复后把文字录进系统（写入「其它交接」，标记「应急补录」）。
            共 {sheet.importSummary.chars} 字 → {sheet.importRecords.length} 条。
          </p>
          <textarea
            className="emergency-editor"
            value={sheet.text}
            onChange={(event) => sheet.setText(event.target.value)}
            aria-label="待导入的应急交接文字"
            spellCheck="false"
          />
          <div className="emergency-actions">
            <button type="button" data-primary="true" onClick={() => void sheet.importToSystem()} disabled={sheet.busy === 'import' || !sheet.importRecords.length}>
              {sheet.busy === 'import' ? '正在导入…' : `导入到系统（${sheet.importRecords.length} 条）`}
            </button>
            <button type="button" onClick={() => void sheet.copyText()}>复制文字</button>
          </div>
        </div>
      )}
    </AppDialog>
  )
}
