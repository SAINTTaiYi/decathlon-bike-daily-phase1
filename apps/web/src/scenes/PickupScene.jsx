import PickupLedger from '../components/pickup/PickupLedger.jsx'

export default function PickupScene(props) {
  return (
    <section className="look-section pickup-look pickup-operations-section" id="pickup" aria-labelledby="pickup-title">
      <PickupLedger {...props} />
    </section>
  )
}
