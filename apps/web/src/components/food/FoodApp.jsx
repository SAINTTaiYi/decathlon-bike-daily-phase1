import { useState } from 'react'
import { useViewportKind } from '../../hooks/useViewportKind.js'
import { useFoodLedger } from '../../hooks/useFoodLedger.js'
import FoodShellDesktop from './FoodShellDesktop.jsx'
import FoodShellMobile from './FoodShellMobile.jsx'

/**
 * 食品台账应用壳（2026-09-13）。
 *
 * 与 ops 六模块并列的第二套应用：共享登录态与门店，但导航、数据、样式的
 * 所有权都在自己这边（不是 ops 的第 7 个模块）。数据层在 useFoodLedger，
 * 视图层按项目规则拆成移动与桌面两套独立实现。
 */
export default function FoodApp({ enabled, userName, storeName, role, onExit, exitLabel = '返回应用选择', onNotify, onOpenAuto }) {
  const viewport = useViewportKind()
  const ledger = useFoodLedger(enabled)
  // 默认落在「批次」：台账最常见的用途是看刚登记了什么。
  const [view, setView] = useState('batches')

  const shared = { ledger, view, onViewChange: setView, userName, storeName, role, onExit, exitLabel, onNotify, onOpenAuto }
  return viewport === 'mobile' ? <FoodShellMobile {...shared} /> : <FoodShellDesktop {...shared} />
}
