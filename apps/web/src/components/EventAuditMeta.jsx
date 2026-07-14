import { resolveAuditActor } from '../data/userSession.js'

export default function EventAuditMeta({ event }) {
  const actorName = resolveAuditActor(event?.actorName)
  return <span className="event-actor">USER · {actorName}</span>
}
