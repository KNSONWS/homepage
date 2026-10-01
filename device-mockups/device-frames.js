/*!
 * device-frames.js – skaliert den Inhalt der dm-Geräterahmen
 * (MacBook Pro 14" / iPhone 16 Pro, siehe device-frames.css)
 *
 * Jede .dm-canvas wird in fester Designgröße gesetzt (data-design-width /
 * data-design-height, z. B. 1512 x 893 im MacBook-Browser, 402 x 874 im
 * iPhone) und per transform: scale(k) in ihren Viewport eingepasst.
 * Ein gemeinsamer ResizeObserver hält alle Geräte der Seite aktuell.
 *
 *   DeviceFrames.init(root?)     neue Canvases in root anmelden (mehrfach aufrufbar)
 *   DeviceFrames.refresh(root?)  sofort neu messen
 *   DeviceFrames.destroy(root?)  Canvases in root abmelden
 *
 * Optional pro Canvas: data-fit="width" (Standard) | "contain" | "cover".
 * Ohne JS skaliert das CSS trotzdem nach Breite (tan(atan2())-Fallback).
 * Später eingefügte Geräte (SPA, React) werden automatisch erkannt.
 */
(function (global) {
  'use strict';
  if (!global || !global.document) return;            // SSR / kein DOM
  if (global.DeviceFrames && global.DeviceFrames.__dm) return; // doppelt geladen

  var doc = global.document;
  var CLASS = 'dm-canvas';
  var DEFAULTS = {
    'dm-macbook__viewport': [1512, 893],
    'dm-iphone__viewport': [402, 874]
  };

  var hosts = new Map();        // Viewport -> Set der Canvases
  var owner = new WeakMap();    // Canvas -> Viewport, bei dem sie angemeldet ist
  var ro = typeof global.ResizeObserver === 'function'
    ? new global.ResizeObserver(onResize)
    : null;

  function num(value, fallback) {
    var n = parseFloat(value);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function designSize(canvas) {
    var host = canvas.parentElement;
    var d = [1512, 893];
    if (host) {
      for (var cls in DEFAULTS) {
        if (host.classList.contains(cls)) { d = DEFAULTS[cls]; break; }
      }
    }
    return [
      num(canvas.getAttribute('data-design-width'), d[0]),
      num(canvas.getAttribute('data-design-height'), d[1])
    ];
  }

  function fit(canvas, w, h) {
    var host = canvas.parentElement;
    if (!host) return;
    if (w == null) {
      // Bruchteil-genaue Layoutgröße (clientWidth rundet und lässt eine Naht)
      var cs = global.getComputedStyle(host);
      w = parseFloat(cs.width);
      h = parseFloat(cs.height);
      if (!isFinite(w)) { w = host.clientWidth; h = host.clientHeight; }
    }
    if (!w) return;                                     // noch nicht sichtbar
    var size = designSize(canvas);
    var mode = canvas.getAttribute('data-fit') || 'width';
    var k = w / size[0];
    if (h && mode === 'contain') k = Math.min(k, h / size[1]);
    else if (h && mode === 'cover') k = Math.max(k, h / size[1]);
    var s = canvas.style;
    s.setProperty('--dm-dw', String(size[0]));
    s.setProperty('--dm-dh', String(size[1]));
    s.setProperty('--dm-k', String(Math.round(k * 1e6) / 1e6));
  }

  function onResize(entries) {
    for (var i = 0; i < entries.length; i++) {
      var host = entries[i].target;
      var set = hosts.get(host);
      if (!set) continue;
      var box = entries[i].contentRect;
      set.forEach(function (c) {
        if (c.parentElement === host) fit(c, box.width, box.height);
      });
    }
  }

  function canvasesIn(root) {
    root = root || doc;
    var list = [];
    if (root.nodeType === 1 && root.classList.contains(CLASS)) list.push(root);
    if (root.getElementsByClassName) {
      var found = root.getElementsByClassName(CLASS);
      for (var i = 0; i < found.length; i++) list.push(found[i]);
    }
    return list;
  }

  function unregister(c) {
    var host = owner.get(c);
    if (!host) return;
    owner.delete(c);
    var set = hosts.get(host);
    if (set && set.delete(c) && !set.size) {
      hosts.delete(host);
      if (ro) ro.unobserve(host);
    }
  }

  // true, wenn die Canvas neu angemeldet wurde
  function register(c) {
    var host = c.parentElement;
    if (!host) return false;
    var old = owner.get(c);
    if (old === host) return false;
    if (old) unregister(c);
    owner.set(c, host);
    var set = hosts.get(host);
    if (!set) {
      set = new Set();
      hosts.set(host, set);
      if (ro) ro.observe(host);
    }
    set.add(c);
    return true;
  }

  // Nur neue Canvases messen; bekannte hält der ResizeObserver aktuell.
  function init(root) {
    var list = canvasesIn(root);
    for (var i = 0; i < list.length; i++) {
      if (register(list[i])) fit(list[i]);
    }
    return list.length;
  }

  function refresh(root) {
    var list = canvasesIn(root);
    for (var i = 0; i < list.length; i++) fit(list[i]);
  }

  function destroy(root) {
    var list = canvasesIn(root);
    for (var i = 0; i < list.length; i++) unregister(list[i]);
  }

  // Entfernte Canvases abmelden, damit keine gelösten Knoten festgehalten werden
  function prune() {
    hosts.forEach(function (set, host) {
      set.forEach(function (c) {
        if (!c.isConnected || c.parentElement !== host) unregister(c);
      });
    });
  }

  // Ohne ResizeObserver: auf Fenstergröße reagieren
  if (!ro) global.addEventListener('resize', function () { refresh(); });

  // Später eingefügte Geräte erkennen (SPA / React)
  function watch() {
    if (typeof global.MutationObserver !== 'function' || !doc.body) return;
    var added = [];
    var removed = false;
    var queued = false;
    var later = global.requestAnimationFrame
      ? function (f) { global.requestAnimationFrame(f); }
      : function (f) { setTimeout(f, 16); };

    function flush() {
      queued = false;
      if (removed) { removed = false; prune(); }
      var nodes = added;
      added = [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].isConnected) init(nodes[i]);
      }
    }

    new global.MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          // nur Teilbäume, die überhaupt eine Canvas enthalten
          if (n.nodeType === 1 && (n.classList.contains(CLASS) || n.getElementsByClassName(CLASS).length)) {
            added.push(n);
          }
        }
        if (r.removedNodes.length && hosts.size) removed = true;
      }
      if (!queued && (added.length || removed)) {
        queued = true;
        later(flush);
      }
    }).observe(doc.body, { childList: true, subtree: true });
  }

  function boot() { init(doc); watch(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Layout kann sich nach dem Laden noch setzen (Schriften, Bilder)
  global.addEventListener('load', function () { refresh(); });

  global.DeviceFrames = { init: init, refresh: refresh, destroy: destroy, fit: fit, __dm: true };
})(typeof window !== 'undefined' ? window : undefined);
