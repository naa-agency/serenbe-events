function updateGridItemLink() {
  console.log("called update grid");
  const nodeList = document.querySelectorAll(
    `#event-list-wrapper [data-type="link"]`
  );
  const baseLink = "https://serenbe.com/event/";
  nodeList.forEach((node) => {
    if (node.getAttribute("changed") === "false") {
      node.setAttribute("changed", "true");
      const slug = node.getAttribute("slug");
      node.setAttribute("href", baseLink + slug);
    }
  });
}

const $wrapper = $("#event-list-wrapper");
$wrapper.addClass("hidden");
$("#second-wrapper").addClass("hidden");

window.fsAttributes = window.fsAttributes || [];
window.fsAttributes.push([
  "cmsload",
  (listInstances) => {
    // console.log('cmsload Successfully loaded!');
    console.log(listInstances);
    // The callback passes a listInstances array with all the CMSList instances on the page.
    const [listInstance] = listInstances;
    const { items } = listInstance;

    items.forEach((item) => {
      const $el = $(item.element);
      
      // ADD THIS BLOCK HERE - Filter out all past events first
      const endDateElement = $el.find(`[recurring="formula"]`).text();
      if (endDateElement && endDateElement.includes("|")) {
        const [, endDateISO] = endDateElement.split("|");
        if (endDateISO) {
          const today = new Date();
          const endingDate = new Date(endDateISO);
          if (today > endingDate) {
            $el.remove();
            return;
          }
        }
      }
      // END OF NEW BLOCK

      const [formula, endDateISO] = $el
        .find(`[recurring="formula"]`)
        .text()
        .split("|");

      const eventType = formula.replaceAll(" ", "").toLowerCase();

      if (
        eventType.includes("daily") ||
        eventType.includes("weekly") ||
        eventType.includes("monthly")
      ) {
        // start date
        const startDate = getFirstRecurringDate(
          eventType,
          $el.find(`[date="start"]`).text()
        );
        $el.find(`[date="start"]`).text(startDate);
        // console.log($el);

        // end date
        const endDate = endDateISO;
        if (endDate) {
          const displayEndDate = new Date(endDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
          });
          $el.find(`[recurring="end-date"]`).text(`Ends on ${displayEndDate}`);

          const today = new Date();
          const endingDate = new Date(endDate);
          if (today > endingDate) {
            $el.remove();
            return;
          }
        } else {
          // const today = new Date();
          // const nextYearDate = new Date(today);
          // nextYearDate.setMonth(today.getMonth() + 12);
          // const formatEndDate = nextYearDate.toLocaleDateString("en-US", {
          //   year: "numeric",
          //   month: "long",
          //   day: "numeric"
          // });
          // const [formatEndDate] = nextYearDate.toISOString().split("T");
          $el.find(`[recurring="end-date"]`).hide();
        }

        // Header
        if (eventType.includes("daily")) {
          // $el.find(`[data-date="month"]`).text("");
          $el.find(`[recurring="display"]`).text("Daily");
        } else {
          const header = getRecurringEventDisplay(eventType);
          // $el.find(`[data-date="month"]`).text(header.top);
          // $el.find(`[data-date="start"]`).text(header.bottom);
          $el
            .find(`[recurring="display"]`)
            .text(`${header.top} on ${header.bottom}`);
        }
      }
    });

    // Set link
    setTimeout(async function () {
      // Sort item
      // const $sliderWrapper = $("#sliderParentEvents");
      // $wrapper
      //   .find(".w-dyn-item")
      // console.log(items);

      items.sort(function (a, b) {
        const date1Text = $(a.element).find(`[date="start"]`).text();
        const date2Text = $(b.element).find(`[date="start"]`).text();
        // if (
        //   $(a.element).find(`[recurring="formula"]`).text() ||
        //   $(b.element).find(`[recurring="formula"]`).text()
        // ) {
        //   console.log(date1Text, date2Text);
        // }

        // Convert string dates to Date objects
        const date1 = new Date(date1Text);
        const date2 = new Date(date2Text);
        // console.log(a, b);

        // Sort by date
        return date1 - date2;
      });
      // .appendTo($wrapper);

      // const clonedItems = structuredClone(items);
      // listInstance.clearItems();
      // await listInstance.addItems(clonedItems);

      listInstance.items = items;
      await listInstance.renderItems();

      updateGridItemLink();

      addScriptToHead(
        "https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmsslider@1/cmsslider.js"
      );
    });

    $wrapper.removeClass("hidden");
    $("#grid-loader").addClass("hide");

    // The renderitems event runs whenever the list renders items after switching pages.
    // listInstance.on('renderitems', (renderedItems) => {
    // });

    // addScriptToHead(
    //   "https://cdn.jsdelivr.net/npm/@finsweet/attributes-cmstabs@1/cmstabs.js"
    // );
  }
]);

// GPT generated
function getFirstRecurringDate(eventType, startDate) {
  // console.log(eventType);
  // const today = startDate ? new Date(startDate) : new Date();
  let today = new Date();
  if (new Date(startDate) > today) {
    today = new Date(startDate);
  }
  // console.log(today);

  // Format the output date as "Month Day, Year"
  const formatDate = (date) => {
    /*
    date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    })
    */
    return date.toISOString().split("T")[0];
  };

  if (eventType === "daily") {
    return formatDate(today); // Daily events always start today
  }

  if (eventType.startsWith("weekly-")) {
    const days = eventType
      .replace("weekly-", "")
      .split(",")
      .map((day) => day.toLowerCase());

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
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      if (days.includes(weekDays[checkDate.getDay()])) {
        return formatDate(checkDate);
      }
    }
  }

  if (eventType.startsWith("monthly-")) {
    const dates = eventType.replace("monthly-", "").split(",").map(Number);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    for (const date of dates) {
      const checkDate = new Date(currentYear, currentMonth, date);
      if (checkDate >= today) {
        return formatDate(checkDate);
      }
    }

    // If all dates have passed, check for next month's dates
    const nextMonth = new Date(currentYear, currentMonth + 1, 1);
    for (const date of dates) {
      const checkDate = new Date(
        nextMonth.getFullYear(),
        nextMonth.getMonth(),
        date
      );
      return formatDate(checkDate);
    }
  }
}

// GPT generated
function getRecurringEventDisplay(eventType) {
  // Helper to format days or dates into ranges when sequential
  const formatRange = (items, isDays = false) => {
    const suffix = {
      1: "st",
      2: "nd",
      3: "rd"
    };

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

      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
    return {
      top: "Everyday",
      bottom: ""
    };
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

    // Map and filter out invalid days
    const dayIndexes = days
      .map((day) => dayNames.indexOf(day.toLowerCase()))
      .filter((i) => i !== -1);

    if (dayIndexes.length === 0) {
      return { top: "Every week", bottom: "" }; // Handle empty or invalid input
    }

    const formattedDays = formatRange(dayIndexes, true);

    return {
      top: "Every week",
      bottom: formattedDays
    };
  }

  if (eventType.startsWith("monthly-")) {
    const dates = eventType.replace("monthly-", "").split(",").map(Number);
    const formattedDates = formatRange(dates);

    return {
      top: "Every month",
      bottom: formattedDates
    };
  }

  throw new Error("Invalid event type");
}

function addScriptToHead(src) {
  if (!src) {
    console.error("Source URL is required to add the script.");
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);

  console.log(`Script with src '${src}' added to head.`);
}