import { useEffect, useState } from 'react'
import ProjectSelect from '../ProjectSelect.jsx'
import AppDialog from './AppDialog.jsx'
import {
  emptyPickupDraft,
  MANUAL_PICKUP_SOURCES,
  PICKUP_CONTACT_TYPES,
  pickupRecordToDraft,
  SELF_PICKUP_PLATFORMS
} from '../../data/pickupRecord.js'
import {
  emptyRepairDraft,
  REPAIR_CONTACT_TYPES,
  REPAIR_STATUSES,
  REPAIR_TYPES,
  FREE_REPAIR,
  COMPLETED_REPAIR_STATUSES,
  isCompletedRepairStatus,
  repairRecordToDraft,
  STORE_PRODUCT_REPAIR
} from '../../data/repairRecord.js'

const emptyDraft = { title: '', detail: '', meta: '', status: '' }
const HANDOVER_STATUSES = [{ value: '继续跟进', label: '继续跟进' }, { value: '已处理', label: '已处理' }]

function genericRecordToDraft(record) {
  return record ? {
    title: record.title || '',
    detail: record.detail || '',
    meta: record.meta || '',
    status: record.status || ''
  } : { ...emptyDraft }
}

function handoverRecordToDraft(record) {
  const draft = genericRecordToDraft(record)
  return {
    ...draft,
    contactValue: record?.contactValue || '',
    status: HANDOVER_STATUSES.some(({ value }) => value === draft.status) ? draft.status : '继续跟进'
  }
}

function HandoverFields({ draft, setDraft }) {
  const item = draft.detail || draft.title
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const updateItem = (value) => setDraft((current) => ({ ...current, title: value.slice(0, 80), detail: value }))
  return <>
    <label className="field-row"><span>交接事项</span><textarea required rows="6" maxLength="240" value={item} onChange={(event) => updateItem(event.target.value)} /></label>
    <label className="field-row">
      <span>电话号码（选填）</span>
      <input
        maxLength="80"
        inputMode="tel"
        autoComplete="tel"
        placeholder="可不填"
        value={draft.contactValue || ''}
        onChange={(event) => set('contactValue', event.target.value)}
      />
    </label>
    <div className="field-row"><span>当前状态</span><ProjectSelect value={draft.status || '继续跟进'} options={HANDOVER_STATUSES} onChange={(value) => set('status', value)} ariaLabel="选择交接事项当前状态" /></div>
  </>
}

