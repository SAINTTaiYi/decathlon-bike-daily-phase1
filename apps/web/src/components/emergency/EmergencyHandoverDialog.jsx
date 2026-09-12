import { useViewportKind } from '../../hooks/useViewportKind.js'
import EmergencyHandoverDesktop from './EmergencyHandoverDesktop.jsx'
import EmergencyHandoverMobile from './EmergencyHandoverMobile.jsx'

// 应急交接入口：运行时按视口择一挂载两套独立实现（项目铁律 memory 23）。
// 注意保持挂载（不因 open=false 提前 return）：AppDialog 的退场动画依赖组件仍在树上。
export default function EmergencyHandoverDialog(props) {
  const viewport = useViewportKind()
  return viewport === 'mobile' ? <EmergencyHandoverMobile {...props} /> : <EmergencyHandoverDesktop {...props} />
}
