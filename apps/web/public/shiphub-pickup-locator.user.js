// ==UserScript==
// @name         Shiphub 自提定位器
// @namespace    workshop.skin
// @version      0.2.1
// @description  ①在 Shiphub「待交接」页自动定位并展开指定订单卡片，人工输入取件码完成核销（只读）；②登录后自动回到待交接页继续定位；③在 Workshop 页面注入安装标记供检测。不发起任何写请求。
// @match        https://shiphub-asia-cn.decathlon.com.cn/*
// @match        https://workshop.skin/*
// @match        https://bike-ops-preview.geeklightonefish.workers.dev/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var IS_SHIPHUB = /shiphub-asia-cn\.decathlon\.com\.cn/.test(location.hostname);
  var HASH_PREFIX = 'pickup=';
  var PENDING_KEY = 'shiphub_pending_pickup';
  var MAX_WAIT_MS = 30000;
  var POLL_MS = 500;
  var SEARCH_WAIT_MS = 4000;
  var FLASH_TIMES = 3;

  // ---------- 安装标记（Workshop 域） ----------
  if (!IS_SHIPHUB) {
    try {
      window.__shiphubLocatorInstalled = { installed: true, version: '0.2.1' };
      // DOM 属性在任意执行世界（主世界/隔离沙箱）都可见，兼容所有脚本管理器
      document.documentElement.setAttribute('data-shiphub-locator', '0.2.1');
    } catch (e) {}
    return; // Workshop 域只做标记，不执行定位
  }

  // ---------- Shiphub 域：立即把 hash 目标落盘（登录跳转会丢 hash） ----------
  (function persistTarget() {
    try {
      var m = location.hash.match(new RegExp(HASH_PREFIX + '([A-Za-z0-9_-]+)'));
      if (m) sessionStorage.setItem(PENDING_KEY, decodeURIComponent(m[1]));
    } catch (e) {}
  })();

  // ---------- 工具 ----------
  function pendingTarget() {
    try { return sessionStorage.getItem(PENDING_KEY); } catch (e) { return null; }
  }
  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
  }
  function waitFor(fn, timeoutMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      var timer = setInterval(function () {
        var v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) { clearInterval(timer); resolve(v); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(null); }
      }, POLL_MS);
    });
  }
  function setReactValue(el, value) {
    var proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function searchInput() { return document.querySelector('input[type="search"]'); }
  function searchButton() {
    var inputs = document.querySelectorAll('input[type="search"]');
    for (var i = 0; i < inputs.length; i++) {
      var node = inputs[i];
      for (var d = 0; d < 5 && node; d++) {
        node = node.parentElement;
        if (!node) break;
        var btns = node.querySelectorAll('button');
        for (var j = 0; j < btns.length; j++) {
          if (/^Search$/i.test((btns[j].textContent || '').trim())) return btns[j];
        }
      }
    }
    return null;
  }
  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll('.MuiExpansionPanel-root, div[class*="ExpansionPanel-root"], div[class*="expansionPanel"]'))
      .filter(function (el) { return el.textContent.indexOf('Order id:') !== -1; });
  }
  function findCard(orderId) {
    return cards().find(function (el) {
      return el.textContent.indexOf('Order id: ' + orderId) !== -1 || new RegExp('Order id:\\s*' + orderId).test(el.textContent);
    });
  }
  function isEmptyState() {
    return Array.prototype.slice.call(document.querySelectorAll('h3')).some(function (h) { return (h.textContent || '').trim() === 'No Data'; });
  }
  function isLoading() {
    return Array.prototype.slice.call(document.querySelectorAll('h4')).some(function (h) { return /Loading data/i.test(h.textContent); });
  }
  function nextButton() {
    var sel = document.querySelector('select[id="page-native-simple"]');
    var node = sel;
    for (var d = 0; d < 6 && node; d++) {
      node = node.parentElement;
      if (!node) continue;
      var btns = node.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].textContent || '';
        if (t.indexOf('Next') !== -1 && !btns[i].disabled) return btns[i];
      }
    }
    return null;
  }
  function expandCard(cardEl) {
    return new Promise(function (resolve) {
      if (cardEl.getAttribute('aria-expanded') === 'true') { resolve(); return; }
      var summary = cardEl.querySelector('[role="button"]') || cardEl.querySelector('.MuiExpansionPanelSummary-root');
      if (!summary) { resolve(); return; }
      summary.click();
      waitFor(function () {
        return cardEl.querySelector('.MuiExpansionPanelDetails, div[class*="ExpansionPanelDetails"]') &&
          cardEl.textContent.indexOf('顾客取货') !== -1;
      }, 6000).then(function () { resolve(); });
    });
  }
  function flash(cardEl) {
    cardEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var k = 0;
    var timer = setInterval(function () {
      cardEl.style.outline = (k % 2 === 0) ? '4px solid #ff9800' : '4px solid transparent';
      cardEl.style.outlineOffset = '3px';
      k++;
      if (k >= FLASH_TIMES * 2) { clearInterval(timer); cardEl.style.outline = ''; }
    }, 500);
  }
  function showHint(msg, sticky) {
    var id = 'shiphub-locator-hint';
    var old = document.getElementById(id);
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;' +
      'background:#fff8e1;color:#5d4037;border:2px solid #ff9800;border-radius:10px;' +
      'padding:12px 18px;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.25);' +
      'max-width:92%;text-align:center;';
    div.textContent = msg;
    document.body.appendChild(div);
    if (!sticky) setTimeout(function () { div.remove(); }, 20000);
    div.addEventListener('click', function () { div.remove(); });
    return div;
  }
  function goToHandover() {
    try {
      history.pushState({}, '', '/to_handover');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return true;
    } catch (e) {
      try { location.href = '/to_handover'; return true; } catch (e2) { return false; }
    }
  }

  // ---------- 定位主流程 ----------
  async function locate(orderId) {
    var input = await waitFor(function () { return searchInput(); }, MAX_WAIT_MS);
    if (!input) {
      showHint('等待页面超时：没有找到待交接页搜索框。若刚完成登录，请稍候；或确认当前在 Shiphub「待交接」页面。', true);
      return false;
    }
    await waitFor(function () { return cards().length > 0 || isEmptyState(); }, 15000);

    var existing = findCard(orderId);
    if (existing) {
      await expandCard(existing); flash(existing);
      showHint('已定位并展开该订单 —— 请人工点击「顾客取货」，输入顾客取件码完成核销。');
      return true;
    }

    try {
      var sel = document.querySelector('select[id="st"], select[name="search_type"], select');
      if (sel && sel.value !== 'orderId') setReactValue(sel, 'orderId');
    } catch (e) {}
    setReactValue(input, orderId);
    var btn = searchButton();
    if (btn) btn.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));

    var found = await waitFor(function () {
      var c = findCard(orderId);
      if (c) return c;
      if (isEmptyState() || (cards().length === 0 && !isLoading())) return 'EMPTY';
      return null;
    }, SEARCH_WAIT_MS);

    if (found && found !== 'EMPTY') {
      await expandCard(found); flash(found);
      showHint('已定位并展开该订单 —— 请人工点击「顾客取货」，输入顾客取件码完成核销。');
      return true;
    }

    // 搜索无结果：清空搜索 → 翻页查找
    try { setReactValue(input, ''); btn && btn.click(); } catch (e) {}
    var guard = 0;
    while (guard++ < 60) {
      await waitFor(function () { return cards().length > 0 || isEmptyState(); }, 8000);
      var c = findCard(orderId);
      if (c) {
        await expandCard(c); flash(c);
        showHint('已定位并展开该订单 —— 请人工点击「顾客取货」，输入顾客取件码完成核销。');
        return true;
      }
      var nb = nextButton();
      if (!nb) break;
      nb.click();
      await new Promise(function (r) { setTimeout(r, 2500); });
    }
    showHint('未在待交接列表找到该订单（可能已完成核销或状态已变化）。', true);
    return false;
  }

  // ---------- 入口 ----------
  function boot() {
    var orderId = pendingTarget();
    if (!orderId) return;
    var tryCount = 0;
    var timer = setInterval(function () {
      tryCount++;
      // 已在待交接页 → 执行定位（只跑一次）
      if (location.pathname.indexOf('/to_handover') === 0) {
        clearInterval(timer);
        locate(orderId).then(function (ok) { if (ok) clearPending(); });
        return;
      }
      // 非待交接页（登录完成落在首页/根路径）→ 导航过去；登录页由官方跳转处理，回来后本流程重新进入
      if (tryCount <= 5) {
        goToHandover();
      } else if (tryCount === 6) {
        showHint('正在进入 Shiphub「待交接」页面并定位订单…请稍候。', false);
      }
      if (tryCount > 40) clearInterval(timer); // 最长约 20s 兜底
    }, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); });
  } else {
    boot();
  }
})();