function PickupFields({ draft, setDraft, record }) {
  const selfPickup = draft.pickupSource === 'self-pickup'
  const usedCar = draft.pickupSource === 'used-car'
  const resaleOriginUsedCar = usedCar && record?.resaleStage === 'sold'
  const customerStorage = draft.pickupSource === 'customer-storage'
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }))

  return (
    <>
      <div className="field-row">
        <span>待取来源</span>
        <ProjectSelect
          value={draft.pickupSource}
          options={MANUAL_PICKUP_SOURCES}
          onChange={(value) => setDraft((current) => ({
            ...current,
            pickupSource: value,
            detail: value === 'customer-storage' ? current.detail : '',
            selfPickupPlatform: value === 'self-pickup' ? current.selfPickupPlatform : ''
          }))}
          ariaLabel="选择待取来源"
          disabled={resaleOriginUsedCar}
        />
      </div>
      {selfPickup ? (
        <div className="field-row">
          <span>自提平台</span>
          <ProjectSelect
            value={draft.selfPickupPlatform}
            options={SELF_PICKUP_PLATFORMS}
            onChange={(value) => set('selfPickupPlatform', value)}
            placeholder="请选择天猫、京东或小程序"
            ariaLabel="选择自提平台"
          />
        </div>
      ) : null}
      <label className="field-row"><span>车辆或顾客标识</span><input required maxLength="80" value={draft.title} onChange={(event) => set('title', event.target.value)} /></label>
      {customerStorage ? <label className="field-row"><span>顾客暂存说明</span><textarea required rows="4" maxLength="240" value={draft.detail} onChange={(event) => set('detail', event.target.value)} /></label> : null}
      <fieldset className="field-group">
        <legend>联系方式</legend>
        <div className="contact-field-grid">
          <div className="field-row">
            <span>联系标识类型</span>
            <ProjectSelect
              value={draft.contactType || 'phone'}
              options={PICKUP_CONTACT_TYPES}
              onChange={(value) => set('contactType', value)}
              ariaLabel="选择联系标识类型"
            />
          </div>
          <label className="field-row">
            <span>{draft.contactType === 'member' ? '会员号' : '手机号'}</span>
            <input
              maxLength="80"
              inputMode={draft.contactType === 'phone' ? 'tel' : 'text'}
              autoComplete={draft.contactType === 'phone' ? 'tel' : 'off'}
              value={draft.contactValue || ''}
              onChange={(event) => set('contactValue', event.target.value)}
              aria-describedby="pickup-contact-help"
              placeholder="可不填"
            />
          </label>
        </div>
        <small id="pickup-contact-help" className="field-help">可不填；留空时卡片显示「无」。填写 0 也会作为有效联系方式保存。</small>
      </fieldset>
      {selfPickup
        ? <p className="conditional-field-note"><strong>取车时输入取货码</strong><span>取货码在点击“确认取车”后输入，不保存在台账、票据或操作记录中。</span></p>
        : usedCar
          ? <p className="conditional-field-note"><strong>二手车待取无需附加校验</strong><span>二手车来源会保留在待取台账和闭店日报中，确认身份后可直接点按“确认取车”。</span></p>
          : <p className="conditional-field-note"><strong>顾客暂存无需附加校验</strong><span>确认顾客身份后可直接点按“确认取车”。</span></p>}
      <label className="field-row"><span>当前状态</span><input required maxLength="80" value={draft.status} onChange={(event) => set('status', event.target.value)} /></label>
    </>
  )
}

function RepairFields({ draft, setDraft }) {
  const storeProductRepair = draft.repairType === STORE_PRODUCT_REPAIR
  const freeRepair = draft.repairType === FREE_REPAIR
  const completedRepair = isCompletedRepairStatus(draft.status)
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }))

  return (
    <>
      <label className="field-row">
        <span>车辆型号</span>
        <input required maxLength="80" autoComplete="off" value={draft.title} onChange={(event) => set('title', event.target.value)} />
      </label>

      <fieldset className="field-group">
        <legend>联系方式</legend>
        <div className="contact-field-grid">
          <div className="field-row">
            <span>联系标识类型</span>
            <ProjectSelect
              value={draft.contactType}
              options={REPAIR_CONTACT_TYPES}
              onChange={(value) => set('contactType', value)}
              ariaLabel="选择联系标识类型"
            />
          </div>
          <label className="field-row">
            <span>{draft.contactType === 'member' ? '会员号' : '手机号'}</span>
            <input
              required
              maxLength="80"
              inputMode={draft.contactType === 'phone' ? 'tel' : 'text'}
              autoComplete={draft.contactType === 'phone' ? 'tel' : 'off'}
              value={draft.contactValue}
              onChange={(event) => set('contactValue', event.target.value)}
              aria-describedby="repair-contact-help"
            />
          </label>
        </div>
        <small id="repair-contact-help" className="field-help">可自由输入；填写 0 也会作为有效联系方式保存。</small>
      </fieldset>

      <div className="field-row">
        <span>维修类型</span>
        <ProjectSelect
          value={draft.repairType}
          options={REPAIR_TYPES.map((type) => ({ value: type, label: type }))}
          onChange={(value) => setDraft((current) => ({ ...current, repairType: value, pickupDate: value === STORE_PRODUCT_REPAIR ? '' : current.pickupDate }))}
          placeholder="请选择维修类型"
          ariaLabel="选择维修类型"
        />
      </div>

      <label className="field-row">
        <span>维修项目</span>
        <textarea required rows="4" maxLength="240" value={draft.repairProject} onChange={(event) => set('repairProject', event.target.value)} />
      </label>

      {storeProductRepair ? (
        <p className="conditional-field-note"><strong>取车时间无需填写</strong><span>当前选择“门店产品维修”，此记录不需要顾客取车日期。</span></p>
      ) : (
        <label className="field-row">
          <span>取车时间</span>
          <input required type="date" value={draft.pickupDate} onChange={(event) => set('pickupDate', event.target.value)} />
        </label>
      )}

      <label className="field-row">
        <span>当前状态</span>
        <ProjectSelect
          value={draft.status}
          options={(completedRepair ? COMPLETED_REPAIR_STATUSES : REPAIR_STATUSES).map((status) => ({ value: status, label: status }))}
          onChange={(value) => set('status', value)}
          ariaLabel={completedRepair ? '选择维修完成状态' : '选择维修当前状态'}
        />
      </label>
      {freeRepair ? <p className="conditional-field-note"><strong>快速服务免费可直接取车</strong><span>先将当前状态选择为“快速服务免费”；点按“维修完毕”后会转为“维修完成-快速服务免费”。</span></p> : null}
      {completedRepair ? <p className="conditional-field-note"><strong>完成状态可人工干预</strong><span>仅可在五个“维修完成-*”状态之间切换；如需恢复维修，请从操作记录撤回“维修完毕”。</span></p> : null}
    </>
  )
}

