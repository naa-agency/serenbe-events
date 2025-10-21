$(`[data-type="events-col"]`).hide();

window.fsAttributes = window.fsAttributes || [];
window.fsAttributes.push([
  "cmsload",
  (listInstances) => {
    const [listInstance] = listInstances;

    loadFilterDropdown();

    const { items } = listInstance;

    items.forEach((item) => {
      const $el = $(item.element);
      const eventType = $el
        .find(`[date-recurring="formula"]`)
        .text()
        .replaceAll(" ", "")
        .toLowerCase();

      if (
        eventType.includes("daily") ||
        eventType.includes("weekly") ||
        eventType.includes("monthly")
      ) {
        // ✅ Compute first occurrence DATE but keep original TIME
        const originalStartText = $el.find(`[cms-item="start-date"]`).text();
        const startDateTime = getFirstRecurringDateTime(
          eventType,
          originalStartText
        );
        $el.find(`[cms-item="start-date"]`).text(startDateTime);

        // end date
        const endDate = $el.find(`[data-recurring="end-date"]`).text();

        if (endDate) {
          $el.find(`[cms-item="end-date"]`).text(endDate);
          const today = new Date();
          const endingDate = parseDateTime(endDate);
          if (today > endingDate) {
            $el.remove();
            return;
          }
        } else {
          const today = new Date();
          const nextYearDate = new Date(today);
          nextYearDate.setMonth(today.getMonth() + 12);
          const [formatEndDate] = nextYearDate.toISOString().split("T");
          $el.find(`[cms-item="end-date"]`).text(formatEndDate);
        }

        // Header
        if (eventType.includes("daily")) {
          $el.find(`[data-date="month"]`).text("");
          $el.find(`[data-date="start"]`).text("Daily");
        } else {
          const header = getRecurringEventDisplay(eventType);
          $el.find(`[data-date="month"]`).text(header.top);
          $el.find(`[data-date="start"]`).text(header.bottom);
        }

        // Fill filter tags
        const availableMonths = generateMonthList(
          $el.find(`[cms-item="end-date"]`).text()
        );
        const $tagsBlock = $el.find(`[filter="date-block"]`);
        const $tag = $el.find(`[filter="date"]`);
        availableMonths.forEach((m) => {
          const $newTag = $tag.clone();
          $newTag.text(m);
          $newTag.appendTo($tagsBlock);
        });
        $tag.remove();
      }
    });

    $(`[data-type="events-col"]`).show();
    $(`[data-role="loading"]`).hide();
    setTimeout(() => {
      loadSortFilter();
    });
  }
]);

// ========================= Helpers =========================

// Robust parser: supports "MM/DD/YYYY hh:mm AM/PM" and ISO "YYYY-MM-DD" (optionally with time)
function parseDateTime(str) {
  if (!str) return new Date(NaN);
  const s = String(str).trim();

  // MM/DD/YYYY hh:mm AM/PM
  const mdy12 = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (mdy12) {
    let [, mm, dd, yyyy, hh, min, ap] = mdy12;
    mm = parseInt(mm, 10);
    dd = parseInt(dd, 10);
    yyyy = parseInt(yyyy, 10);
    hh = parseInt(hh, 10);
    min = parseInt(min, 10);
    ap = ap.toUpperCase();
    if (ap === "PM" && hh !== 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return new Date(yyyy, mm - 1, dd, hh, min);
  }

  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH:MM
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) {
    let [, yyyy, mm, dd, hh, min] = iso;
    yyyy = parseInt(yyyy, 10);
    mm = parseInt(mm, 10);
    dd = parseInt(dd, 10);
    hh = hh != null ? parseInt(hh, 10) : 0;
    min = min != null ? parseInt(min, 10) : 0;
    // Create LOCAL date to avoid timezone surprises during sorting
    return new Date(yyyy, mm - 1, dd, hh, min);
  }

  // Fallback (browser-dependent)
  return new Date(s);
}

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

