/**
 * 食品自动登记 · 影子系统（2026-09-18）。
 *
 * 用户定案：eat 站先上「影子系统」——只有自动登记一个功能，UI 全新重写。
 * 点击「自动登记」后，算法每一步的进展实时上屏（阶段 / 进度 / 捕捉到的目标、
 * 拉到什么就更新什么）。结果写影子表，人工核验后再进正式台账。
 *
 * 结构：FoodSiteApp（eat 站根）持有 useFoodAuto（切到台账不打断运行），
 * 本组件只按视口选择两套独立实现之一（memory 23：双端拆分，互不共享 DOM）。
 */

import { useViewportKind } from '../../hooks/useViewportKind.js'
import FoodAutoShellDesktop from './FoodAutoShellDesktop.jsx'
import FoodAutoShellMobile from './FoodAutoShellMobile.jsx'

export default function FoodAutoApp({ auto, userName, storeName, onOpenLedger }) {
  const viewport = useViewportKind()
  const shared = { auto, userName, storeName, onOpenLedger }
  return viewport === 'mobile' ? <FoodAutoShellMobile {...shared} /> : <FoodAutoShellDesktop {...shared} />
}
