/* MineMemBench — hand-rolled SVG/DOM charts, editorial theme. No dependencies.
   User-visible strings come from assets/i18n.js (loaded before this file). */
window.MMBCharts = (function () {
  "use strict";

  const T = window.MMBI18N.t;

  const SVG_NS = "http://www.w3.org/2000/svg";

  const BACKEND_COLORS = {
    none: "#8d939e",
    vector: "#c07f1f",
    mem0: "#2e8f66",
    letta: "#4f66c0",
  };

  const ROLE_COLORS = {
    target: "#1f7fa8",
    current: "#2e8f66",
    stale: "#c07f1f",
    distractor: "#8a63c9",
    noise: "#8d939e",
    similar: "#8a63c9",
    neutral: "#a8aeb8",
    relevant_update: "#2e8f66",
    source_failure: "#c03a3a",
    irrelevant_failure: "#8d939e",
    interference: "#a8aeb8",
    other: "#8d939e",
  };

  const INK = "#191d24";
  const INK_MUTE = "#6d7480";
  const INK_FAINT = "#9aa1ac";
  const HAIRLINE = "#e2e1da";
  const FAIL = "#c03a3a";
  const WARN = "#c07f1f";
  const TARGET = "#1f7fa8";

  /* Why a run failed, in plain words. Keys are the frozen attribution codes. */
  function attribLabel(code) {
    if (!code) return "?";
    const label = T("d.attrib." + code);
    return label === "d.attrib." + code ? String(code) : label;
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "style") node.style.cssText = value;
        else node.setAttribute(key, value);
      }
    }
    if (text !== undefined && text !== null) {
      if (text instanceof Node) node.appendChild(text);
      else node.textContent = text;
    }
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      node.setAttribute(key, value);
    }
    return node;
  }

  function fmt(value, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
    return Number(value).toFixed(digits === undefined ? 1 : digits);
  }

  /* --------------------------- matrix (table) --------------------------- */

  function renderMatrix(table, study, onPick) {
    const cells = {};
    for (const row of study.cells) cells[row.cell + "|" + row.backend] = row;
    const fpByCellBackend = {};
    for (const fp of study.failure_points) {
      if (!fp.observed) continue;
      for (const cellName of Object.keys(study.cell_meta)) {
        const meta = study.cell_meta[cellName];
        if (meta.ladder === fp.ladder && meta.level === String(fp.failure_point)) {
          fpByCellBackend[cellName + "|" + fp.backend] = true;
        }
      }
    }

    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", null, ""));
    for (const backend of study.backend_order) {
      const th = el("th");
      const dot = el("span", { class: "mx-dot", style: "background:" + BACKEND_COLORS[backend] });
      th.appendChild(dot);
      th.appendChild(document.createTextNode(study.backend_meta[backend].label));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const cellName of study.cell_order) {
      const meta = study.cell_meta[cellName];
      const tr = el("tr");
      const rowhead = el("td", { class: "mx-rowhead", title: meta.description });
      rowhead.appendChild(document.createTextNode(meta.label));
      rowhead.appendChild(el("small", null, meta.blurb || meta.family.replace(/_/g, " ")));
      tr.appendChild(rowhead);

      for (const backend of study.backend_order) {
        const row = cells[cellName + "|" + backend];
        const td = el("td", { class: "mx" });
        if (!row) {
          td.classList.add("zero");
          td.textContent = "N/A";
          tr.appendChild(td);
          continue;
        }
        const retrievalRate = row.retrieval_rate == null ? null : row.retrieval_rate;
        td.appendChild(
          document.createTextNode(row.success_n + "/" + row.n)
        );
        if (fpByCellBackend[cellName + "|" + backend]) {
          td.appendChild(el("span", { class: "fp-flag", title: T("d.mx.fp") }, "▲"));
        }
        td.appendChild(
          el(
            "span",
            { class: "ret" },
            retrievalRate == null
              ? T("d.mx.na")
              : T("d.mx.ret", { pct: Math.round(retrievalRate * 100) })
          )
        );
        const rate = row.success_rate || 0;
        if (rate > 0) {
          td.style.background =
            "color-mix(in srgb, " + BACKEND_COLORS[backend] + " " + Math.round(rate * 13) + "%, transparent)";
        }
        if (backend === "none" || row.success_n === 0 && backend === "none") {
          td.classList.add("zero");
          td.title = T("d.mx.none");
        } else {
          td.addEventListener("click", () => onPick(cellName));
          td.title = T("d.mx.click", {
            backend: study.backend_meta[backend].label,
            cell: meta.label,
          });
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  /* --------------------- having the fact → acting on it --------------------- */

  function renderRBTable(container, rb) {
    const rows = [
      ["", T("d.rb.head.s"), T("d.rb.head.f")],
      [T("d.rb.row.present"), rb.retrieval_present_behavior_success || 0, rb.retrieval_present_behavior_failure || 0],
      [T("d.rb.row.absent"), rb.retrieval_absent_behavior_success || 0, rb.retrieval_absent_behavior_failure || 0],
    ];
    rows.forEach(([label, success, failure], index) => {
      const row = el("div", { class: "rb-row" });
      row.appendChild(el("span", null, label));
      if (index === 0) {
        row.appendChild(el("span", { class: "num", style: "color:var(--ink-faint)" }, success));
        row.appendChild(el("span", { class: "num", style: "color:var(--ink-faint)" }, failure));
      } else {
        row.appendChild(el("span", { class: "num" + (index === 2 ? " strong" : "") }, String(success)));
        row.appendChild(el("span", { class: "num" + (index === 1 ? " strong" : "") }, String(failure)));
      }
      container.appendChild(row);
    });
  }

  /* ------------------------------ ladders ------------------------------ */

  function renderLadders(container, study) {
    const cells = {};
    for (const row of study.cells) cells[row.cell + "|" + row.backend] = row;
    const ladders = [
      {
        key: "memory_noise_stress",
        question: T("d.lad.q.noise"),
        caption: T("d.lad.cap.noise"),
        levels: ["noise_10", "noise_30", "noise_50"],
        labels: ["10", "30", "50"],
        unit: T("d.lad.unit.noise"),
      },
      {
        key: "long_lived_memory",
        question: T("d.lad.q.lifetime"),
        caption: T("d.lad.cap.lifetime"),
        levels: ["lifetime_l1", "lifetime_l2", "lifetime_l3"],
        labels: ["2", "4", "8"],
        fpLabels: { L1: "2", L2: "4", L3: "8" },
        unit: T("d.lad.unit.lifetime"),
      },
    ];
    const fps = {};
    for (const fp of study.failure_points) fps[fp.ladder + "|" + fp.backend] = fp;

    for (const ladder of ladders) {
      const wrap = el("div", { class: "ladder" });
      wrap.appendChild(el("h4", null, ladder.question));
      wrap.appendChild(el("p", { class: "chart-caption" }, ladder.caption));
      const W = 460, H = 200, padL = 38, padB = 28, padT = 14, padR = 84;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
      const xFor = (i) => padL + (i * (W - padL - padR)) / (ladder.levels.length - 1);
      const yFor = (rate) => padT + (1 - rate) * (H - padT - padB);
      const endTags = [];

      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        const y = yFor(frac);
        svg.appendChild(
          svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: HAIRLINE, "stroke-width": 1 })
        );
        const label = svgEl("text", {
          x: padL - 8, y: y + 4, "text-anchor": "end",
          fill: INK_FAINT, "font-size": 10, "font-family": "monospace",
        });
        label.textContent = Math.round(frac * 100) + "%";
        svg.appendChild(label);
      }
      const yCaption = svgEl("text", {
        x: padL, y: 8, "text-anchor": "start",
        fill: INK_FAINT, "font-size": 8.5, "font-family": "monospace",
      });
      yCaption.textContent = T("d.lad.y");
      svg.appendChild(yCaption);
      const yFail = yFor(0.8);
      svg.appendChild(
        svgEl("line", {
          x1: padL, x2: W - padR, y1: yFail, y2: yFail,
          stroke: FAIL, "stroke-width": 1, "stroke-dasharray": "4 4", opacity: 0.55,
        })
      );
      const failLabel = svgEl("text", {
        x: padL, y: yFail - 5, "text-anchor": "start",
        fill: FAIL, "font-size": 9, "font-family": "monospace", opacity: 0.85,
      });
      failLabel.textContent = T("d.lad.fail");
      svg.appendChild(failLabel);

      ladder.labels.forEach((text, i) => {
        const label = svgEl("text", {
          x: xFor(i), y: H - padB + 17, "text-anchor": "middle",
          fill: INK_MUTE, "font-size": 11, "font-family": "monospace",
        });
        label.textContent = text;
        svg.appendChild(label);
      });
      const xCaption = svgEl("text", {
        x: (padL + W - padR) / 2, y: H - 2, "text-anchor": "middle",
        fill: INK_FAINT, "font-size": 8.5, "font-family": "monospace",
      });
      xCaption.textContent = ladder.unit;
      svg.appendChild(xCaption);

      for (const backend of ["none", "vector", "mem0", "letta"]) {
        const color = BACKEND_COLORS[backend];
        const points = ladder.levels.map((cellName, i) => {
          const row = cells[cellName + "|" + backend];
          return row ? { x: xFor(i), y: yFor(row.success_rate || 0), rate: row.success_rate } : null;
        });
        const path = points
          .map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1))
          .join(" ");
        svg.appendChild(
          svgEl("path", {
            d: path, fill: "none", stroke: color, "stroke-width": 1.8,
            opacity: backend === "none" ? 0.5 : 0.95,
            "stroke-dasharray": backend === "none" ? "3 4" : "none",
          })
        );
        const fp = fps[ladder.key + "|" + backend];
        points.forEach((p, i) => {
          svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 3.5, fill: color }));
          const fpHere = fp && fp.observed &&
            String((ladder.fpLabels || {})[fp.failure_point] || fp.failure_point) === ladder.labels[i];
          if (fpHere) {
            /* near the x-axis the marker goes above the point, not onto the tick labels */
            const below = p.y + 16 < H - padB;
            const marker = svgEl("text", {
              x: p.x, y: below ? p.y + 15 : p.y - 9, "text-anchor": "middle", fill: WARN, "font-size": 10,
            });
            marker.textContent = T("d.lad.broke");
            svg.appendChild(marker);
          }
        });
        const last = points[points.length - 1];
        endTags.push({ backend, color, x: last.x, y: last.y, neverBroke: fp && !fp.observed && backend !== "none" });
      }

      /* end tags: stagger labels whose lines finish at the same height;
         a tag with a "never broke" note underneath needs extra clearance */
      endTags.sort((a, b) => a.y - b.y);
      for (let i = 1; i < endTags.length; i++) {
        const need = endTags[i - 1].neverBroke ? 25 : 13;
        if (endTags[i].y - endTags[i - 1].y < need) endTags[i].y = endTags[i - 1].y + need;
      }
      for (const tagInfo of endTags) {
        const tag = svgEl("text", {
          x: tagInfo.x + 7, y: tagInfo.y + 4, fill: tagInfo.color, "font-size": 10.5, "font-family": "monospace",
        });
        tag.textContent = study.backend_meta[tagInfo.backend].label;
        svg.appendChild(tag);
        if (tagInfo.neverBroke) {
          const note = svgEl("text", {
            x: tagInfo.x + 7, y: tagInfo.y + 16, fill: INK_FAINT, "font-size": 8.5, "font-family": "monospace",
          });
          note.textContent = T("d.lad.never");
          svg.appendChild(note);
        }
      }
      wrap.appendChild(svg);
      container.appendChild(wrap);
    }
  }

  /* ------------------------------- forest ------------------------------- */

  function renderForest(container, study) {
    const byCell = new Map();
    for (const row of study.pairwise) {
      if (!byCell.has(row.cell)) byCell.set(row.cell, []);
      byCell.get(row.cell).push(row);
    }
    const pairLabel = (row) =>
      study.backend_meta[row.backend_a].short + " vs " + study.backend_meta[row.backend_b].short;

    container.appendChild(
      el(
        "div",
        { class: "forest-legend" },
        T("d.forest.legend")
      )
    );

    for (const cellName of study.cell_order) {
      const rows = byCell.get(cellName);
      if (!rows) continue;
      container.appendChild(
        el("div", { class: "forest-group" }, study.cell_meta[cellName].label)
      );
      for (const row of rows) {
        const sig = row.holm_reject_0_05 === true || row.holm_reject_0_05 === "True";
        const rd = row.paired_risk_difference_a_minus_b;
        const aShort = study.backend_meta[row.backend_a].short;
        const bShort = study.backend_meta[row.backend_b].short;
        const more = Math.abs(rd) * 10;
        const conclusion = sig
          ? T("d.forest.clear", { a: rd > 0 ? aShort : bShort, n: fmt(more, 0) })
          : T("d.forest.none");
        const line = el("div", { class: "forest-row" + (sig ? " sig" : "") });
        const labelCell = el("div", { class: "forest-label" });
        labelCell.appendChild(el("span", { class: "forest-pair" }, pairLabel(row)));
        labelCell.appendChild(el("span", { class: "forest-plain" }, conclusion));
        line.appendChild(labelCell);
        const track = el("div", { class: "forest-track" });
        const xFor = (v) => 50 + v * 48;
        for (const axisValue of [-1, -0.5, 0, 0.5, 1]) {
          track.appendChild(
            el("span", {
              class: "forest-axis" + (axisValue === 0 ? " zero" : ""),
              style: "left:" + xFor(axisValue) + "%",
            })
          );
        }
        const low = Math.max(-1, row.bootstrap_95_ci_low);
        const high = Math.min(1, row.bootstrap_95_ci_high);
        track.appendChild(
          el("span", {
            class: "forest-ci",
            style:
              "left:" + xFor(low) + "%;width:" + Math.max(0.6, xFor(high) - xFor(low)) + "%",
          })
        );
        track.appendChild(
          el("span", { class: "forest-dot", style: "left:" + xFor(rd) + "%" })
        );
        line.appendChild(track);
        const stats =
          "RD " + (rd > 0 ? "+" : "") + fmt(rd, 2) +
          " · CI [" + fmt(row.bootstrap_95_ci_low, 2) + ", " + fmt(row.bootstrap_95_ci_high, 2) + "]" +
          " · Holm p " + fmt(row.holm_adjusted_p, 4) +
          (sig ? " · SIG" : "");
        line.appendChild(el("div", { class: "forest-stats" }, stats));
        container.appendChild(line);
      }
    }
  }

  /* -------------------------------- cost -------------------------------- */

  function renderCost(container, study) {
    const perBackend = {};
    for (const backend of study.backend_order) {
      perBackend[backend] = { add: [], retrieve: [], tokens: [], planner: [] };
    }
    for (const row of study.cells) {
      const bucket = perBackend[row.backend];
      if (!bucket) continue;
      if (row.mean_add_latency_ms != null) bucket.add.push(row.mean_add_latency_ms);
      if (row.mean_retrieve_latency_ms != null) bucket.retrieve.push(row.mean_retrieve_latency_ms);
      if (row.mean_total_tokens != null) bucket.tokens.push(row.mean_total_tokens);
      if (row.mean_planner_latency_s != null) bucket.planner.push(row.mean_planner_latency_s);
    }
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    /* The plain-language takeaway of each card: how expensive is the
       bookkeeping of remembering, compared with doing nothing at all. */
    const storeNote = (addMs) => {
      if (addMs == null) return T("d.cost.note.none");
      if (addMs < 100) return T("d.cost.note.cheap");
      const pretty = addMs >= 1000 ? fmt(addMs / 1000, 1) + " s" : fmt(addMs, 0) + " ms";
      return T("d.cost.note.costly", { x: pretty });
    };

    for (const backend of study.backend_order) {
      const bucket = perBackend[backend];
      const card = el("div", { class: "cost-card" });
      const head = el("h4");
      head.appendChild(el("span", { class: "bc-dot", style: "background:" + BACKEND_COLORS[backend] }));
      head.appendChild(document.createTextNode(study.backend_meta[backend].label));
      card.appendChild(head);
      const addMean = mean(bucket.add);
      const rows = [
        [T("d.cost.row.add"), addMean, " ms", 1],
        [T("d.cost.row.retr"), mean(bucket.retrieve), " ms", 1],
        [T("d.cost.row.tokens"), mean(bucket.tokens), "", 0],
        [T("d.cost.row.planner"), mean(bucket.planner), " s", 2],
      ];
      for (const [label, value, unit, digits] of rows) {
        const line = el("div", { class: "cost-row" });
        line.appendChild(el("span", null, label));
        line.appendChild(
          el("b", null, value == null ? "N/A" : fmt(value, digits) + unit)
        );
        card.appendChild(line);
      }
      card.appendChild(el("div", { class: "cost-note" }, storeNote(addMean)));
      container.appendChild(card);
    }
  }

  /* ------------------------------ trajectory ------------------------------ */

  function renderMap(svg, story, uptoSeq, options) {
    const opts = options || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const points = [];
    for (const point of story.trajectory) {
      if (uptoSeq !== undefined && point.seq > uptoSeq) continue;
      points.push(point);
    }
    const markers = story.markers || [];
    const all = points.map((p) => p.pos).concat(markers.map((m) => m.pos));
    if (!all.length) {
      svg.setAttribute("viewBox", "0 0 100 100");
      return;
    }
    const xs = all.map((p) => p[0]);
    const zs = all.map((p) => p[2]);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const spanX = Math.max(4, maxX - minX);
    const spanZ = Math.max(4, maxZ - minZ);
    minX -= spanX * 0.18; maxX += spanX * 0.18;
    minZ -= spanZ * 0.18; maxZ += spanZ * 0.18;
    const W = 300, H = 200;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xFor = (x) => ((x - minX) / (maxX - minX)) * W;
    const yFor = (z) => H - ((z - minZ) / (maxZ - minZ)) * H;

    const color = opts.color || INK_MUTE;
    const pathPoints = points.map((p) => xFor(p.pos[0]).toFixed(1) + "," + yFor(p.pos[2]).toFixed(1));
    if (pathPoints.length > 1) {
      svg.appendChild(
        svgEl("polyline", {
          points: pathPoints.join(" "),
          fill: "none", stroke: color, "stroke-width": 1.6, opacity: 0.7,
          "stroke-linejoin": "round", "stroke-linecap": "round",
        })
      );
    }
    for (const marker of markers) {
      const cx = xFor(marker.pos[0]);
      const cy = yFor(marker.pos[2]);
      const kindColor = {
        target: ROLE_COLORS.target,
        current: ROLE_COLORS.current,
        stale: ROLE_COLORS.stale,
        distractor: ROLE_COLORS.distractor,
        recipient: ROLE_COLORS.distractor,
      }[marker.kind] || INK_MUTE;
      const shape = svgEl(
        marker.kind === "stale" || marker.kind === "distractor" ? "rect" : "circle",
        marker.kind === "stale" || marker.kind === "distractor"
          ? { x: cx - 4, y: cy - 4, width: 8, height: 8, rx: 1.5, fill: "none", stroke: kindColor, "stroke-width": 1.5 }
          : { cx, cy, r: 4.5, fill: "none", stroke: kindColor, "stroke-width": 1.5 }
      );
      const title = svgEl("title");
      title.textContent = marker.label;
      shape.appendChild(title);
      svg.appendChild(shape);
    }
    if (points.length) {
      const last = points[points.length - 1];
      svg.appendChild(
        svgEl("circle", { cx: xFor(last.pos[0]), cy: yFor(last.pos[2]), r: 4.5, fill: color })
      );
    }
  }

  return {
    BACKEND_COLORS,
    ROLE_COLORS,
    attribLabel,
    el,
    svgEl,
    fmt,
    renderMatrix,
    renderRBTable,
    renderLadders,
    renderForest,
    renderCost,
    renderMap,
  };
})();