// 👉 New: compute the next recurring DATE and reattach original TIME
function getFirstRecurringDateTime(eventType, originalStartText) {
  const now = new Date();
  const original = parseDateTime(originalStartText);
  // Use original time if valid; fall back to 00:00
  const baseHours = isNaN(original) ? 0 : original.getHours();
  const baseMinutes = isNaN(original) ? 0 : original.getMinutes();

  // Base date to start searching from (date-only)
  const baseDate = new Date(
    Math.max(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
      isNaN(original)
        ? -Infinity
        : new Date(
            original.getFullYear(),
            original.getMonth(),
            original.getDate()
          ).getTime()
    )
  );

  const attachTime = (d) =>
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      baseHours,
      baseMinutes
    );

  if (eventType === "daily") {
    return formatToMDY12h(attachTime(baseDate));
  }

  if (eventType.startsWith("weekly-")) {
    const days = eventType
      .replace("weekly-", "")
      .split(",")
      .map((d) => d.trim().toLowerCase());
    const weekDays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday"
    ];
    for (let i = 0; i < 7; i++) {
      const candidate = new Date(baseDate);
      candidate.setDate(baseDate.getDate() + i);
      if (days.includes(weekDays[candidate.getDay()])) {
        return formatToMDY12h(attachTime(candidate));
      }
    }
  }

  if (eventType.startsWith("monthly-")) {
    const dates = eventType
      .replace("monthly-", "")
      .split(",")
      .map((n) => parseInt(n, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);

    const cm = baseDate.getMonth();
    const cy = baseDate.getFullYear();

    // Try this month on or after baseDate
    for (const day of dates) {
      const candidate = new Date(cy, cm, day);
      if (candidate >= baseDate) {
        return formatToMDY12h(attachTime(candidate));
      }
    }
    // Otherwise, next month (first listed day)
    const nextMonth = new Date(cy, cm + 1, 1);
    const candidate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      dates[0]
    );
    return formatToMDY12h(attachTime(candidate));
  }

  // Fallback to original start if rule unrecognized
  return isNaN(original) ? formatToMDY12h(now) : formatToMDY12h(original);
}

function getRecurringEventDisplay(eventType, startDate) {
  const formatRange = (items, isDays = false) => {
    const suffix = { 1: "st", 2: "nd", 3: "rd" };
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

      const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      return ranges
        .map((range) =>
          range.includes("-")
            ? range
                .split(" - ")
                .map((index) => dayNames[index])
                .join(" - ")
            : dayNames[range]
        )
        .join(", ");
    }

    let stEnd = suffix[start.toString().at(-1)] ?? "th";
    let prEnd = suffix[prev.toString().at(-1)] ?? "th";

    for (let i = 1; i < items.length; i++) {
      if (items[i] === prev + 1) {
        prev = items[i];
        stEnd = suffix[prev.toString().at(-1)] ?? "th";
      } else {
        ranges.push(
          start === prev
            ? `${start}${stEnd}`
            : `${start}${prEnd} - ${prev}${stEnd}`
        );
        start = items[i];
        prev = items[i];
        stEnd = suffix[start.toString().at(-1)] ?? "th";
        prEnd = suffix[prev.toString().at(-1)] ?? "th";
      }
    }

    ranges.push(
      start === prev ? `${start}${stEnd}` : `${start}${prEnd} - ${prev}${stEnd}`
    );

    return ranges.join(", ");
  };

  if (eventType === "daily") {
    return { top: "Everyday", bottom: "" };
  }

  if (eventType.startsWith("weekly-")) {
    const days = eventType.replace("weekly-", "").split(",");
    const dayNames = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday"
    ];
    const dayIndexes = days
      .map((day) => dayNames.indexOf(day.toLowerCase()))
      .filter((i) => i !== -1);

    if (dayIndexes.length === 0) {
      return { top: "Every week", bottom: "" };
    }

    const formattedDays = formatRange(dayIndexes, true);
    return { top: "Every week", bottom: formattedDays };
  }

  if (eventType.startsWith("monthly-")) {
    const dates = eventType.replace("monthly-", "").split(",").map(Number);
    const formattedDates = formatRange(dates);
    return { top: "Every month", bottom: formattedDates };
  }

  throw new Error("Invalid event type");
}

function generateMonthList(endDate) {
  const today = new Date();
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  const result = [];
  let currentMonth = startMonth;
  let currentYear = startYear;

  while (true) {
    result.push(`${months[currentMonth]} ${currentYear}`);
    if (endDate) {
      const end = parseDateTime(endDate);
      if (
        currentYear > end.getFullYear() ||
        (currentYear === end.getFullYear() && currentMonth >= end.getMonth())
      ) {
        break;
      }
    }
    if (!endDate && result.length === 12) break;

    currentMonth++;
    if (currentMonth === 12) {
      currentMonth = 0;
      currentYear++;
    }
  }

  return result;
}

function loadFilterDropdown() {
  const months = generateMonthList();
  $(`[data-role="fil-toggle"]`).on("click", function () {
    $(`[data-role="fil-list"]`).toggleClass("hidden");
  });

  $(document).on("click", function (event) {
    if (!$(event.target).closest(".dropdown--filter").length) {
      $(`[data-role="fil-list"]`).addClass("hidden");
    }
  });

  $(`[data-role="fil-list"] .w-form-label`).each(function (i) {
    $(this).text(months[i]);
  });
  $(`[data-role="fil-list"] input[type="radio"]`).each(function (i) {
    $(this).val(months[i]);
  });
}

