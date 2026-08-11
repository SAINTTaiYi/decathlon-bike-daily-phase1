import PickupLedger from '../components/pickup/PickupLedger.jsx'

export default function OpeningScene(props) {
  return (
    <section className="look-section pickup-look pickup-operations-section" id="poster" aria-labelledby="poster-title">
      <PickupLedger {...props} handoverMode />
    </section>
  )
}
