import { useViewportKind } from '../../hooks/useViewportKind.js'
import EmergencyHandoverDesktop from './EmergencyHandoverDesktop.jsx'
import EmergencyHandoverMobile from './EmergencyHandoverMobile.jsx'

// 应急交接入口：运行时按视口择一挂载两套独立实现（项目铁律 memory 23）。
export default function EmergencyHandoverDialog(props) {
  const viewport = useViewportKind()
  if (!props.open) return null
  return viewport === 'mobile' ? <EmergencyHandoverMobile {...props} /> : <EmergencyHandoverDesktop {...props} />
}
