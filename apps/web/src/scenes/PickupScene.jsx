import IconDelivery from '@iconoir/DeliveryTruck.mjs'
import PickupLedger from '../components/pickup/PickupLedger.jsx'

export default function PickupScene({ records = [], ...props }) {
  const waiting = records.filter((record) => !record.pickedUpToday).length
  const picked = records.length - waiting
  return <section className="look-section pickup-look pickup-operations-section" id="pickup" aria-labelledby="pickup-title">
    <div className="pickup-reference-hero">
      <div className="pickup-chapter"><IconDelivery width={22} height={22} aria-hidden="true" /><span>02 / 06</span><h1 id="pickup-title">待取车辆</h1></div>
      <svg className="pickup-hero-guide" viewBox="0 0 852 430" preserveAspectRatio="none" aria-hidden="true"><path d="M690-20C614 89 486 158 360 245C300 286 272 342 281 430" /><g><path d="M775 126h32M791 110v32" /><circle cx="791" cy="126" r="5" /></g></svg>
      <img className="pickup-hero-ore" src="/images/ops/reference-home/obsidian-orange-cut-900.webp" alt="" width="900" height="720" decoding="async" />
      <div className="pickup-hero-status"><span>QUEUE STATUS</span><dl><div><dt>{String(waiting).padStart(2, '0')}</dt><dd>待取</dd></div><div><dt>{String(picked).padStart(2, '0')}</dt><dd>今日已取</dd></div></dl></div>
    </div>
    <PickupLedger records={records} {...props} />
  </section>
}
