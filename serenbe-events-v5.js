/* Serenbe Events v5
 * Fixes: weekly/daily recurring cards now time-sort correctly on the same day.
 * Notes:
 * - Requires Finsweet Attributes CMS Load to be on the page (cmsload.js).
 * - Does NOT modify your visible date text; it computes an internal sort key instead.
 * - Add ?debug=1 to the page URL for on-page pills + console table.
 */

(function () {
  "use strict";

  // -----------------------------
  // Config: selectors in your DOM
  // -----------------------------
  var WRAPPER_SEL = "#sliderParentEvents";
  var ITEM_SEL = ".w-dyn-item";
  var RECURRING_FORMULA_SEL = '[date-recurring="formula"]';
  var START_DATE_SEL = '[cms-item="start-date"]';
  var END_DATE_SEL = '[data-recurring="end-date"], [cms-item="end-date"]';
  var TIME_TEXT_SELECTORS = [
    '[cms-item="start-time"]',
    '[cms-item="time"]',
    '[data-time="start"]',
    '[cms-item="hours"]',
    '[data-hours="start"]'
  ];
  var RAW_DATE_SELECTORS = [
    START_DATE_SEL,
    '[data-date="start"]',
    'time[cms-item="start-date"]',
    'time',
    'meta[itemprop="startDate"]'
  ];
  var RAW_DT_ATTRS = [
    "datetime",
    "data-datetime",
    "data-start",
    "data-start-dt",
    "data-iso",
    "data-wf-date",
    "content",
    "title",
    "aria-label"
  ];

  // -------------
  // Small helpers
  // -------------
  function $all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function $(sel) { return document.querySelector(sel); }
  function txt(root, sel) {
    var el = root.querySelector(sel);
    return el ? String(el.textContent || "").trim() : "";
  }
  function firstText(root, sels) {
    for (var i = 0; i < sels.length; i++) {
      var t = txt(root, sels[i]);
      if (t) return t;
    }
    return "";
  }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function toLocalIsoKey(date) {
    if (isNaN(date)) return "";
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate()) +
           "T" + p(date.getHours()) + ":" + p(date.getMinutes());
  }
  function keyToTs(key) {
    var m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return NaN;
    return +new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10)
    );
  }

  // ----------------------
  // Parsing of date & time
  // ----------------------
  function parseDateFlexible(s) {
    if (!s) return new Date(NaN);
    s = String(s).trim();

    // MM/DD/YYYY [HH[:MM]] [AM|PM]
    var mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (mdy) {
      var mm = parseInt(mdy[1], 10);
      var dd = parseInt(mdy[2], 10);
      var yyyy = parseInt(mdy[3], 10);
      var hh = mdy[4] != null ? parseInt(mdy[4], 10) : 0;
      var min = mdy[5] != null ? parseInt(mdy[5], 10) : 0;
      var ap = mdy[6] ? mdy[6].toUpperCase() : "";
      if (ap === "PM" && hh !== 12) hh += 12;
      if (ap === "AM" && hh === 12) hh = 0;
      return new Date(yyyy, mm - 1, dd, hh, min);
    }

    // ISO YYYY-MM-DD or YYYY-MM-DDTHH:MM
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2}))?)?$/);
    if (iso) {
      return new Date(
        parseInt(iso[1], 10),
        parseInt(iso[2], 10) - 1,
        parseInt(iso[3], 10),
        iso[4] != null ? parseInt(iso[4], 10) : 0,
        iso[5] != null ? parseInt(iso[5], 10) : 0
      );
    }

    // Natural strings like "December 7, 2024 1:30 PM"
    return new Date(s);
  }

  // Extract {h,m} from "9:30 AM", "10am", "9a - 1p", "14:00"
  function parseTimeFromString(s) {
    if (!s) return null;
    s = String(s).toLowerCase();

    // For ranges take first time "9:30 am - 10:30 am"
    var firstPart = s.split(/-|–|—/)[0];

    var m = firstPart.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (m) {
      var h1 = parseInt(m[1], 10);
      var mi1 = parseInt(m[2], 10);
      var ap1 = m[3].toUpperCase();
      if (ap1 === "PM" && h1 !== 12) h1 += 12;
      if (ap1 === "AM" && h1 === 12) h1 = 0;
      return { h: h1, m: mi1 };
    }

    m = firstPart.match(/\b(\d{1,2})\s*(am|pm|a|p)\b/);
    if (m) {
      var h2 = parseInt(m[1], 10);
      var ap2 = m[2].toLowerCase();
      if ((ap2 === "pm" || ap2 === "p") && h2 !== 12) h2 += 12;
      if ((ap2 === "am" || ap2 === "a") && h2 === 12) h2 = 0;
      return { h: h2, m: 0 };
    }

    m = firstPart.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m) return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };

    return null;
  }

  // Try hard to find the start Date with time from the DOM
  function extractStartDateTime(el) {
    // Read raw attrs like datetime="2024-12-07T09:00"
    for (var i = 0; i < RAW_DATE_SELECTORS.length; i++) {
      var nodes = el.querySelectorAll(RAW_DATE_SELECTORS[i]);
      if (!nodes.length) continue;
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        for (var k = 0; k < RAW_DT_ATTRS.length; k++) {
          var a = RAW_DT_ATTRS[k];
          var v = n.getAttribute && n.getAttribute(a);
          if (v && /\d{4}-\d{2}-\d{2}/.test(v)) {
            var d = parseDateFlexible(v);
            if (!isNaN(d)) return d;
          }
        }
      }
    }

    // Combine visible date + visible time
    var dateText = txt(el, START_DATE_SEL) || txt(el, '[data-date="start"]') || "";
    var timeText = firstText(el, TIME_TEXT_SELECTORS);
    if (dateText && timeText) {
      var d2 = parseDateFlexible(dateText + " " + timeText);
      if (!isNaN(d2)) return d2;
    }

    // If dateText already had time
    if (dateText) {
      var d3 = parseDateFlexible(dateText);
      if (!isNaN(d3)) return d3;
    }

    return new Date(NaN);
  }

  function getStartTimeHM(el) {
    // explicit time fields
    var t1 = parseTimeFromString(firstText(el, TIME_TEXT_SELECTORS));
    if (t1) return t1;

    // attributes on date node
    for (var i = 0; i < RAW_DATE_SELECTORS.length; i++) {
      var nodes = el.querySelectorAll(RAW_DATE_SELECTORS[i]);
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        for (var k = 0; k < RAW_DT_ATTRS.length; k++) {
          var a = RAW_DT_ATTRS[k];
          var v = n.getAttribute && n.getAttribute(a);
          if (v && /\d{2}:\d{2}/.test(v)) {
            var d = parseDateFlexible(v);
            if (!isNaN(d)) return { h: d.getHours(), m: d.getMinutes() };
          }
        }
        var t = parseTimeFromString(String(n.textContent || ""));
        if (t) return t;
      }
    }

    // fallback midnight
    return { h: 0, m: 0 };
  }

  // -----------------------
  // Recurring rule handling
  // -----------------------
  function parseRule(raw) {
    var s = String(raw || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!s) return { type: null };

    if (s.indexOf("daily") > -1) return { type: "daily" };

    if (s.indexOf("weekly") > -1 || s.indexOf("every week") > -1 || s.indexOf("every ") === 0) {
      var days = [];
      var short = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      var matches = s.match(/sun(day)?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?/g) || [];
      for (var i = 0; i < matches.length; i++) {
        var name = matches[i].slice(0, 3).toLowerCase();
        var idx = short.indexOf(name);
        if (idx >= 0) days.push(idx);
      }
      return { type: "weekly", days: days.length ? Array.from(new Set(days)) : [0,1,2,3,4,5,6] };
    }

    if (s.indexOf("monthly") > -1) {
      var nums = (s.match(/(\d{1,2})(?:st|nd|rd|th)?/g) || [])
        .map(function (n) { return parseInt(n, 10); })
        .filter(function (n) { return !isNaN(n) && n >= 1 && n <= 31; });
      return { type: "monthly", doms: nums.length ? Array.from(new Set(nums)).sort(function(a,b){return a-b;}) : [1] };
    }

    return { type: null };
  }

  function nextOccurrence(rule, minDate, startDateLimit) {
    var base = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    var limit = startDateLimit && !isNaN(startDateLimit)
      ? new Date(startDateLimit.getFullYear(), startDateLimit.getMonth(), startDateLimit.getDate())
      : null;
    var notBefore = limit && limit > base ? limit : base;

    if (rule.type === "daily") return notBefore;

    if (rule.type === "weekly") {
      for (var i = 0; i < 14; i++) {
        var c = new Date(notBefore);
        c.setDate(notBefore.getDate() + i);
        if (rule.days.indexOf(c.getDay()) > -1) return c;
      }
      return notBefore;
    }

    if (rule.type === "monthly") {
      var y = notBefore.getFullYear();
      var m = notBefore.getMonth();
      for (var x = 0; x < rule.doms.length; x++) {
        var dom = rule.doms[x];
        var d = Math.min(dom, daysInMonth(y, m));
        var cand = new Date(y, m, d);
        if (cand >= notBefore) return cand;
      }
      var nm = m + 1;
      var ny = m === 11 ? y + 1 : y;
      var mm = nm % 12;
      var d2 = Math.min(rule.doms[0], daysInMonth(ny, mm));
      return new Date(ny, mm, d2);
    }

    return notBefore;
  }

  // ----------------
  // Sorting + filter
  // ----------------
  function sortItemsByKey() {
    var wrapper = $(WRAPPER_SEL);
    if (!wrapper) return;

    var items = $all(wrapper, ITEM_SEL);
    items.sort(function (a, b) {
      var ta = keyToTs(a.getAttribute("data-sort-dt"));
      var tb = keyToTs(b.getAttribute("data-sort-dt"));
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      if (ta === tb) {
        var at = txt(a, '[cms-item="title"]');
        var bt = txt(b, '[cms-item="title"]');
        return at.localeCompare(bt);
      }
      return ta - tb;
    });
    items.forEach(function (el) { wrapper.appendChild(el); });
  }

  function generateMonthList(endDate) {
    var today = new Date();
    var startMonth = today.getMonth();
    var startYear = today.getFullYear();
    var months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    var out = [];
    var m = startMonth, y = startYear;
    while (true) {
      out.push(months[m] + " " + y);
      if (endDate) {
        var e = parseDateFlexible(endDate);
        if (!isNaN(e) && (y > e.getFullYear() || (y === e.getFullYear() && m >= e.getMonth()))) break;
      }
      if (!endDate && out.length === 12) break;
      m++; if (m === 12) { m = 0; y++; }
    }
    return out;
  }

  function loadFilterDropdown() {
    var list = generateMonthList();
    var toggle = document.querySelector('[data-role="fil-toggle"]');
    var listBox = document.querySelector('[data-role="fil-list"]');
    if (toggle && listBox) {
      toggle.addEventListener("click", function () { listBox.classList.toggle("hidden"); });
      document.addEventListener("click", function (e) {
        if (!e.target.closest(".dropdown--filter")) listBox.classList.add("hidden");
      });

      var labels = listBox.querySelectorAll(".w-form-label");
      var radios = listBox.querySelectorAll('input[type="radio"]');
      labels.forEach(function (lab, i) { if (list[i]) lab.textContent = list[i]; });
      radios.forEach(function (r, i) { if (list[i]) r.value = list[i]; });
    }
  }

  function bindMonthFilter() {
    var listBox = document.querySelector('[data-role="fil-list"]');
    if (!listBox) return;

    var radios = listBox.querySelectorAll('input[type="radio"]');
    radios.forEach(function (r) {
      r.addEventListener("change", function () {
        var monthValue = r.value;
        var count = 0;
        $all($(WRAPPER_SEL), ITEM_SEL).forEach(function (el) {
          var months = $all(el, '[filter="date"]').map(function (n){ return String(n.textContent || "").trim(); });
          if (months.indexOf(monthValue) > -1) { el.classList.remove("hidden"); count++; }
          else { el.classList.add("hidden"); }
        });

        var head = document.querySelector('[data-role="filter-head"]');
        var tag = document.querySelector('[data-role="tag"]');
        var tagText = document.querySelector('[data-role="tag-text"]');
        var nores = document.querySelector('[data-role="no-result"]');
        if (head) head.classList.add("hidden");
        if (tag) tag.classList.remove("hidden");
        if (tagText) tagText.textContent = monthValue;
        if (nores) nores.classList.toggle("hidden", count !== 0);
      });
    });

    var tag = document.querySelector('[data-role="tag"]');
    if (tag) {
      tag.addEventListener("click", function () {
        $all($(WRAPPER_SEL), ITEM_SEL).forEach(function (el) { el.classList.remove("hidden"); });
        var head = document.querySelector('[data-role="filter-head"]');
        var nores = document.querySelector('[data-role="no-result"]');
        tag.classList.add("hidden");
        if (head) head.classList.remove("hidden");
        if (nores) nores.classList.add("hidden");
      });
    }
  }

  function fillMonthTagsOnItem(el, endDateText) {
    var months = generateMonthList(endDateText);
    var blk = el.querySelector('[filter="date-block"]');
    var tag = el.querySelector('[filter="date"]');
    if (!blk || !tag) return;
    months.forEach(function (m) {
      var n = tag.cloneNode(true);
      n.textContent = m;
      blk.appendChild(n);
    });
    tag.remove();
  }

  // -------------------
  // Main processing run
  // -------------------
  function processItems() {
    var loader = document.querySelector('[data-role="loading"]');
    try {
      loadFilterDropdown();

      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      $all($(WRAPPER_SEL), ITEM_SEL).forEach(function (el) {
        // Recurring rule
        var ruleRaw = txt(el, RECURRING_FORMULA_SEL);
        var rule = parseRule(ruleRaw);

        // Start datetime extraction
        var startDT = extractStartDateTime(el);
        var startHM = !isNaN(startDT)
          ? { h: startDT.getHours(), m: startDT.getMinutes() }
          : getStartTimeHM(el);

        // End date (optional)
        var endDateText = txt(el, END_DATE_SEL);

        // Base for next occurrence
        var base = !isNaN(startDT)
          ? new Date(Math.max(today.getTime(), +new Date(startDT.getFullYear(), startDT.getMonth(), startDT.getDate())))
          : today;

        // Date-only occurrence
        var occDate = base;
        if (rule.type) {
          occDate = nextOccurrence(rule, base, !isNaN(startDT) ? startDT : null);
        } else if (!isNaN(startDT)) {
          occDate = new Date(startDT.getFullYear(), startDT.getMonth(), startDT.getDate());
        }

        // Final key with time
        var finalDate = new Date(occDate.getFullYear(), occDate.getMonth(), occDate.getDate(), startHM.h, startHM.m);
        el.setAttribute("data-sort-dt", toLocalIsoKey(finalDate));

        // Remove if expired by explicit end-date
        if (endDateText) {
          var end = parseDateFlexible(endDateText);
          if (!isNaN(end)) {
            var eod = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
            if (now > eod) {
              el.remove();
              return;
            }
          }
        }

        // Month filter tags
        fillMonthTagsOnItem(el, endDateText);
      });

      // Sort once, then bind filter
      sortItemsByKey();
      bindMonthFilter();

      // Debug overlay if requested
      if (/\bdebug=1\b/.test(location.search)) {
        $all($(WRAPPER_SEL), ITEM_SEL).forEach(function (el) {
          var pill = document.createElement("div");
          pill.textContent = el.getAttribute("data-sort-dt") || "no-key";
          pill.style.position = "absolute";
          pill.style.top = "6px";
          pill.style.left = "6px";
          pill.style.background = "#0008";
          pill.style.color = "#fff";
          pill.style.padding = "4px 6px";
          pill.style.borderRadius = "4px";
          pill.style.font = "12px/1.2 system-ui";
          pill.style.zIndex = "5";
          el.style.position = "relative";
          el.appendChild(pill);
        });

        var rows = $all($(WRAPPER_SEL), ITEM_SEL).map(function (el) {
          return {
            title: txt(el, '[cms-item="title"]'),
            key: el.getAttribute("data-sort-dt") || ""
          };
        });
        if (console.table) console.table(rows);
      }
    } catch (err) {
      console.error("Serenbe v4 error:", err);
    } finally {
      // Make sure the UI is visible even if something throws
      var col = document.querySelector('[data-type="events-col"]');
      if (col) col.style.display = "";
      if (loader) loader.style.display = "none";
    }
  }

  // Hook into Finsweet cmsload, with a safe fallback timer
  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push([
    "cmsload",
    function (listInstances) {
      try {
        // Prefer Finsweet's list when available
        var list = listInstances && listInstances[0];
        if (list && Array.isArray(list.items) && list.items.length) {
          // Ensure items exist before we process
          setTimeout(processItems, 0);
          return;
        }
      } catch (e) {}
      // Fallback if structure not as expected
      setTimeout(processItems, 0);
    }
  ]);

  // Absolute fallback in case cmsload never fires
  setTimeout(function () {
    // If nothing stamped yet, run once
    var anyKey = document.querySelector(WRAPPER_SEL + " " + ITEM_SEL + "[data-sort-dt]");
    if (!anyKey) processItems();
  }, 2000);
})();