function loadSortFilter() {
  const $wrapper = $("#sliderParentEvents");

  // ✅ Sort by full date + time (works for both formats)
  $wrapper
    .find(".w-dyn-item")
    .sort(function (a, b) {
      const date1Text = $(a).find(`[cms-item="start-date"]`).text();
      const date2Text = $(b).find(`[cms-item="start-date"]`).text();

      const date1 = parseDateTime(date1Text);
      const date2 = parseDateTime(date2Text);

      return date1 - date2; // earliest first
    })
    .appendTo($wrapper);

  $(`[data-role="fil-list"] input[type="radio"]`).on("change", function () {
    $(`[data-role="no-result"]`).addClass("hidden");

    const monthValue = $(this).val();
    let itemCount = 0;
    $("#sliderParentEvents .w-dyn-item").each(function () {
      const itemMonths = [];
      $(this)
        .find(`[filter="date"]`)
        .each(function () {
          itemMonths.push($(this).text());
        });

      if (itemMonths.includes(monthValue)) {
        $(this).removeClass("hidden");
        itemCount = itemCount + 1;
      } else {
        $(this).addClass("hidden");
      }

      $(`[data-role="filter-head"]`).addClass("hidden");
      $(`[data-role="tag"]`).removeClass("hidden");
      $(`[data-role="tag-text"]`).text(monthValue);
    });
    if (itemCount === 0) {
      $(`[data-role="no-result"]`).removeClass("hidden");
    }
  });

  $(`[data-role="tag"]`).on("click", function () {
    $("#sliderParentEvents .w-dyn-item").removeClass("hidden");
    $(`[data-role="filter-head"]`).removeClass("hidden");
    $(`[data-role="tag"]`).addClass("hidden");
    $(`[data-role="no-result"]`).addClass("hidden");
  });
}

// $(`[data-type="events-col"]`).hide();

// window.fsAttributes = window.fsAttributes || [];
// window.fsAttributes.push([
//   "cmsload",
//   (listInstances) => {
//     // console.log("cmsload Successfully loaded!");

//     // The callback passes a `listInstances` array with all the `CMSList` instances on the page.
//     const [listInstance] = listInstances;

//     loadFilterDropdown();

//     const { items } = listInstance;

//     items.forEach((item) => {
//       const $el = $(item.element);
//       const eventType = $el
//         .find(`[date-recurring="formula"]`)
//         .text()
//         .replaceAll(" ", "")
//         .toLowerCase();
//       // console.log(eventType);
//       if (
//         eventType.includes("daily") ||
//         eventType.includes("weekly") ||
//         eventType.includes("monthly")
//       ) {
//         // start date
//         const startDate = getFirstRecurringDate(
//           eventType,
//           $el.find(`[cms-item="start-date"]`).text()
//         );
//         console.log(startDate);

//         $el.find(`[cms-item="start-date"]`).text(startDate);

//         // end date
//         const endDate = $el.find(`[data-recurring="end-date"]`).text();

//         if (endDate) {
//           $el.find(`[cms-item="end-date"]`).text(endDate);
//           const today = new Date();
//           const endingDate = new Date(endDate);

//           if (today > endingDate) {
//             $el.remove();
//             return;
//           }
//         } else {
//           const today = new Date();
//           const nextYearDate = new Date(today);
//           nextYearDate.setMonth(today.getMonth() + 12);
//           // const formatEndDate = nextYearDate.toLocaleDateString("en-US", {
//           //   year: "numeric",
//           //   month: "long",
//           //   day: "numeric"
//           // });
//           const [formatEndDate] = nextYearDate.toISOString().split("T");
//           $el.find(`[cms-item="end-date"]`).text(formatEndDate);
//         }

//         // Header
//         if (eventType.includes("daily")) {
//           $el.find(`[data-date="month"]`).text("");
//           $el.find(`[data-date="start"]`).text("Daily");
//         } else {
//           const header = getRecurringEventDisplay(eventType);
//           $el.find(`[data-date="month"]`).text(header.top);
//           $el.find(`[data-date="start"]`).text(header.bottom);
//         }

//         // Fill filter tags
//         const availableMonths = generateMonthList(endDate);
//         const $tagsBlock = $el.find(`[filter="date-block"]`);
//         const $tag = $el.find(`[filter="date"]`);
//         availableMonths.forEach((m) => {
//           const $newTag = $tag.clone();
//           $newTag.text(m);
//           $newTag.appendTo($tagsBlock);
//         });
//         $tag.remove();
//       }
//     });

