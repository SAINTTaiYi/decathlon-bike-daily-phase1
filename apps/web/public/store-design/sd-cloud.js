/* ==========================================================================
   门店设计 · 云端图纸（2026-09-17）
   --------------------------------------------------------------------------
   需求（用户）：改完设计点保存 → 存到云端，其他同事下次打开也能继续改。
   此前图纸只存在浏览器 localStorage（本机），换人 / 换设备就看不到。

   与宿主的约定：
     · 接口是 /api/v1/design（同源）。服务端按**会话所属门店**读写，
       本文件不传、也传不了门店标识 —— 每个门店只可能拿到自己那份图纸。
     · 令牌：/api/v1/auth/me 拿 csrfToken（写操作要带 x-csrf-token）。
       令牌被别处轮换掉时（打开第二个标签、从 Ops 跳过来），自动补一次再重放。
     · 未登录（401）时进入「仅本机」模式：保存按钮禁用，状态写明原因，
       工具本身照常可用（与接入云端之前的行为一致）。

   状态：ready / dirty / conflict / conflictName / revision / savedAt / savedBy。
   一处状态、多个视图（桌面顶栏 / 移动端「方案与导出」抽屉）都读它。
   ========================================================================== */
(function () {
  'use strict'
  var API = '/api/v1/design'
  var ME = '/api/v1/auth/me'
  var state = {
    attached: false, offline: false, loading: true, busy: false,
    dirty: false, conflict: false, conflictName: '', revision: 0,
    savedAt: '', savedBy: '', message: '', savedJson: null
  }
  var api = null

  function all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)) }

  function pad(value) { return (value < 10 ? '0' : '') + value }

  function stamp(iso) {
    if (!iso) return ''
    var date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }

  function statusText() {
    if (state.offline) return '未登录 · 图纸仅存本机'
    if (state.loading) return '正在读取云端…'
    if (state.busy) return '正在保存…'
    if (state.message) return state.message
    if (state.conflict) return '云端已被 ' + (state.conflictName || '其他同事') + ' 更新 · 需先载入'
    if (state.dirty) return state.savedAt ? '有未保存的改动（云端 ' + stamp(state.savedAt) + '）' : '有未保存的改动'
    if (!state.savedAt) return '云端暂无图纸 · 保存后门店同事可见'
    return '已保存 · ' + stamp(state.savedAt) + (state.savedBy ? ' · ' + state.savedBy : '')
  }

  function tone() {
    if (state.offline) return 'muted'
    if (state.conflict || state.message) return 'warn'
    if (state.busy || state.loading) return 'busy'
    if (state.dirty) return 'warn'
    return 'ok'
  }

  function paint() {
    var text = statusText()
    all('[data-cloud="status"]').forEach(function (node) {
      node.textContent = text
      node.setAttribute('data-tone', tone())
    })
    all('[data-cloud="save"]').forEach(function (node) {
      node.disabled = !state.attached || state.offline || state.busy
      node.setAttribute('data-dirty', state.dirty ? 'true' : 'false')
      node.setAttribute('title', text)
    })
    all('[data-cloud="load"]').forEach(function (node) {
      node.disabled = !state.attached || state.offline || state.busy
      node.setAttribute('data-active', state.conflict ? 'true' : 'false')
    })
  }

  function problem(response, payload) {
    if (payload && payload.message) return payload.message
    if (response.status === 401) return '登录状态已失效，请刷新页面后重试'
    if (response.status === 403) return '安全令牌已失效，请刷新页面后重试'
    if (response.status === 503) return '数据库暂时无法写入，请稍后重试'
    return '请求失败（HTTP ' + response.status + '）'
  }

  // 读一份 JSON；403 INVALID_CSRF 时补票重放一次（会话令牌是每会话一份，别处刷新过就作废）。
  async function call(path, options, retried) {
    var headers = Object.assign({}, (options && options.headers) || {})
    if (options && options.method === 'PUT') headers['content-type'] = 'application/json'
    if (state.csrf && options && options.method === 'PUT') headers['x-csrf-token'] = state.csrf
    var response = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}, { headers: headers }))
    var payload = null
    try { payload = await response.json() } catch (error) { payload = null }
    if (response.status === 403 && payload && payload.error === 'INVALID_CSRF' && !retried) {
      var me = await refreshIdentity()
      if (me) return call(path, options, true)
    }
    return { response: response, payload: payload }
  }

  async function refreshIdentity() {
    try {
      var result = await call(ME, { method: 'GET' }, true)
      if (!result.response.ok || !result.payload) return null
      state.csrf = result.payload.csrfToken || ''
      state.userName = (result.payload.user && result.payload.user.displayName) || ''
      state.offline = false
      return result.payload
    } catch (error) {
      return null
    }
  }

  function applyCloud(payload, meta) {
    if (api && typeof api.setCfg === 'function') api.setCfg(payload)
    state.revision = meta.revision
    state.savedAt = meta.updatedAt || ''
    state.savedBy = meta.updatedByName || ''
    state.conflict = false
    state.conflictName = ''
    state.message = ''
    state.dirty = false
    state.savedJson = JSON.stringify((api && api.getCfg && api.getCfg()) || payload)
  }

  async function load(options) {
    if (!state.attached || state.offline) return
    if (state.dirty && !(options && options.force)) {
      if (!window.confirm('载入云端图纸会覆盖当前未保存的改动，继续？')) return
    }
    state.loading = true
    paint()
    var result = await call(API, { method: 'GET' }, false)
    state.loading = false
    if (!result.response.ok) {
      if (result.response.status === 401) { state.offline = true }
      else state.message = problem(result.response, result.payload)
      paint()
      return
    }
    var design = result.payload && result.payload.design
    if (!design) {
      state.revision = 0
      state.savedAt = ''
      state.savedBy = ''
      state.dirty = false
      state.savedJson = JSON.stringify(api.getCfg())
      paint()
      return
    }
    applyCloud(design.payload, design)
    paint()
    if (options && options.silent) return
    if (options && options.announce) {
      api.toast('已载入云端图纸（' + (design.updatedByName || '门店同事') + ' · ' + stamp(design.updatedAt) + '）')
    }
  }

  async function save() {
    if (!state.attached || state.offline) { if (api) api.toast('未登录：图纸只存在本机'); return }
    if (state.busy) return
    state.busy = true
    state.message = ''
    paint()
    var payload = api.getCfg()
    var result = await call(API, { method: 'PUT', body: JSON.stringify({ expectedRevision: state.revision, payload: payload }) }, false)
    state.busy = false
    if (result.response.ok) {
      var meta = (result.payload && result.payload.design) || {}
      state.revision = meta.revision || state.revision + 1
      state.savedAt = meta.updatedAt || new Date().toISOString()
      state.savedBy = meta.updatedByName || ''
      state.savedJson = JSON.stringify(payload)
      state.dirty = false
      state.conflict = false
      api.toast('已保存到云端（其他同事可以继续修改）')
      paint()
      return
    }
    if (result.response.status === 409) {
      var conflict = (result.payload && result.payload.design) || {}
      state.conflict = true
      state.conflictName = conflict.updatedByName || ''
      state.message = ''
      api.toast('云端已被 ' + (state.conflictName || '其他同事') + ' 更新，请点「载入云端」后再改')
      paint()
      return
    }
    if (result.response.status === 401) state.offline = true
    state.message = problem(result.response, result.payload)
    api.toast('保存失败：' + state.message)
    paint()
  }

  // app.js 每次落本机存档时都会调一次 —— 用来判断「有未保存的改动」。
  function markDirty() {
    if (!state.attached || state.offline) return
    var current = JSON.stringify(api.getCfg())
    var dirty = current !== state.savedJson
    if (dirty !== state.dirty) {
      state.dirty = dirty
      if (dirty && state.conflict) { /* 冲突态保持到载入为止 */ }
      paint()
    }
  }

  window.SDCloud = {
    /** 由 app.js 在界面就绪后接入：给到读写配置与提示的三个钩子。 */
    attach: function (hooks) {
      api = hooks
      state.attached = true
      paint()
      load({ silent: true, announce: false })
      var identity = refreshIdentity
      if (identity) { /* 身份在第一次请求时按需获取 */ }
    },
    markDirty: markDirty,
    load: function () { load({ announce: true }) },
    save: save,
    state: function () { return state }
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-cloud]') : null
    if (!button) return
    var action = button.getAttribute('data-cloud')
    if (action === 'save') { event.preventDefault(); save(); return }
    if (action === 'load') { event.preventDefault(); load({ announce: true }) }
  })
  window.addEventListener('beforeunload', function (event) {
    if (!state.dirty || state.offline) return
    event.preventDefault()
    event.returnValue = ''
  })
})()
