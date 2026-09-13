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
export default function FoodApp({ enabled, userName, storeName, role, onExit, onNotify }) {
  const viewport = useViewportKind()
  const ledger = useFoodLedger(enabled)
  const [view, setView] = useState('todo')

  const shared = { ledger, view, onViewChange: setView, userName, storeName, role, onExit, onNotify }
  return viewport === 'mobile' ? <FoodShellMobile {...shared} /> : <FoodShellDesktop {...shared} />
}