export default function RecordEditorDialog({ open, onClose, config, record, onSave, onNotify }) {
  const repairForm = config.formKind === 'repair'
  const pickupForm = config.formKind === 'pickup'
  const handoverForm = config.formKind === 'handover'
  const [draft, setDraft] = useState(repairForm ? emptyRepairDraft : pickupForm ? emptyPickupDraft : emptyDraft)
  const [error, setError] = useState('')
  const editing = Boolean(record)

  useEffect(() => {
    if (!open) return
    setDraft(repairForm ? repairRecordToDraft(record) : pickupForm ? pickupRecordToDraft(record) : handoverForm ? handoverRecordToDraft(record) : genericRecordToDraft(record))
    setError('')
  }, [open, record, pickupForm, repairForm, handoverForm])

  const [submitting, setSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    const result = await onSave(draft)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onNotify?.(editing ? `已更新：${draft.title}` : `已增加：${draft.title}`)
    onClose()
  }

  const description = repairForm
    ? '按门店维修单结构登记；固定选项不可自由输入。门店产品维修完成后原地留档，付费、质保与免费维修完成后转入待取。'
    : pickupForm
      ? '请选择自提订单车辆或顾客暂存，并按需登记联系方式（手机号或会员号，可留空）。自提订单需选择天猫、京东或小程序，不填写取车说明；确认取车时再输入取货码。'
      : handoverForm
        ? '交接事项会跨日期保留。填写交接事项并选择当前状态；电话号码可按需录入，不填写也可以保存。'
        : '这条记录会跨日期保留；当天没有编辑时会原样延续到下一日期。新增、编辑和删除都会写入操作记录。'

  return (
    <AppDialog open={open} onClose={onClose} title={editing ? `编辑${config.singular}` : config.addLabel} eyebrow="LEDGER · 长期台账" description={description} className="data-dialog">
      <form className="data-form" onSubmit={submit}>
        {repairForm ? <RepairFields draft={draft} setDraft={setDraft} /> : pickupForm ? <PickupFields draft={draft} setDraft={setDraft} record={record} /> : handoverForm ? <HandoverFields draft={draft} setDraft={setDraft} /> : (
          <>
            <label className="field-row"><span>{config.titleLabel}</span><input required maxLength="80" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="field-row"><span>{config.detailLabel}</span><textarea required rows="4" maxLength="240" value={draft.detail} onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value }))} /></label>
            <label className="field-row"><span>{config.metaLabel}</span><input maxLength="120" value={draft.meta} onChange={(event) => setDraft((current) => ({ ...current, meta: event.target.value }))} /></label>
            <label className="field-row"><span>{config.statusLabel}</span><input required maxLength="80" placeholder={config.statusPlaceholder} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} /></label>
          </>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button type="submit" className="primary-action" disabled={submitting}>{submitting ? '正在保存…' : editing ? '保存修改' : '增加台账'}</button></div>
      </form>
    </AppDialog>
  )
}
