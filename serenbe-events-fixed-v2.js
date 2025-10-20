(function () {
  // Hide while we compute
  $('[data-type="events-col"]').hide();

  const TIME_SELECTORS = [
    '[cms-item="start-time"]',
    '[cms-item="time"]',
    '[data-time="start"]'
  ];

  // Utility: safe trimmed text
  function txt($root, sel) {
    const el = $root.find(sel).first();
    return el.length ? String(el.text()).trim() : '';
  }

  // Utility: find first non-empty text from multiple selectors
  function firstText($root, selectors) {
    for (const sel of selectors) {
      const v = txt($root, sel);
      if (v) return v;
    }
    return '';
  }

  // Parse "MM/DD/YYYY" or ISO "YYYY-MM-DD" (optionally with time)
  function parseDateTime(s) {
    if (!s) return new Date(NaN);
    s = String(s).trim();

    // Try MM/DD/YYYY [HH:MM] [AM|PM]
    const mdy = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i
    );
    if (mdy) {
      let [, mm, dd, yyyy, hh, min, ap] = mdy;
      mm = parseInt(mm, 10);
      dd = parseInt(dd, 10);
      yyyy = parseInt(yyyy, 10);
      hh = hh != null ? parseInt(hh, 10) : 0;
      min = min != null ? parseInt(min, 10) : 0;
      if (ap) {
        ap = ap.toUpperCase();
        if (ap === 'PM' && hh !== 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
      }
      return new Date(yyyy, mm - 1, dd, hh, min);
    }

    // Try ISO YYYY-MM-DD or YYYY-MM-DDTHH:MM
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?$/);
    if (iso) {
      let [, yyyy, mm, dd, hh, min] = iso;
      return new Date(
        parseInt(yyyy, 10),
        parseInt(mm, 10) - 1,
        parseInt(dd, 10),
        hh != null ? parseInt(hh, 10) : 0,
        min != null ? parseInt(min, 10) : 0
      );
    }

    // Fallback to Date parser
    return new Date(s);
  }

  // Format date as MM/DD/YYYY HH:MM AM/PM
  function formatToMDY12h(date) {
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const yyyy = date.getFullYear();
    let h = date.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const min = pad(date.getMinutes());
    return `${mm}/${dd}/${yyyy} ${h}:${min} ${ap}`;
  }

  // Extract a time from a string like "9:00 AM" or "14:30". Returns {h, m} or null.
  function parseTimeFromString(s) {
    if (!s) return null;
    s = String(s);

    // 12h format
    let m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const ap = m[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      return { h, m: min };
    }

    // 24h format
    m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    }

    return null;
  }

  // Get start time from various sources
  function getStartTime($el, originalStartText) {
    // 1) check explicit time fields
    const t1 = parseTimeFromString(firstText($el, TIME_SELECTORS));
    if (t1) return t1;
    // 2) check if start-date text already contains a time
    const t2 = parseTimeFromString(originalStartText);
    if (t2) return t2;
    // 3) default to 00:00
    return { h: 0, m: 0 };
  }

  // Normalize the recurring formula string into a rule object
  function parseRule(raw) {
    const s = String(raw || '')
      .toLowerCase()
      .replace(/[—–]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    if (!s) return { type: null };

    if (s.includes('daily')) return { type: 'daily' };

    if (s.includes('weekly') || s.includes('every week') || s.includes('every ')) {
      const days = [];
      const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const short = ['sun','mon','tue','wed','thu','fri','sat'];

      const matches = s.match(/sun(day)?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?/g) || [];
      for (const d of matches) {
        const name = d.slice(0,3).toLowerCase();
        const idx = short.indexOf(name);
        if (idx >= 0) days.push(idx);
      }
      return { type: 'weekly', days: days.length ? Array.from(new Set(days)) : [0,1,2,3,4,5,6] };
    }

    if (s.includes('monthly')) {
      const nums = (s.match(/(\d{1,2})(?:st|nd|rd|th)?/g) || [])
        .map(n => parseInt(n, 10))
        .filter(n => !Number.isNaN(n) && n >= 1 && n <= 31);
      return { type: 'monthly', doms: nums.length ? Array.from(new Set(nums)).sort((a,b)=>a-b) : [1] };
    }

    return { type: null };
  }

  // Next occurrence date for a rule
  function nextOccurrence(rule, minDate, startDateLimit) {
    const base = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    const limit = startDateLimit && !isNaN(startDateLimit) ?
      new Date(startDateLimit.getFullYear(), startDateLimit.getMonth(), startDateLimit.getDate()) :
      null;

    const notBefore = limit && limit > base ? limit : base;

    if (rule.type === 'daily') {
      return notBefore;
    }

    if (rule.type === 'weekly') {
      for (let i = 0; i < 14; i++) {
        const c = new Date(notBefore);
        c.setDate(notBefore.getDate() + i);
        if (rule.days.includes(c.getDay())) return c;
      }
      return notBefore;
    }

    if (rule.type === 'monthly') {
      const y = notBefore.getFullYear();
      const m = notBefore.getMonth();

      for (const dom of rule.doms) {
        const d = Math.min(dom, new Date(y, m + 1, 0).getDate());
        const cand = new Date(y, m, d);
        if (cand >= notBefore) return cand;
      }
      
      const nm = m + 1;
      const ny = m === 11 ? y + 1 : y;
      const mm = nm % 12;
      const d = Math.min(rule.doms[0], new Date(ny, mm + 1, 0).getDate());
      return new Date(ny, mm, d);
    }

    return notBefore;
  }

  // Turn parts into a sortable local ISO key "YYYY-MM-DDTHH:MM"
  function toLocalIso(y, m, d, hh, mm) {
    const p = n => (n < 10 ? '0' + n : '' + n);
    return `${y}-${p(m + 1)}-${p(d)}T${p(hh)}:${p(mm)}`;
  }

  // Convert key to timestamp (ms)
  function keyToTs(key) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return NaN;
    return +new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10)
    );
  }

  // Pretty output for header display
  function getRecurringEventDisplay(eventType) {
    const formatRange = (items, isDays = false) => {
      items.sort((a, b) => a - b);
      const ranges = [];
      let start = items[0];
      let prev = items[0];

      if (isDays) {
        for (let i = 1; i < items.length; i++) {
          if (items[i] === prev + 1) {
            prev = items[i];
          } else {
            ranges.push(start === prev ? `${start}` : `${start} - ${prev}`);
            start = items[i];
            prev = items[i];
          }
        }
        ranges.push(start === prev ? `${start}` : `${start} - ${prev}`);

        const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        return ranges
          .map(range =>
            range.includes('-')
              ? range.split(' - ').map(index => dayNames[index]).join(' - ')
              : dayNames[range]
          )
          .join(', ');
      }

      const suffix = { 1: 'st', 2: 'nd', 3: 'rd' };
      const end = n => suffix[n % 10] || 'th';

      start = items[0];
      prev = items[0];
      for (let i = 1; i < items.length; i++) {
        if (items[i] === prev + 1) {
          prev = items[i];
        } else {
          ranges.push(start === prev ? `${start}${end(start)}` : `${start}${end(start)} - ${prev}${end(prev)}`);
          start = items[i];
          prev = items[i];
        }
      }
      ranges.push(start === prev ? `${start}${end(start)}` : `${start}${end(start)} - ${prev}${end(prev)}`);
      return ranges.join(', ');
    };

    if (eventType.type === 'daily') return { top: 'Everyday', bottom: '' };

    if (eventType.type === 'weekly') {
      const jsToMon0 = d => (d === 0 ? 6 : d - 1);
      const dayIdx = eventType.days.map(jsToMon0).sort((a,b)=>a-b);
      return { top: 'Every week', bottom: formatRange(dayIdx, true) };
    }

    if (eventType.type === 'monthly') {
      return { top: 'Every month', bottom: formatRange(eventType.doms.slice()) };
    }

    return { top: '', bottom: '' };
  }

  function generateMonthList(endDate) {
    const today = new Date();
    const startMonth = today.getMonth();
    const startYear = today.getFullYear();
    const months = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    const out = [];
    let m = startMonth, y = startYear;

    while (true) {
      out.push(`${months[m]} ${y}`);
      if (endDate) {
        const e = parseDateTime(endDate);
        if (!isNaN(e) && (y > e.getFullYear() || (y === e.getFullYear() && m >= e.getMonth()))) break;
      }
      if (!endDate && out.length === 12) break;
      m++;
      if (m === 12) { m = 0; y++; }
    }
    return out;
  }

  function loadFilterDropdown() {
    const months = generateMonthList();
    $('[data-role="fil-toggle"]').on('click', function () {
      $('[data-role="fil-list"]').toggleClass('hidden');
    });
    $(document).on('click', function (e) {
      if (!$(e.target).closest('.dropdown--filter').length) {
        $('[data-role="fil-list"]').addClass('hidden');
      }
    });
    $('[data-role="fil-list"] .w-form-label').each(function (i) { $(this).text(months[i]); });
    $('[data-role="fil-list"] input[type="radio"]').each(function (i) { $(this).val(months[i]); });
  }

  function bindMonthFilter() {
    $('[data-role="fil-list"] input[type="radio"]').on('change', function () {
      $('[data-role="no-result"]').addClass('hidden');

      const monthValue = $(this).val();
      let count = 0;

      $('#sliderParentEvents .w-dyn-item').each(function () {
        const itemMonths = [];
        $(this).find('[filter="date"]').each(function () { itemMonths.push($(this).text()); });
        if (itemMonths.includes(monthValue)) {
          $(this).removeClass('hidden'); count++;
        } else {
          $(this).addClass('hidden');
        }
      });

      $('[data-role="filter-head"]').addClass('hidden');
      $('[data-role="tag"]').removeClass('hidden');
      $('[data-role="tag-text"]').text(monthValue);

      if (count === 0) $('[data-role="no-result"]').removeClass('hidden');
    });

    $('[data-role="tag"]').on('click', function () {
      $('#sliderParentEvents .w-dyn-item').removeClass('hidden');
      $('[data-role="filter-head"]').removeClass('hidden');
      $('[data-role="tag"]').addClass('hidden');
      $('[data-role="no-result"]').addClass('hidden');
    });
  }

  function sortItemsByKey(wrapperSel, attrName) {
    const $wrapper = $(wrapperSel);
    $wrapper
      .find('.w-dyn-item')
      .sort(function (a, b) {
        const ta = keyToTs($(a).attr(attrName));
        const tb = keyToTs($(b).attr(attrName));
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        if (ta === tb) {
          const at = $(a).find('[cms-item="title"]').text().trim();
          const bt = $(b).find('[cms-item="title"]').text().trim();
          return at.localeCompare(bt);
        }
        return ta - tb;
      })
      .appendTo($wrapper);
  }

  function fillMonthTagsOnItem($el, endDateText) {
    const months = generateMonthList(endDateText);
    const $blk = $el.find('[filter="date-block"]');
    const $tag = $el.find('[filter="date"]');
    months.forEach(m => {
      const $new = $tag.clone();
      $new.text(m).appendTo($blk);
    });
    $tag.remove();
  }

  // Main hook
  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push([
    'cmsload',
    listInstances => {
      try {
        const [list] = listInstances;
        loadFilterDropdown();

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        list.items.forEach(item => {
          const $el = $(item.element);

          // Read the recurring rule
          const ruleRaw = txt($el, '[date-recurring="formula"]').replace(/\s+/g, ' ');
          const rule = parseRule(ruleRaw);

          // Original dates from CMS
          const startDateText = txt($el, '[cms-item="start-date"]');
          const endDateText = txt($el, '[data-recurring="end-date"]') || txt($el, '[cms-item="end-date"]');

          const startDateParsed = parseDateTime(startDateText);
          const startTime = getStartTime($el, startDateText);

          // Choose base date for recurrence
          const base = isNaN(startDateParsed) ? today : new Date(
            Math.max(today.getTime(), new Date(startDateParsed.getFullYear(), startDateParsed.getMonth(), startDateParsed.getDate()).getTime())
          );

          // Compute next occurrence date
          let occDate = base;
          if (rule.type) {
            occDate = nextOccurrence(rule, base, isNaN(startDateParsed) ? null : startDateParsed);
            
            // For recurring events, update the display date with the computed occurrence
            const displayDate = new Date(occDate.getFullYear(), occDate.getMonth(), occDate.getDate(), startTime.h, startTime.m);
            $el.find('[cms-item="start-date"]').text(formatToMDY12h(displayDate));
          } else if (!isNaN(startDateParsed)) {
            occDate = new Date(startDateParsed.getFullYear(), startDateParsed.getMonth(), startDateParsed.getDate());
          }

          // Create sort key with date + time
          const sortKey = toLocalIso(occDate.getFullYear(), occDate.getMonth(), occDate.getDate(), startTime.h, startTime.m);
          $el.attr('data-sort-dt', sortKey);

          // Handle end dates
          if (endDateText) {
            const end = parseDateTime(endDateText);
            if (!isNaN(end)) {
              const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
              if (now > endOfDay) {
                $el.remove();
                return;
              }
              const isoEnd = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
              $el.find('[cms-item="end-date"]').text(isoEnd);
            }
          } else {
            const nextYear = new Date(today);
            nextYear.setMonth(today.getMonth() + 12);
            const isoEnd = `${nextYear.getFullYear()}-${String(nextYear.getMonth()+1).padStart(2,'0')}-${String(nextYear.getDate()).padStart(2,'0')}`;
            $el.find('[cms-item="end-date"]').text(isoEnd);
          }

          // Header text for recurring items
          if (rule.type) {
            if (rule.type === 'daily') {
              $el.find('[data-date="month"]').text('');
              $el.find('[data-date="start"]').text('Daily');
            } else {
              const header = getRecurringEventDisplay(rule);
              $el.find('[data-date="month"]').text(header.top);
              $el.find('[data-date="start"]').text(header.bottom);
            }
          }

          // Month filter tags
          fillMonthTagsOnItem($el, endDateText);
        });

        // Sort by the computed data-sort-dt key
        sortItemsByKey('#sliderParentEvents', 'data-sort-dt');

        // Bind filter controls
        bindMonthFilter();
        
      } catch (error) {
        console.error('Serenbe events script error:', error);
      } finally {
        // ALWAYS show events and hide loading, even if there's an error
        $('[data-type="events-col"]').show();
        $('[data-role="loading"]').hide();
      }
    }
  ]);
})();