//     $(`[data-type="events-col"]`).show();
//     $(`[data-role="loading"]`).hide();
//     setTimeout(() => {
//       loadSortFilter();
//     });
//   }
// ]);

// // GPT generated
// function getFirstRecurringDate(eventType, startDate) {
//   // console.log(eventType);
//   // const today = startDate ? new Date(startDate) : new Date();
//   let today = new Date();
//   if (new Date(startDate) > today) {
//     today = new Date(startDate);
//   }
//   // const today = new Date();
//   // console.log(today);

//   // Format the output date as "Month Day, Year"
//   const formatDate = (date) => {
//     /*
//     date.toLocaleDateString("en-US", {
//       year: "numeric",
//       month: "long",
//       day: "numeric"
//     })
//     */
//     return date.toISOString().split("T")[0];
//   };
//   if (eventType === "daily") {
//     return formatDate(today); // Daily events always start today
//   }

//   if (eventType.startsWith("weekly-")) {
//     const days = eventType
//       .replace("weekly-", "")
//       .split(",")
//       .map((day) => day.toLowerCase());
//     const weekDays = [
//       "sunday",
//       "monday",
//       "tuesday",
//       "wednesday",
//       "thursday",
//       "friday",
//       "saturday"
//     ];

//     for (let i = 0; i < 7; i++) {
//       const checkDate = new Date(today);
//       checkDate.setDate(today.getDate() + i);
//       if (days.includes(weekDays[checkDate.getDay()])) {
//         return formatDate(checkDate);
//       }
//     }
//   }

//   if (eventType.startsWith("monthly-")) {
//     const dates = eventType.replace("monthly-", "").split(",").map(Number);

//     const currentMonth = today.getMonth();
//     const currentYear = today.getFullYear();

//     for (const date of dates) {
//       const checkDate = new Date(currentYear, currentMonth, date);
//       if (checkDate >= today) {
//         return formatDate(checkDate);
//       }
//     }

//     // If all dates have passed, check for next month's dates
//     const nextMonth = new Date(currentYear, currentMonth + 1, 1);
//     for (const date of dates) {
//       const checkDate = new Date(
//         nextMonth.getFullYear(),
//         nextMonth.getMonth(),
//         date
//       );
//       return formatDate(checkDate);
//     }
//   }
// }

// // GPT generated
// function getRecurringEventDisplay(eventType, startDate) {
//   // Helper to format days or dates into ranges when sequential
//   const formatRange = (items, isDays = false) => {
//     const suffix = {
//       1: "st",
//       2: "nd",
//       3: "rd"
//     };

//     items.sort((a, b) => a - b);
//     const ranges = [];
//     let start = items[0];
//     let prev = items[0];

//     if (isDays) {
//       for (let i = 1; i < items.length; i++) {
//         if (items[i] === prev + 1) {
//           prev = items[i];
//         } else {
//           ranges.push(start === prev ? `${start}` : `${start} - ${prev}`);
//           start = items[i];
//           prev = items[i];
//         }
//       }
//       ranges.push(start === prev ? `${start}` : `${start} - ${prev}`);

//       const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
//       return ranges
//         .map((range) =>
//           range.includes("-")
//             ? range
//                 .split(" - ")
//                 .map((index) => dayNames[index])
//                 .join(" - ")
//             : dayNames[range]
//         )
//         .join(", ");
//     }

//     let stEnd = suffix[start.toString().at(-1)] ?? "th";
//     let prEnd = suffix[prev.toString().at(-1)] ?? "th";

//     for (let i = 1; i < items.length; i++) {
//       if (items[i] === prev + 1) {
//         prev = items[i];
//         stEnd = suffix[prev.toString().at(-1)] ?? "th";
//       } else {
//         ranges.push(
//           start === prev
//             ? `${start}${stEnd}`
//             : `${start}${prEnd} - ${prev}${stEnd}`
//         );
//         start = items[i];
//         prev = items[i];
//         stEnd = suffix[start.toString().at(-1)] ?? "th";
//         prEnd = suffix[prev.toString().at(-1)] ?? "th";
//       }
//     }

//     ranges.push(
//       start === prev ? `${start}${stEnd}` : `${start}${prEnd} - ${prev}${stEnd}`
//     );

//     return ranges.join(", ");
//   };

//   if (eventType === "daily") {
//     return {
//       top: "Everyday",
//       bottom: ""
//     };
//   }

