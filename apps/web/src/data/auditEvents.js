export function currentBusinessDayEvents(events = [], businessDate = '') {
  return events.filter((event) => event.dateKey === businessDate)
}

export function auditEventBelongsToScene(event, scene) {
  return [event?.scene, event?.previousScene, event?.nextScene].includes(scene)
}
