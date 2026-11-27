/* =========================================================
   charts.js - dependency-free SVG charts.
   Deliberately no chart library: the app must work offline
   from a phone with no network and no CDN reachable.
   Every chart returns an SVG string sized by viewBox so it
   scales to the card width without horizontal scrolling.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '0';
    return Math.round(n).toLocaleString('en-IN');
  }
  function color(i, segs) {
    var s = segs && segs[i];
    return (s && s.color) || PALETTE[i % PALETTE.length];
  }

  /* ---------------- Donut ---------------- */
  function donut(segments, opts) {
    opts = opts || {};
    var size = 180, cx = size / 2, cy = size / 2;
    var r = 68, thick = opts.thickness || 22;
    var total = segments.reduce(function (s, x) { return s + Math.max(0, x.value); }, 0);
    var circ = 2 * Math.PI * r;
    var out = '';
    out += '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(opts.ariaLabel || 'Donut chart') + '">';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--bg-sunken)" stroke-width="' + thick + '"/>';
    if (total > 0) {
      var offset = 0;
      segments.forEach(function (seg, i) {
        var v = Math.max(0, seg.value);
        if (v <= 0) return;
        var len = (v / total) * circ;
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"'
          + ' stroke="' + color(i, segments) + '" stroke-width="' + thick + '"'
          + ' stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) + '"'
          + ' stroke-dashoffset="' + (-offset).toFixed(2) + '"'
          + ' stroke-linecap="butt"'
          + ' transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(seg.label) + ': ' + fmt(v) + '</title></circle>';
        offset += len;
      });
    }
    if (opts.centerValue != null) {
      out += '<text class="donut-center-v" x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle">' + esc(opts.centerValue) + '</text>';
    }
    if (opts.centerLabel) {
      out += '<text class="donut-center-l" x="' + cx + '" y="' + (cy + 17) + '" text-anchor="middle">' + esc(opts.centerLabel) + '</text>';
    }
    out += '</svg>';
    return out;
  }

  /* ---------------- Legend ---------------- */
  function legend(segments, opts) {
    opts = opts || {};
    var total = segments.reduce(function (s, x) { return s + Math.max(0, x.value); }, 0);
    var out = '<div class="legend">';
    segments.forEach(function (seg, i) {
      var share = total ? (seg.value / total) * 100 : 0;
      out += '<div class="legend-item">'
        + '<span class="legend-dot" style="background:' + color(i, segments) + '"></span>'
        + '<span class="lg-name">' + esc(seg.label) + '</span>'
        + '<span class="lg-val">' + fmt(seg.value)
        + (opts.showPct === false ? '' : ' <span style="color:var(--ink-3);font-weight:500">(' + share.toFixed(1) + '%)</span>')
        + '</span></div>';
    });
    return out + '</div>';
  }

  /* ---------------- Horizontal bars ---------------- */
  function hbars(items, opts) {
    opts = opts || {};
    var rowH = 34, pad = 4;
    var w = 320, labelW = opts.labelWidth || 104;
    var h = items.length * rowH + pad * 2;
    var max = opts.max != null ? opts.max : Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    if (max <= 0) max = 1;
    var barW = w - labelW - 46;
    var out = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.ariaLabel || 'Bar chart') + '">';
    items.forEach(function (it, i) {
      var y = pad + i * rowH;
      var len = Math.max(it.value > 0 ? 2 : 0, (it.value / max) * barW);
      out += '<text class="axis-text" x="0" y="' + (y + 14) + '" style="font-size:10px;fill:var(--ink-2)">' + esc(truncate(it.label, 15)) + '</text>';
      out += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + barW + '" height="14" rx="7" fill="var(--bg-sunken)"/>';
      out += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + len.toFixed(1) + '" height="14" rx="7" fill="' + color(i, items) + '"><title>'
        + esc(it.label) + ': ' + fmt(it.value) + '</title></rect>';
      out += '<text class="axis-text" x="' + w + '" y="' + (y + 16) + '" text-anchor="end" style="font-size:10.5px;fill:var(--ink);font-weight:600">'
        + esc(it.valueLabel != null ? it.valueLabel : fmt(it.value)) + '</text>';
      if (it.sub) {
        out += '<text class="axis-text" x="0" y="' + (y + 26) + '" style="font-size:8.5px">' + esc(truncate(it.sub, 22)) + '</text>';
      }
    });
    out += '</svg>';
    return out;
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ---------------- Grouped vertical bars (compare) ---------------- */
  function groupedBars(groups, series, opts) {
    opts = opts || {};
    var w = 320, h = 170, left = 30, right = 8, top = 12, bottom = 28;
    var plotW = w - left - right, plotH = h - top - bottom;
    var max = opts.max;
    if (max == null) {
      max = 1;
      groups.forEach(function (g) { g.values.forEach(function (v) { if (v > max) max = v; }); });
    }
    max = niceMax(max);
    var out = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.ariaLabel || 'Comparison chart') + '">';
    // gridlines
    for (var g = 0; g <= 4; g++) {
      var gy = top + plotH - (plotH * g / 4);
      out += '<line class="grid-line" x1="' + left + '" y1="' + gy.toFixed(1) + '" x2="' + (w - right) + '" y2="' + gy.toFixed(1) + '"/>';
      out += '<text class="axis-text" x="' + (left - 4) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + shortNum(max * g / 4) + '</text>';
    }
    var groupW = plotW / groups.length;
    var nS = series.length;
    var barW = Math.min(22, (groupW - 10) / nS);
    groups.forEach(function (grp, gi) {
      var gx = left + gi * groupW;
      grp.values.forEach(function (v, si) {
        var bh = max ? (Math.max(0, v) / max) * plotH : 0;
        var bx = gx + (groupW - barW * nS) / 2 + si * barW;
        out += '<rect x="' + bx.toFixed(1) + '" y="' + (top + plotH - bh).toFixed(1) + '" width="' + (barW - 2).toFixed(1)
          + '" height="' + bh.toFixed(1) + '" rx="3" fill="' + (series[si].color || PALETTE[si % PALETTE.length]) + '"><title>'
          + esc(grp.label + ' · ' + series[si].label) + ': ' + fmt(v) + '</title></rect>';
      });
      out += '<text class="axis-text" x="' + (gx + groupW / 2).toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle">'
        + esc(truncate(grp.label, 10)) + '</text>';
    });
    out += '</svg>';
    return out;
  }

  /* ---------------- Line / trend ---------------- */
  function lineChart(points, opts) {
    opts = opts || {};
    var w = 320, h = 170, left = 32, right = 8, top = 12, bottom = 26;
    var plotW = w - left - right, plotH = h - top - bottom;
    var max = niceMax(opts.max != null ? opts.max : Math.max.apply(null, points.map(function (p) { return p.value; }).concat([1])));
    var out = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.ariaLabel || 'Trend chart') + '">';
    for (var g = 0; g <= 4; g++) {
      var gy = top + plotH - (plotH * g / 4);
      out += '<line class="grid-line" x1="' + left + '" y1="' + gy.toFixed(1) + '" x2="' + (w - right) + '" y2="' + gy.toFixed(1) + '"/>';
      out += '<text class="axis-text" x="' + (left - 4) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + shortNum(max * g / 4) + '</text>';
    }
    if (opts.reference != null && max > 0) {
      var ry = top + plotH - (Math.min(opts.reference, max) / max) * plotH;
      out += '<line x1="' + left + '" y1="' + ry.toFixed(1) + '" x2="' + (w - right) + '" y2="' + ry.toFixed(1)
        + '" stroke="var(--warn)" stroke-width="1.4" stroke-dasharray="5 4"/>';
      out += '<text class="axis-text" x="' + (w - right) + '" y="' + (ry - 4).toFixed(1) + '" text-anchor="end" style="fill:var(--warn);font-weight:600">'
        + esc(opts.referenceLabel || '') + '</text>';
    }
    var n = points.length;
    function px(i) { return n === 1 ? left + plotW / 2 : left + (plotW * i / (n - 1)); }
    function py(v) { return top + plotH - (max ? (Math.max(0, v) / max) * plotH : 0); }

    if (n > 0) {
      var path = '', area = '';
      points.forEach(function (p, i) {
        var X = px(i).toFixed(1), Y = py(p.value).toFixed(1);
        path += (i === 0 ? 'M' : 'L') + X + ' ' + Y + ' ';
      });
      area = path + 'L' + px(n - 1).toFixed(1) + ' ' + (top + plotH) + ' L' + px(0).toFixed(1) + ' ' + (top + plotH) + ' Z';
      out += '<path d="' + area + '" fill="var(--brand)" opacity="0.10"/>';
      out += '<path d="' + path.trim() + '" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      points.forEach(function (p, i) {
        out += '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(p.value).toFixed(1) + '" r="3.2" fill="var(--brand)" stroke="var(--bg-elev)" stroke-width="1.5"><title>'
          + esc(p.label) + ': ' + fmt(p.value) + '</title></circle>';
        var step = n > 6 ? Math.ceil(n / 5) : 1;
        if (i % step === 0 || i === n - 1) {
          out += '<text class="axis-text" x="' + px(i).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(p.label) + '</text>';
        }
      });
    }
    out += '</svg>';
    return out;
  }

  function niceMax(v) {
    if (!isFinite(v) || v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) {
      if (v <= steps[i] * mag) return steps[i] * mag;
    }
    return 10 * mag;
  }
  function shortNum(v) {
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  /* ---------------- Progress bar markup ---------------- */
  function progress(value, max, opts) {
    opts = opts || {};
    var p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    var out = '';
    if (opts.label || opts.valueLabel) {
      out += '<div class="progress-row"><span>' + esc(opts.label || '') + '</span><b>' + esc(opts.valueLabel || (p.toFixed(1) + '%')) + '</b></div>';
    }
    out += '<div class="progress ' + (opts.tone || '') + '" role="progressbar" aria-valuenow="' + p.toFixed(1)
      + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + p.toFixed(1) + '%"></span></div>';
    return out;
  }

  App.charts = {
    PALETTE: PALETTE,
    donut: donut, legend: legend, hbars: hbars, groupedBars: groupedBars,
    line: lineChart, progress: progress, fmt: fmt, esc: esc, niceMax: niceMax, truncate: truncate
  };
})(window);