//   if (eventType.startsWith("weekly-")) {
//     const days = eventType.replace("weekly-", "").split(",");
//     const dayNames = [
//       "monday",
//       "tuesday",
//       "wednesday",
//       "thursday",
//       "friday",
//       "saturday",
//       "sunday"
//     ];

//     // Map and filter out invalid days
//     const dayIndexes = days
//       .map((day) => dayNames.indexOf(day.toLowerCase()))
//       .filter((i) => i !== -1);

//     if (dayIndexes.length === 0) {
//       return { top: "Every week", bottom: "" }; // Handle empty or invalid input
//     }

//     const formattedDays = formatRange(dayIndexes, true);
//     return {
//       top: "Every week",
//       bottom: formattedDays
//     };
//   }

//   if (eventType.startsWith("monthly-")) {
//     const dates = eventType.replace("monthly-", "").split(",").map(Number);
//     const formattedDates = formatRange(dates);
//     return {
//       top: "Every month",
//       bottom: formattedDates
//     };
//   }

//   throw new Error("Invalid event type");
// }

// // GPT generated
// function generateMonthList(endDate) {
//   const today = new Date();
//   const startMonth = today.getMonth(); // 0-based index for months
//   const startYear = today.getFullYear();

//   const months = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December"
//   ];

//   const result = [];
//   let currentMonth = startMonth;
//   let currentYear = startYear;

//   while (true) {
//     result.push(`${months[currentMonth]} ${currentYear}`);

//     // Check if endDate is given and we reached or exceeded it
//     if (endDate) {
//       const end = new Date(endDate);
//       if (
//         currentYear > end.getFullYear() ||
//         (currentYear === end.getFullYear() && currentMonth >= end.getMonth())
//       ) {
//         break;
//       }
//     }

//     // If no end date, stop after 12 months
//     if (!endDate && result.length === 12) {
//       break;
//     }

//     // Move to the next month
//     currentMonth++;
//     if (currentMonth === 12) {
//       currentMonth = 0; // Reset to January
//       currentYear++; // Increment the year
//     }
//   }

//   return result;
// }

// function loadFilterDropdown() {
//   const months = generateMonthList();
//   $(`[data-role="fil-toggle"]`).on("click", function () {
//     $(`[data-role="fil-list"]`).toggleClass("hidden");
//   });

//   $(document).on("click", function (event) {
//     if (!$(event.target).closest(".dropdown--filter").length) {
//       $(`[data-role="fil-list"]`).addClass("hidden");
//     }
//   });

//   $(`[data-role="fil-list"] .w-form-label`).each(function (i) {
//     $(this).text(months[i]);
//   });
//   $(`[data-role="fil-list"] input[type="radio"]`).each(function (i) {
//     $(this).val(months[i]);
//   });
// }

// function loadSortFilter() {
//   const $wrapper = $("#sliderParentEvents");
//   $wrapper
//     .find(".w-dyn-item")
//     .sort(function (a, b) {
//       const date1Text = $(a).find(`[cms-item="start-date"]`).text();
//       const date2Text = $(b).find(`[cms-item="start-date"]`).text();

//       // Convert string dates to Date objects
//       const date1 = new Date(date1Text);
//       const date2 = new Date(date2Text);

//       // Sort by date
//       return date1 - date2;
//     })
//     .appendTo($wrapper);

//   $(`[data-role="fil-list"] input[type="radio"]`).on("change", function () {
//     $(`[data-role="no-result"]`).addClass("hidden");

//     const monthValue = $(this).val();
//     let itemCount = 0;
//     $("#sliderParentEvents .w-dyn-item").each(function () {
//       const itemMonths = [];
//       $(this)
//         .find(`[filter="date"]`)
//         .each(function () {
//           itemMonths.push($(this).text());
//         });

//       if (itemMonths.includes(monthValue)) {
//         $(this).removeClass("hidden");
//         itemCount = itemCount + 1;
//       } else {
//         $(this).addClass("hidden");
//       }

//       $(`[data-role="filter-head"]`).addClass("hidden");
//       $(`[data-role="tag"]`).removeClass("hidden");
//       $(`[data-role="tag-text"]`).text(monthValue);
//     });
//     if (itemCount === 0) {
//       $(`[data-role="no-result"]`).removeClass("hidden");
//     }
//   });

//   $(`[data-role="tag"]`).on("click", function () {
//     $("#sliderParentEvents .w-dyn-item").removeClass("hidden");
//     $(`[data-role="filter-head"]`).removeClass("hidden");
//     $(`[data-role="tag"]`).addClass("hidden");
//     $(`[data-role="no-result"]`).addClass("hidden");
//   });
// }
