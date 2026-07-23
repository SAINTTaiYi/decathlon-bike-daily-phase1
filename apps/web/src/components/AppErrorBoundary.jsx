import React from 'react'
import SignalTaskState from './SignalTaskState.jsx'

export default class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Bike Ops UI error', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-state"><SignalTaskState tone="error" code="UI / FAILURE" title="日报界面暂时无法显示" description="已同步至数据库的记录不会被清除。请刷新页面重试。"><button type="button" className="primary-action" onClick={() => window.location.reload()}>重新加载</button></SignalTaskState></main>
  }
}
