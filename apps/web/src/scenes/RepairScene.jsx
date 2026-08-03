import PickupLedger from '../components/pickup/PickupLedger.jsx'

export default function RepairScene(props) {
  return (
    <section className="look-section pickup-look pickup-operations-section" id="repair" aria-labelledby="repair-title">
      <PickupLedger {...props} repairMode />
    </section>
  )
}
