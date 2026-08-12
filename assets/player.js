/* MineMemBench — Memory Race player + single-run Replay theater.
   User-visible strings come from assets/i18n.js (loaded before this file). */
window.MMBPlayer = (function () {
  "use strict";

  const C = window.MMBCharts;
  const I = window.MMBI18N;
  const el = C.el;
  const T = I.t;

  /* What a memory is, in plain words. Keys are the frozen event roles. */
  function roleLabel(role) {
    const label = T("d.role." + role);
    return label === "d.role." + role ? String(role) : label;
  }

  /* Frozen scenario parameter keys, phrased for humans. */
  function paramPhrase(key, value) {
    const phrase = T("d.param." + key, { v: value });
    return phrase === "d.param." + key
      ? key.replace(/_/g, " ") + " " + value
      : phrase;
  }

  function phaseLabel(phase) {
    const label = T("d.phase." + phase);
    return label === "d.phase." + phase
      ? String(phase || "").replace(/_/g, " ")
      : label;
  }

  function fmtMs(seconds) {
    if (seconds === null || seconds === undefined) return "N/A";
    return seconds < 1 ? Math.round(seconds * 1000) + " ms" : seconds.toFixed(2) + " s";
  }

  function fmtSig(sig) {
    /* "move_to|{\"x\":40,\"y\":64,\"z\":0}" → "move_to (40, 0)" */
    const bar = sig.indexOf("|");
    if (bar === -1) return sig;
    const action = sig.slice(0, bar);
    try {
      const args = JSON.parse(sig.slice(bar + 1));
      if (args && typeof args === "object") {
        if ("x" in args && "z" in args) {
          return action + " (" + Math.round(args.x) + ", " + Math.round(args.z) + ")";
        }
        const keys = Object.keys(args).slice(0, 2);
        if (keys.length) {
          return action + " " + keys.map((k) => k + "=" + args[k]).join(" ");
        }
      }
    } catch (error) {
      /* fall through */
    }
    return action;
  }

  /* ------------------------------ frame pieces ------------------------------ */

  function retrievalEl(frame, maxItems) {
    const wrap = el("div", { class: "frame-section" });
    const head = el("div", { class: "fs-label" });
    head.appendChild(el("span", null, T("d.pl.retrieved")));
    const count = frame.retrieval.count;
    const target = frame.retrieval.target_rank;
    head.appendChild(
      el(
        "span",
        null,
        count === 0
          ? T("d.pl.nothing")
          : target
            ? T("d.pl.count", { n: count, r: target })
            : T("d.pl.countmiss", { n: count })
      )
    );
    wrap.appendChild(head);

    if (count === 0) {
      wrap.appendChild(
        el("div", { class: "retrieval-empty" }, T("d.pl.empty"))
      );
      return wrap;
    }
    const list = el("div", { class: "retrieval-list" });
    const items = frame.retrieval.items.slice(0, maxItems || 6);
    for (const item of items) {
      const row = el("div", {
        class: "retrieval-item" + (item.is_primary ? " is-target" : ""),
        style: "--rc:" + (C.ROLE_COLORS[item.role] || "#8d939e"),
      });
      row.appendChild(el("span", { class: "rank" }, "#" + item.rank));
      row.appendChild(el("span", { class: "role" }, roleLabel(item.role)));
      row.appendChild(el("span", { class: "summary", title: item.summary }, item.summary));
      list.appendChild(row);
    }
    if (count > items.length) {
      list.appendChild(
        el("div", { class: "retrieval-item" }, T("d.pl.more", { n: count - items.length }))
      );
    }
    wrap.appendChild(list);
    return wrap;
  }

  function plannerEl(frame) {
    const wrap = el("div", { class: "frame-section" });
    const head = el("div", { class: "fs-label" });
    head.appendChild(el("span", null, T("d.planner")));
    head.appendChild(el("span", null, fmtMs(frame.planner.latency_s)));
    wrap.appendChild(head);
    const args = Object.entries(frame.planner.args || {})
      .map(([key, value]) => key + "=" + (Number.isInteger(value) ? value : JSON.stringify(value)))
      .join("  ");
    wrap.appendChild(
      el("div", { class: "fs-value mono" }, frame.planner.action + (args ? "  " + args : ""))
    );
    if (frame.planner.reason) {
      wrap.appendChild(el("div", { class: "reason-quote" }, "“" + frame.planner.reason + "”"));
    }
    return wrap;
  }

  function outcomeEl(frame) {
    const wrap = el("div", { class: "frame-section" });
    const head = el("div", { class: "fs-label" });
    head.appendChild(el("span", null, T("d.outcome")));
    wrap.appendChild(head);
    const status = frame.outcome.status;
    const statusKey = T("d.status." + status);
    wrap.appendChild(
      el("span", {
        class:
          "outcome-chip " +
          (status === "completed" ? "completed" : status === "failed" ? "failed" : "other"),
      }, statusKey === "d.status." + status ? status : statusKey)
    );
    if (frame.outcome.error) {
      wrap.appendChild(
        el("div", { class: "reason-quote", style: "font-style:normal;font-family:var(--mono)" }, frame.outcome.error)
      );
    }
    return wrap;
  }

  function tokensEl(frame) {
    const footer = el("div", { class: "frame-tokens" });
    footer.appendChild(
      el("span", null, T("d.tokens.frame", {
        a: frame.planner.prompt_tokens,
        b: frame.planner.completion_tokens,
      }))
    );
    footer.appendChild(el("span", null, T("d.tokens.cum", { n: frame.cum_tokens.toLocaleString() })));
    return footer;
  }

  /* -------------------------------- transport -------------------------------- */

  function createTransport(options) {
    const beats = options.beats;
    const onSeek = options.onSeek;
    const state = { beat: 0, playing: false, speed: 1, timer: null };

    const root = el("div", { class: "transport" });
    const buttons = el("div", { class: "t-buttons" });
    const btnFirst = el("button", { class: "t-btn", title: T("d.transport.first") }, "|◀");
    const btnPrev = el("button", { class: "t-btn", title: T("d.transport.prev") }, "◀");
    const btnPlay = el("button", { class: "t-btn play", title: T("d.transport.play") }, "▶");
    const btnNext = el("button", { class: "t-btn", title: T("d.transport.next") }, "▶");
    const btnLast = el("button", { class: "t-btn", title: T("d.transport.last") }, "▶|");
    buttons.append(btnFirst, btnPrev, btnPlay, btnNext, btnLast);
    root.appendChild(buttons);

    const sliderWrap = el("div", { class: "t-slider-wrap" });
    const slider = el("input", {
      class: "t-slider", type: "range", min: "0",
      max: String(Math.max(0, beats - 1)), value: "0", step: "1",
    });
    sliderWrap.appendChild(slider);
    const flags = el("div", { class: "t-divergence-flags" });
    sliderWrap.appendChild(flags);
    root.appendChild(sliderWrap);

    const readout = el("div", { class: "t-readout" });
    root.appendChild(readout);

    const speed = el("select", { class: "t-speed", title: T("d.transport.speed") });
    for (const value of [0.5, 1, 2, 4]) {
      const option = el("option", { value: String(value) }, value + "×");
      if (value === 1) option.selected = true;
      speed.appendChild(option);
    }
    speed.addEventListener("change", () => {
      state.speed = Number(speed.value);
      if (state.playing) {
        pause();
        play();
      }
    });
    root.appendChild(speed);

    function render() {
      slider.value = String(state.beat);
      readout.innerHTML = T("d.transport.readout", { a: state.beat + 1, b: beats });
      btnPlay.textContent = state.playing ? "⏸" : "▶";
    }

    function seek(beat) {
      state.beat = Math.max(0, Math.min(beats - 1, beat));
      render();
      onSeek(state.beat);
    }

    function tick() {
      if (state.beat >= beats - 1) {
        pause();
        return;
      }
      seek(state.beat + 1);
    }

    function play() {
      if (state.playing) return;
      if (state.beat >= beats - 1) seek(0);
      state.playing = true;
      state.timer = setInterval(tick, 950 / state.speed);
      render();
    }

    function pause() {
      state.playing = false;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      render();
    }

    btnPlay.addEventListener("click", () => (state.playing ? pause() : play()));
    btnFirst.addEventListener("click", () => seek(0));
    btnPrev.addEventListener("click", () => seek(state.beat - 1));
    btnNext.addEventListener("click", () => seek(state.beat + 1));
    btnLast.addEventListener("click", () => seek(beats - 1));
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      pause();
      seek(value);
    });

    function setFlags(list) {
      flags.innerHTML = "";
      for (const flag of list) {
        if (!flag) continue;
        const marker = el("span", { class: "div-flag " + flag.kind, title: flag.title }, flag.label);
        marker.style.left = ((flag.beat + 0.5) / beats) * 100 + "%";
        marker.addEventListener("click", () => seek(flag.beat));
        flags.appendChild(marker);
      }
    }

    render();
    return { root, seek, play, pause, setFlags, state: () => state };
  }

  /* --------------------------- divergence summary --------------------------- */

  function divergenceCallouts(race) {
    const out = [];
    const retrieval = race.divergence.retrieval;
    if (retrieval) {
      const lacking = Object.entries(retrieval.values)
        .filter(([, has]) => has === false)
        .map(([backend]) => race.backend_meta[backend].label);
      const having = Object.entries(retrieval.values)
        .filter(([, has]) => has === true)
        .map(([backend]) => race.backend_meta[backend].label);
      if (lacking.length && having.length) {
        out.push({
          kind: "retrieval",
          beat: retrieval.beat,
          label: T("d.div.memsplit"),
          title: T("d.div.memsplit.title"),
          text: T("d.div.memsplit.text", {
            n: retrieval.beat + 1,
            lost: lacking.join(", "),
            held: having.join(", "),
          }),
        });
      }
    }
    const action = race.divergence.action;
    if (action) {
      const choices = Object.entries(action.values)
        .map(([backend, sig]) => race.backend_meta[backend].label + " " + fmtSig(String(sig)))
        .join("  ·  ");
      out.push({
        kind: "action",
        beat: action.beat,
        label: T("d.div.actsplit"),
        title: T("d.div.actsplit.title"),
        text: T("d.div.actsplit.text", { n: action.beat + 1, choices }),
      });
    }
    return out;
  }

  /* --------------------------------- race --------------------------------- */

  function createRacePlayer(container, options) {
    const study = options.study;
    const raceIndex = options.raceIndex;
    const loadRace = options.loadRace;

    const state = {
      cell: options.initial.cell,
      seed: options.initial.seed,
      race: null,
      transport: null,
    };

    const stageWrap = el("div", { class: "race-stage" });
    const explorer = el("div", { class: "race-explorer" });
    container.append(stageWrap, explorer);

    function segRow(label, values, current, onPick) {
      const row = el("div", { class: "explorer-row" });
      row.appendChild(el("span", { class: "control-label" }, label));
      const seg = el("div", { class: "seg" });
      for (const value of values) {
        const button = el(
          "button",
          { class: String(value.key) === String(current) ? "active" : "", title: value.title || "" },
          value.label
        );
        button.addEventListener("click", () => onPick(value.key));
        seg.appendChild(button);
      }
      row.appendChild(seg);
      return row;
    }

    function families() {
      const seen = [];
      for (const cellName of study.cell_order) {
        const family = study.cell_meta[cellName].family;
        if (!seen.includes(family)) seen.push(family);
      }
      return seen;
    }

    function cellsOf(family) {
      return study.cell_order.filter((cellName) => study.cell_meta[cellName].family === family);
    }

    function seedsOf(cell) {
      return raceIndex
        .filter((entry) => entry.cell === cell)
        .map((entry) => entry.seed)
        .sort((a, b) => a - b);
    }

    function renderExplorer() {
      explorer.innerHTML = "";
      explorer.appendChild(el("p", { class: "eyebrow" }, T("d.explorer.pick")));
      const family = study.cell_meta[state.cell].family;
      explorer.appendChild(
        segRow(
          T("d.explorer.scenario"),
          families().map((familyName) => ({
            key: familyName,
            label: (study.scenario_meta[familyName] || {}).name || familyName,
          })),
          family,
          (picked) => {
            const first = cellsOf(picked)[0];
            selectRace(first, seedsOf(first)[0]);
          }
        )
      );
      explorer.appendChild(
        segRow(
          T("d.explorer.challenge"),
          cellsOf(family).map((cellName) => ({
            key: cellName,
            label: study.cell_meta[cellName].short,
            title: study.cell_meta[cellName].description,
          })),
          state.cell,
          (picked) => selectRace(picked, seedsOf(picked)[0])
        )
      );
      explorer.appendChild(
        segRow(
          T("d.explorer.seed"),
          seedsOf(state.cell).map((seed) => ({
            key: seed,
            label: String(seed),
            title: T("d.explorer.seedtitle"),
          })),
          state.seed,
          (picked) => selectRace(state.cell, picked)
        )
      );
    }

    function selectRace(cell, seed) {
      state.cell = cell;
      state.seed = seed;
      renderExplorer();
      load();
    }

    function load() {
      const entry = raceIndex.find(
        (item) => item.cell === state.cell && item.seed === state.seed
      );
      if (!entry) {
        stageWrap.innerHTML = "";
        stageWrap.appendChild(el("div", { class: "error-box" }, T("d.race.norace")));
        return;
      }
      stageWrap.innerHTML = "";
      stageWrap.appendChild(el("div", { class: "loading" }, T("d.race.loading")));
      loadRace(entry.file)
        .then((race) => {
          state.race = race;
          renderStage(entry);
        })
        .catch(() => {
          stageWrap.innerHTML = "";
          stageWrap.appendChild(
            el("div", { class: "error-box" }, T("d.race.loadfail", { file: entry.file }))
          );
        });
    }

    function renderStage(entry) {
      const race = state.race;
      stageWrap.innerHTML = "";

      /* header: title + params + outcomes */
      const head = el("div", { class: "race-head" });
      head.appendChild(
        el("span", { class: "race-title" },
          T("d.race.title", { label: study.cell_meta[state.cell].label, seed: state.seed }))
      );
      const params = Object.entries(race.params)
        .filter(([key]) => !key.endsWith("_version"))
        .map(([key, value]) => paramPhrase(key, value))
        .join(" · ");
      head.appendChild(el("span", { class: "race-sub" }, params));
      const outcomes = el("div", { class: "race-outcomes" });
      for (const backend of race.backend_order) {
        const ok = entry.outcomes[backend];
        const chip = el("span", { class: "ro " + (ok ? "win" : "loss") });
        chip.appendChild(el("i", { style: "background:" + C.BACKEND_COLORS[backend] }));
        chip.appendChild(
          document.createTextNode(race.backend_meta[backend].short + " " + (ok ? "✓" : "✗"))
        );
        outcomes.appendChild(chip);
      }
      head.appendChild(outcomes);
      stageWrap.appendChild(head);

      /* divergence callout */
      const callouts = divergenceCallouts(race);
      for (const callout of callouts) {
        const box = el("div", { class: "divergence-callout" });
        box.textContent = callout.text;
        box.style.cursor = "pointer";
        box.title = T("d.div.jump");
        box.addEventListener("click", () => state.transport && state.transport.seek(callout.beat));
        stageWrap.appendChild(box);
      }

      /* lanes */
      const lanesRoot = el("div", { class: "lanes" });
      const lanes = {};
      for (const backend of race.backend_order) {
        const lane = race.lanes[backend];
        const meta = race.backend_meta[backend];
        const color = C.BACKEND_COLORS[backend];
        const laneEl = el("div", { class: "lane", style: "--lc:" + color });
        if (lane.status !== "present") {
          laneEl.classList.add("missing");
          const head2 = el("div", { class: "lane-head" });
          head2.appendChild(el("span", { class: "lane-dot", style: "background:" + color }));
          head2.appendChild(el("span", { class: "lane-name" }, meta.label));
          head2.appendChild(el("span", { class: "lane-verdict" }, lane.status));
          laneEl.appendChild(head2);
          laneEl.appendChild(el("div", { class: "retrieval-empty" }, T("d.lane.missing")));
          lanesRoot.appendChild(laneEl);
          continue;
        }
        const story = lane.story;
        const laneHead = el("div", { class: "lane-head" });
        laneHead.appendChild(el("span", { class: "lane-dot", style: "background:" + color }));
        laneHead.appendChild(el("span", { class: "lane-name" }, meta.label));
        const verdict = el("span", { class: "lane-verdict" }, T("d.lane.racing"));
        laneHead.appendChild(verdict);
        laneEl.appendChild(laneHead);

        const track = el("div", { class: "lane-track" });
        const ticks = [];
        story.frames.forEach((frame, index) => {
          const tick = el("span", {
            class: "lane-tick",
            title: T("d.lane.tick", {
              n: index + 1,
              phase: phaseLabel(frame.phase),
              action: frame.planner.action,
            }),
          });
          if (frame.retrieval.target_rank) {
            tick.appendChild(el("span", { class: "tick-dot", title: T("d.lane.tickdot") }));
          }
          tick.addEventListener("click", () => state.transport && state.transport.seek(index));
          ticks.push(tick);
          track.appendChild(tick);
        });
        laneEl.appendChild(track);

        const frameCard = el("div", { class: "lane-frame" });
        laneEl.appendChild(frameCard);

        const mapWrap = el("div", { class: "lane-map" });
        const map = C.svgEl("svg", { viewBox: "0 0 300 200" });
        mapWrap.appendChild(map);
        laneEl.appendChild(mapWrap);

        lanesRoot.appendChild(laneEl);
        lanes[backend] = { story, verdict, ticks, frameCard, map, color };
      }

      const beats = Math.max(1, race.beats);
      const transport = createTransport({ beats, onSeek: renderBeat });
      state.transport = transport;
      stageWrap.appendChild(transport.root);
      stageWrap.appendChild(lanesRoot);

      transport.setFlags(
        callouts.map((c) => ({ kind: c.kind, beat: c.beat, label: c.label, title: c.title }))
      );

      function renderBeat(beat) {
        for (const backend of Object.keys(lanes)) {
          const lane = lanes[backend];
          const story = lane.story;
          const frames = story.frames;
          const cursor = Math.min(beat, frames.length - 1);
          // A lane finishes when its final frame is reached; shorter lanes
          // hold their verdict while longer lanes are still racing.
          const done = beat >= frames.length - 1;
          const frame = frames[cursor];

          lane.ticks.forEach((tick, index) => {
            tick.classList.toggle("seen", index < cursor);
            tick.classList.toggle("now", index === cursor);
            tick.classList.toggle(
              "failed-now",
              index === cursor && frame.outcome.status === "failed"
            );
          });

          if (done) {
            lane.verdict.className =
              "lane-verdict " + (story.success ? "success" : "failure");
            lane.verdict.textContent = story.success
              ? T("d.lane.win")
              : story.attribution
                ? T("d.lane.fail", { reason: C.attribLabel(story.attribution) })
                : T("d.lane.failbare");
          } else {
            lane.verdict.className = "lane-verdict";
            lane.verdict.textContent = T("d.lane.step", { a: cursor + 1, b: frames.length });
          }

          lane.frameCard.innerHTML = "";
          lane.frameCard.appendChild(
            el(
              "div",
              { class: "frame-phase" },
              phaseLabel(frame.phase) +
                (frame.session ? " · " + frame.session : "") +
                " · " + T("d.pl.step", { n: frame.step })
            )
          );
          lane.frameCard.appendChild(retrievalEl(frame, 5));
          lane.frameCard.appendChild(plannerEl(frame));
          lane.frameCard.appendChild(outcomeEl(frame));
          lane.frameCard.appendChild(tokensEl(frame));

          C.renderMap(lane.map, story, frame.seq, { color: lane.color });
        }
      }

      renderBeat(0);
      if (options.autoplay) transport.play();
    }

    renderExplorer();
    load();

    return { selectRace, state: () => ({ cell: state.cell, seed: state.seed }) };
  }

  /* --------------------------------- replay --------------------------------- */

  function createReplayTheater(container, options) {
    const loadStory = options.loadStory;
    const cases = options.cases;

    const state = { caseIndex: options.initialCase || 0, story: null, transport: null };

    const controls = el("div", { class: "explorer-row", style: "margin-top:18px" });
    const layout = el("div", { class: "replay-layout" });
    container.append(controls, layout);

    function renderControls() {
      controls.innerHTML = "";
      controls.appendChild(el("span", { class: "control-label" }, T("d.replay.case")));
      const seg = el("div", { class: "seg" });
      cases.forEach((entry, index) => {
        const button = el(
          "button",
          { class: index === state.caseIndex ? "active" : "", title: entry.title },
          entry.label
        );
        button.addEventListener("click", () => {
          state.caseIndex = index;
          renderControls();
          load();
        });
        seg.appendChild(button);
      });
      controls.appendChild(seg);
    }

    function load() {
      const entry = cases[state.caseIndex];
      layout.innerHTML = "";
      layout.appendChild(el("div", { class: "loading" }, T("d.replay.loading")));
      loadStory(entry).then((story) => {
        state.story = story;
        renderTheater(entry);
      });
    }

    function renderTheater(entry) {
      const story = state.story;
      layout.innerHTML = "";

      /* left rail: goal + funnel + steps */
      const rail = el("div", { class: "replay-rail" });
      const goalBlock = el("div", { class: "rail-block" });
      goalBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.goal")));
      goalBlock.appendChild(el("div", { class: "fs-value" }, story.goal));
      rail.appendChild(goalBlock);

      const funnel = el("div", { class: "rail-block" });
      funnel.appendChild(
        el("div", { class: "rb-title" }, T("d.replay.offered", { n: story.memory.offered_total }))
      );
      const counts = story.memory.offered_counts;
      for (const role of Object.keys(counts).sort((a, b) => counts[b] - counts[a])) {
        const row = el("div", { class: "funnel-row" });
        row.appendChild(
          el("span", {
            style:
              "background:" + (C.ROLE_COLORS[role] || "#8d939e") +
              ";width:8px;height:8px;border-radius:2px;display:inline-block",
          })
        );
        row.appendChild(el("span", null, roleLabel(role)));
        row.appendChild(el("span", { class: "funnel-count" }, String(counts[role])));
        funnel.appendChild(row);
      }
      rail.appendChild(funnel);

      const salient = story.memory.salient || [];
      if (salient.length) {
        const salientBlock = el("div", { class: "rail-block" });
        salientBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.salient")));
        const list = el("div", { class: "retrieval-list" });
        for (const item of salient.slice(0, 12)) {
          const row = el("div", {
            class: "retrieval-item",
            style: "--rc:" + (C.ROLE_COLORS[item.role] || "#8d939e"),
          });
          row.appendChild(el("span", { class: "role" }, roleLabel(item.role)));
          row.appendChild(el("span", { class: "summary", title: item.summary }, item.summary));
          list.appendChild(row);
        }
        salientBlock.appendChild(list);
        rail.appendChild(salientBlock);
      }

      const stepsBlock = el("div", { class: "rail-block" });
      stepsBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.steps")));
      const stepList = el("div", { class: "step-list" });
      const stepEntries = [];
      story.frames.forEach((frame, index) => {
        const entryEl = el("div", { class: "step-entry" });
        const statusLabel = T("d.status." + frame.outcome.status);
        entryEl.appendChild(el("span", {
          class: "se-status " + frame.outcome.status,
        }, statusLabel === "d.status." + frame.outcome.status ? frame.outcome.status : statusLabel));
        entryEl.appendChild(el("span", null, "#" + (index + 1) + " " + frame.planner.action));
        entryEl.addEventListener("click", () => state.transport && state.transport.seek(index));
        stepEntries.push(entryEl);
        stepList.appendChild(entryEl);
      });
      stepsBlock.appendChild(stepList);
      rail.appendChild(stepsBlock);
      layout.appendChild(rail);

      /* center stage */
      const stage = el("div", { class: "replay-stage" });
      const grid = el("div", { class: "replay-frame-grid" });
      const retrievalCard = el("div", { class: "replay-card" });
      const plannerCard = el("div", { class: "replay-card" });
      const outcomeCard = el("div", { class: "replay-card wide" });
      grid.append(retrievalCard, plannerCard, outcomeCard);
      stage.appendChild(grid);
      layout.appendChild(stage);

      /* right side: map + probes + totals */
      const side = el("div", { class: "replay-side" });
      const mapBlock = el("div", { class: "rail-block" });
      mapBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.map")));
      const map = C.svgEl("svg", { viewBox: "0 0 300 200" });
      mapBlock.appendChild(map);
      const legend = el("div", { class: "map-legend" });
      for (const [key, color] of [
        ["target", C.ROLE_COLORS.target],
        ["current", C.ROLE_COLORS.current],
        ["stale", C.ROLE_COLORS.stale],
        ["distractor", C.ROLE_COLORS.distractor],
      ]) {
        const item = el("span");
        item.appendChild(el("i", { style: "background:" + color }));
        item.appendChild(document.createTextNode(T("d.legend." + key)));
        legend.appendChild(item);
      }
      mapBlock.appendChild(legend);
      side.appendChild(mapBlock);

      const probesBlock = el("div", { class: "rail-block" });
      probesBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.probes")));
      if (!story.probes.length) {
        probesBlock.appendChild(el("div", { class: "fs-value mono" }, "N/A"));
      }
      for (const probe of story.probes) {
        const row = el("div", { class: "probe-row" });
        row.appendChild(
          el("span", null, T("d.replay.probe", { phase: probe.phase, n: probe.item_count }))
        );
        row.appendChild(
          el("b", null, probe.target_rank
            ? T("d.replay.atrank", { r: probe.target_rank })
            : T("d.replay.missing"))
        );
        probesBlock.appendChild(row);
      }
      side.appendChild(probesBlock);

      const metricsBlock = el("div", { class: "rail-block" });
      metricsBlock.appendChild(el("div", { class: "rb-title" }, T("d.replay.totals")));
      const totals = [
        [T("d.replay.success"), story.success ? T("d.yes") : T("d.no")],
        [T("d.replay.why"), story.attribution ? C.attribLabel(story.attribution) : "—"],
        [T("d.replay.tokin"), story.tokens.prompt.toLocaleString()],
        [T("d.replay.tokout"), story.tokens.completion.toLocaleString()],
        [
          T("d.replay.avgret"),
          story.metrics.avg_retrieve_latency_ms != null
            ? C.fmt(story.metrics.avg_retrieve_latency_ms, 1) + " ms"
            : "N/A",
        ],
        [
          T("d.replay.avgadd"),
          story.metrics.avg_add_latency_ms != null
            ? C.fmt(story.metrics.avg_add_latency_ms, 1) + " ms"
            : "N/A",
        ],
      ];
      for (const [key, value] of totals) {
        const row = el("div", { class: "probe-row" });
        row.appendChild(el("span", null, key));
        row.appendChild(el("b", null, value));
        metricsBlock.appendChild(row);
      }
      side.appendChild(metricsBlock);
      layout.appendChild(side);

      const beats = Math.max(1, story.frames.length);
      const transport = createTransport({ beats, onSeek: renderBeat });
      state.transport = transport;
      stage.appendChild(transport.root);

      function renderBeat(beat) {
        const cursor = Math.min(beat, story.frames.length - 1);
        const frame = story.frames[cursor];
        stepEntries.forEach((entryEl, index) =>
          entryEl.classList.toggle("active", index === cursor)
        );
        retrievalCard.innerHTML = "";
        retrievalCard.appendChild(
          el(
            "div",
            { class: "frame-phase" },
            phaseLabel(frame.phase) + (frame.session ? " · " + frame.session : "") +
              " · " + T("d.pl.step", { n: frame.step })
          )
        );
        retrievalCard.appendChild(retrievalEl(frame, 12));
        plannerCard.innerHTML = "";
        plannerCard.appendChild(el("div", { class: "frame-phase" }, T("d.planner")));
        plannerCard.appendChild(plannerEl(frame));
        plannerCard.appendChild(tokensEl(frame));
        outcomeCard.innerHTML = "";
        outcomeCard.appendChild(outcomeEl(frame));
        C.renderMap(map, story, frame.seq, { color: C.BACKEND_COLORS[story.backend] });
      }

      renderBeat(0);
      if (options.autoplay) transport.play();
    }

    renderControls();
    load();

    return { state: () => ({ caseIndex: state.caseIndex }) };
  }

  return { createRacePlayer, createReplayTheater };
})();
