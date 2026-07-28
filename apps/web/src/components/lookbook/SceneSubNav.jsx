import IconArrowLeft from '@iconoir/ArrowLeft.mjs'
import IconFilter from '@iconoir/Filter.mjs'

/**
 * SceneSubNav - 统一二级导航组件
 * 
 * @param {Object} props
 * @param {Function} props.onBack - 返回首屏回调
 * @param {Array} props.tabs - Tab 配置 [{ id, label, count }]
 * @param {string} props.activeTab - 当前激活的 Tab ID
 * @param {Function} props.onTabChange - Tab 切换回调
 * @param {Function} [props.onFilter] - 可选：筛选按钮回调
 * @param {boolean} [props.showFilter=true] - 是否显示筛选按钮
 */
export default function SceneSubNav({
  onBack,
  tabs = [],
  activeTab,
  onTabChange,
  onFilter,
  showFilter = true
}) {
  return (
    <nav className="scene-subnav" data-workspace-priority="true" aria-label="场景导航">
      <button type="button" className="subnav-back" onClick={onBack} aria-label="返回首屏">
        <IconArrowLeft width={16} height={16} aria-hidden="true" />
        <span>首屏</span>
      </button>

      <div className="subnav-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            data-active={activeTab === tab.id ? 'true' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label} {tab.count !== undefined ? `(${tab.count})` : ''}
          </button>
        ))}
      </div>

      {showFilter && onFilter ? (
        <button type="button" className="subnav-filter" onClick={onFilter} aria-label="筛选">
          <IconFilter width={16} height={16} aria-hidden="true" />
          <span>筛选</span>
        </button>
      ) : null}
    </nav>
  )
}
