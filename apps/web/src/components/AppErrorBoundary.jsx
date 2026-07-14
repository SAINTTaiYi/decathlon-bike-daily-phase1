import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Bike Ops UI error', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-state" role="alert"><strong>日报界面暂时无法显示</strong><p>已同步至数据库的记录不会被清除。请刷新页面重试。</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></main>
  }
}
