/* MineMemBench — guided-story assembly for the details archive page.
   Every number comes from data/study.json, the frozen Formal V1 export;
   every user-visible string comes from assets/i18n.js. */
(function () {
  "use strict";

  const C = window.MMBCharts;
  const P = window.MMBPlayer;
  const I = window.MMBI18N;
  const el = C.el;
  const T = I.t;

  const CASE_DEFS = [
    { key: "stale-action", cell: "world_update_depth3", seed: 1020, backend: "vector" },
    { key: "lifetime-save", cell: "lifetime_l2", seed: 1012, backend: "mem0" },
    { key: "lifetime-break", cell: "lifetime_l2", seed: 1012, backend: "vector" },
    { key: "noise-wall", cell: "noise_50", seed: 1011, backend: "vector" },
  ];

  function replayCases() {
    return CASE_DEFS.map((entry) => ({
      ...entry,
      label: T("d.case." + entry.key + ".label"),
      title: T("d.case." + entry.key + ".title"),
    }));
  }

  /* Plain-language overlay for the frozen data. study.json keeps the internal
     cell/scenario identifiers; everything the visitor reads is translated here
     so no chart requires knowing terms like "cell", "backend" or "retrieval". */
  function applyPlainLanguage(study) {
    for (const cellName of Object.keys(study.cell_meta)) {
      const meta = study.cell_meta[cellName];
      meta.label = T("d.cell." + cellName + ".label");
      meta.short = T("d.cell." + cellName + ".short");
      meta.blurb = T("d.cell." + cellName + ".blurb");
    }
    for (const family of Object.keys(study.scenario_meta || {})) {
      study.scenario_meta[family].name = T("d.scenario." + family);
    }
  }

  const LIMITATION_KEYS = [
    "d.limit.1", "d.limit.2", "d.limit.3", "d.limit.4",
    "d.limit.5", "d.limit.6", "d.limit.7",
  ];

  function fetchJson(path) {
    return fetch(path).then((response) => {
      if (!response.ok) throw new Error("failed to load " + path);
      return response.json();
    });
  }

  function shortHash(hash) {
    if (!hash) return "N/A";
    return String(hash).slice(0, 10) + "…";
  }

  function cellLookup(study) {
    const cells = {};
    for (const row of study.cells) cells[row.cell + "|" + row.backend] = row;
    return cells;
  }

  /* ---------------------------------- hero ---------------------------------- */

  function renderHero(study) {
    const wrap = document.getElementById("hero-frozen");
    const integrity = study.integrity;
    const items = [
      [T("d.hero.item.valid"), integrity.valid + " / " + integrity.expected],
      [T("d.hero.item.systems"), "none · vector · mem0 · letta"],
      [T("d.hero.item.challenges"), "8"],
      [T("d.hero.item.runs"), "10"],
      [T("d.hero.item.planner"), "deepseek-v4-flash · T=0"],
      [T("d.hero.item.integrity"), integrity.verdict],
    ];
    for (const [key, value] of items) {
      const span = el("span");
      span.appendChild(el("b", null, String(value)));
      span.appendChild(document.createTextNode(" " + key));
      wrap.appendChild(span);
    }
  }

  /* --------------------------------- findings --------------------------------- */

  function renderFindings(study, racePlayer) {
    const cells = cellLookup(study);
    const n = (cell, backend, field) => {
      const row = cells[cell + "|" + backend];
      return row ? row[field] : null;
    };

    /* finding 1 — the long-memory cliff */
    document.getElementById("finding-lifetime").innerHTML =
      T("d.f1.body", { l1: n("lifetime_l1", "vector", "success_n") });
    document.getElementById("watch-lifetime").onclick = () => {
      racePlayer.selectRace("lifetime_l2", 1012);
    };

    /* finding 2 — having the fact ≠ using it */
    const rb = study.retrieval_behavior;
    const line = document.getElementById("rb-line");
    line.innerHTML =
      '<b class="n-ok">' + T("d.f2.seg1", { a: rb.retrieval_present_behavior_success || 0 }) + "</b> " +
      '<b class="n-warn">' + T("d.f2.seg2", { b: rb.retrieval_present_behavior_failure || 0 }) + "</b> " +
      '<b class="n-zero">' + T("d.f2.seg3", { c: rb.retrieval_absent_behavior_success || 0 }) + "</b> " +
      '<b class="n-fail">' + T("d.f2.seg4", { d: rb.retrieval_absent_behavior_failure || 0 }) + "</b>";
    document.getElementById("finding-worldupdate").textContent = T("d.f2.body");
    C.renderRBTable(document.getElementById("rb-table"), rb);
    document.getElementById("watch-worldupdate").onclick = () => {
      racePlayer.selectRace("world_update_depth3", 1020);
    };

    /* finding 3 — where each system breaks */
    document.getElementById("finding-failurepoints").textContent = T("d.f3.body");
    renderFailureStrips(document.getElementById("fp-strips"), study, cells);

    /* matrix */
    C.renderMatrix(document.getElementById("matrix"), study, (cell) => {
      racePlayer.selectRace(cell, defaultSeedFor(cell));
      document.getElementById("race").scrollIntoView({ behavior: "smooth" });
    });
  }

  function renderFailureStrips(container, study, cells) {
    const groups = [
      {
        title: T("d.fp.group.noise"),
        levels: ["noise_10", "noise_30", "noise_50"],
        labels: ["10", "30", "50"],
        ladder: "memory_noise_stress",
        plain: { "10": T("d.fp.lvl.10"), "30": T("d.fp.lvl.30"), "50": T("d.fp.lvl.50") },
      },
      {
        title: T("d.fp.group.lifetime"),
        levels: ["lifetime_l1", "lifetime_l2", "lifetime_l3"],
        labels: ["2", "4", "8"],
        ladder: "long_lived_memory",
        plain: { L1: T("d.fp.lvl.L1"), L2: T("d.fp.lvl.L2"), L3: T("d.fp.lvl.L3") },
      },
    ];
    const fps = {};
    for (const fp of study.failure_points) fps[fp.ladder + "|" + fp.backend] = fp;

    for (const group of groups) {
      const title = el("div", { class: "eyebrow", style: "margin:18px 0 4px" }, group.title.toUpperCase());
      container.appendChild(title);
      for (const backend of study.backend_order) {
        const fp = fps[group.ladder + "|" + backend];
        const strip = el("div", { class: "fp-strip" });
        const name = el("span", { class: "fp-name" });
        name.appendChild(el("i", { style: "background:" + C.BACKEND_COLORS[backend] }));
        name.appendChild(document.createTextNode(study.backend_meta[backend].short));
        strip.appendChild(name);
        const track = el("div", { class: "fp-track" });
        group.levels.forEach((cellName, index) => {
          const row = cells[cellName + "|" + backend];
          const rate = row ? row.success_rate : null;
          const broken = rate !== null && rate < 0.8;
          const cell = el("div", {
            class: "fp-cell" + (broken ? " broken" : " ok"),
            style: "--bc:" + C.BACKEND_COLORS[backend],
            title: T("d.fp.celltitle", {
              label: study.cell_meta[cellName].label,
              pct: Math.round((rate || 0) * 100),
            }),
          }, group.labels[index] + " · " + Math.round((rate || 0) * 100) + "%");
          track.appendChild(cell);
        });
        strip.appendChild(track);
        const note = fp && fp.observed
          ? T("d.fp.broke", { x: group.plain[String(fp.failure_point)] || fp.failure_point })
          : T("d.fp.never");
        strip.appendChild(el("span", { class: "fp-note" }, note));
        container.appendChild(strip);
      }
    }
  }

  function defaultSeedFor(cell) {
    const preferred = {
      lifetime_l2: 1012,
      world_update_depth3: 1020,
      delayed_200_20: 1016,
      noise_50: 1011,
    };
    return preferred[cell] || 1011;
  }

  /* --------------------------------- explore --------------------------------- */

  function renderRunsTable(study, runs) {
    const container = document.getElementById("runs-table");
    const wrap = el("div", { class: "table-wrap" });
    const table = el("table", { class: "data-table" });
    const head = el("tr");
    const headers = [
      "d.runs.h.challenge", "d.runs.h.system", "d.runs.h.seed", "d.runs.h.success",
      "d.runs.h.fact", "d.runs.h.rank", "d.runs.h.why", "d.runs.h.tokens", "d.runs.h.episode",
    ];
    for (const key of headers) {
      head.appendChild(el("th", null, T(key)));
    }
    table.appendChild(head);
    const sorted = [...runs].sort(
      (a, b) =>
        study.cell_order.indexOf(a.cell) - study.cell_order.indexOf(b.cell) ||
        study.backend_order.indexOf(a.backend) - study.backend_order.indexOf(b.backend) ||
        a.seed - b.seed
    );
    for (const row of sorted) {
      const tr = el("tr");
      tr.appendChild(el("td", null, (study.cell_meta[row.cell] || {}).label || row.cell));
      const backendTd = el("td");
      backendTd.appendChild(
        el("span", {
          style: "color:" + (C.BACKEND_COLORS[row.backend] || "#888"),
        }, (study.backend_meta[row.backend] || {}).label || row.backend)
      );
      tr.appendChild(backendTd);
      tr.appendChild(el("td", { class: "num" }, String(row.seed)));
      tr.appendChild(
        el("td", null, row.task_success ? T("d.runs.yes") : T("d.runs.no"))
      ).className = row.task_success ? "ok" : "fail";
      tr.appendChild(el("td", null, row.retrieval_present ? T("d.yes") : T("d.no")));
      tr.appendChild(el("td", { class: "num" }, row.retrieval_rank == null ? "—" : "#" + row.retrieval_rank));
      tr.appendChild(el("td", null, row.task_success ? "—" : T("d.attrib." + row.failure_attribution)));
      tr.appendChild(el("td", { class: "num" }, (row.total_tokens || 0).toLocaleString()));
      tr.appendChild(el("td", { style: "color:var(--ink-faint)" }, String(row.episode_id).slice(0, 8) + "…"));
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function kvRows(container, rows) {
    const wrap = el("div", { class: "kv" });
    for (const [key, value, ok] of rows) {
      const row = el("div", { class: "kv-row" });
      row.appendChild(el("span", { class: "k" }, key));
      row.appendChild(el("span", { class: "v" + (ok ? " ok" : "") }, String(value)));
      wrap.appendChild(row);
    }
    container.appendChild(wrap);
  }

  function renderMethod(study) {
    const integrity = study.integrity;
    const stats = study.statistics;
    const producer = study.producer;

    kvRows(document.getElementById("method-study"), [
      [T("d.m.study"), study.study_id],
      [T("d.m.design"), T("d.m.design.v")],
      [T("d.m.endpoint"), T("d.m.endpoint.v")],
      [T("d.m.mode"), T("d.m.mode.v")],
      [T("d.m.prereg"), "docs/preregistration_m15_formal_v1_attempt2.md"],
    ]);
    kvRows(document.getElementById("method-integrity"), [
      [T("d.m.expected"), integrity.expected + " / " + integrity.valid, true],
      [T("d.m.missing"), integrity.missing + " / " + integrity.duplicates + " / " + integrity.unexpected],
      [T("d.m.retries"), integrity.retries + " / " + integrity.exclusions],
      [T("d.m.prodfail"), String(integrity.producer_failures)],
      [T("d.m.verdict"), integrity.verdict, integrity.verdict === "PASS"],
    ]);
    kvRows(document.getElementById("method-stats"), [
      [T("d.m.ptest"), "exact McNemar, two-sided"],
      [T("d.m.effect"), "paired risk difference (A − B)"],
      [T("d.m.interval"), "percentile bootstrap 95% CI"],
      [T("d.m.resamples"), stats.bootstrap_resamples.toLocaleString()],
      [T("d.m.multiplicity"), T("d.m.multiplicity.v")],
      [T("d.m.significant"), T("d.m.significant.v")],
    ]);
    kvRows(document.getElementById("method-provenance"), [
      [T("d.m.commit"), producer.git_commit],
      [T("d.m.fingerprint"), shortHash(producer.source_tree_fingerprint)],
      [T("d.m.dirty"), String(producer.git_dirty)],
      [T("d.m.erratum"), T("d.m.erratum.v")],
      [T("d.m.guard"), T("d.m.guard.v")],
    ]);

    const list = document.getElementById("limitations");
    for (const key of LIMITATION_KEYS) {
      list.appendChild(el("li", null, T(key)));
    }

    document.getElementById("footer-meta").textContent =
      T("d.footer.meta", {
        id: study.study_id,
        commit: producer.git_commit,
        fp: producer.source_tree_fingerprint,
      });

    document.getElementById("stats-note").textContent =
      T("d.stats.note", {
        seed: stats.bootstrap_seed,
        n: stats.bootstrap_resamples.toLocaleString(),
      });
  }

  /* ---------------------------------- boot ---------------------------------- */

  const CONTAINERS = [
    "hero-frozen", "rb-table", "fp-strips", "matrix", "race-app", "replay-app",
    "forest", "ladders", "cost", "runs-table",
    "method-study", "method-integrity", "method-stats", "method-provenance", "limitations",
  ];

  function boot() {
    Promise.all([
      fetchJson("data/study.json"),
      fetchJson("data/races/index.json"),
      fetchJson("data/runs.json"),
    ])
      .then(([study, raceIndex, runs]) => {
        let racePlayer = null;
        let replayTheater = null;

        function renderAll() {
          const prevRace = racePlayer ? racePlayer.state() : null;
          const prevCase = replayTheater ? replayTheater.state().caseIndex : 0;

          applyPlainLanguage(study);
          for (const id of CONTAINERS) {
            document.getElementById(id).innerHTML = "";
          }

          renderHero(study);

          racePlayer = P.createRacePlayer(document.getElementById("race-app"), {
            study,
            raceIndex,
            loadRace: (file) => fetchJson("data/" + file),
            initial: prevRace || { cell: "lifetime_l2", seed: 1012 },
          });

          renderFindings(study, racePlayer);

          replayTheater = P.createReplayTheater(document.getElementById("replay-app"), {
            cases: replayCases(),
            initialCase: prevCase,
            loadStory: (entry) =>
              fetchJson("data/races/" + entry.cell + "__s" + entry.seed + ".json").then(
                (race) => race.lanes[entry.backend].story
              ),
          });

          C.renderForest(document.getElementById("forest"), study);
          C.renderLadders(document.getElementById("ladders"), study);
          C.renderCost(document.getElementById("cost"), study);
          renderRunsTable(study, runs);
          renderMethod(study);
        }

        document.getElementById("lang-mount").appendChild(I.makeLangButton());
        I.applyToDom(document);
        I.onChange(() => renderAll());
        renderAll();
      })
      .catch((error) => {
        const box = el(
          "div",
          { class: "error-box" },
          T("d.error.data", { msg: error.message })
        );
        document.querySelector(".hero").appendChild(box);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
