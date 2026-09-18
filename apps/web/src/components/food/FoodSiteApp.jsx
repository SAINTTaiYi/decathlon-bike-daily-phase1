import { useState } from 'react'
import FoodApp from './FoodApp.jsx'
import FoodAutoApp from './FoodAutoApp.jsx'
import { useFoodAuto } from '../../hooks/useFoodAuto.js'

/**
 * eat 站根组件（2026-09-18）：食品自动登记影子系统 + 台账双视图。
 *
 * 用户定案：「先上食品登记的影子系统——只有自动登记一个功能，UI 重写」。
 * 影子系统是本站的默认视图；台账入口收敛成页头一个小链接（影子运行中切过去
 * 不会打断算法——useFoodAuto 状态挂在这一层，切视图不卸载）。
 */
export default function FoodSiteApp({ enabled, userName, storeName, role, onExit, exitLabel, onNotify }) {
  const [mode, setMode] = useState('auto')
  const auto = useFoodAuto()

  if (mode === 'ledger') {
    return (
      <FoodApp
        enabled={enabled}
        userName={userName}
        storeName={storeName}
        role={role}
        onExit={onExit}
        exitLabel={exitLabel}
        onNotify={onNotify}
        onOpenAuto={() => setMode('auto')}
      />
    )
  }

  return <FoodAutoApp auto={auto} userName={userName} storeName={storeName} onOpenLedger={() => setMode('ledger')} />
}
