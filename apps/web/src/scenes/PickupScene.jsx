import { sceneRecordConfig } from '../data/operationsData.js'
import RecordLedger from '../components/lookbook/RecordLedger.jsx'

const pickupNote = '票据标明来源并突出维修取车日期；点按通知状态可选择“已通知”。自提需核对取货码；非免费维修须已开付款单或质保单，免费维修可直接取车。'

export default function PickupScene(props) {
  const pickedUp = props.records.filter((record) => record.pickedUpToday).length
  const waiting = props.records.length - pickedUp
  const waitingLabel = `${String(waiting).padStart(2, '0')} VEHICLES · 等待取车`
  const completedLabel = pickedUp ? `${String(pickedUp).padStart(2, '0')} 台今日已取` : '今天暂无取车记录'

  return (
    <section
      className="look-section pickup-look pickup-archive-board"
      data-depth-section="pickup"
      data-pickup-archive="true"
      id="pickup"
      data-look="pickup"
      aria-labelledby="pickup-title"
    >
      <header className="pickup-archive-title" data-motion="title">
        <p className="pickup-archive-index"><strong>02</strong><span>PICKUP</span></p>
        <h2 id="pickup-title">PICKUP BOARD</h2>
        <p className="pickup-archive-translation" lang="zh-CN">待取车辆</p>
        <p className="pickup-archive-note">{pickupNote}</p>
        <div className="pickup-archive-calibration" aria-hidden="true"><span>01</span><i /><b /></div>
      </header>
      <p className="pickup-folio"><span>{waitingLabel}</span><strong>{completedLabel}</strong></p>
      <RecordLedger {...props} config={sceneRecordConfig.pickup} variant="pickup-archive" />
    </section>
  )
}
