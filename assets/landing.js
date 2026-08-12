/* MineMemBench — landing page: one-click replay of a frozen four-system race.
   Every frame comes from data/races/*.json (frozen Formal V1 evidence);
   the animation only reveals it step by step. */
(function () {
  "use strict";

  const I = window.MMBI18N;
  const C = window.MMBCharts;
  const el = C.el;

  const SCENARIOS = [
    { cell: "lifetime_l2", seed: 1012 },
    { cell: "world_update_depth3", seed: 1020 },
    { cell: "noise_50", seed: 1011 },
    { cell: "delayed_200_20", seed: 1016 },
  ];

  const STEP_MS = 900;

  const state = {
    scenario: SCENARIOS[0],
    entry: null,
    race: null,
    step: -1,          /* -1 = not started */
    playing: false,
    timer: null,
  };

  const dom = {};
  let raceIndex = null;

  function fetchJson(path) {
    return fetch(path).then((response) => {
      if (!response.ok) throw new Error("failed to load " + path);
      return response.json();
    });
  }

  /* ------------------------------ static frame ------------------------------ */

  function renderScenarioButtons() {
    dom.scenarios.innerHTML = "";
    for (const scenario of SCENARIOS) {
      const button = el(
        "button",
        { class: scenario.cell === state.scenario.cell ? "active" : "", type: "button" },
        I.t("l.scenario." + scenario.cell)
      );
      button.addEventListener("click", () => {
        if (scenario.cell === state.scenario.cell) return;
        stopTimer();
        state.scenario = scenario;
        state.step = -1;
        state.playing = false;
        renderScenarioButtons();
        loadRace();
      });
      dom.scenarios.appendChild(button);
    }
  }

  function holdsFact(race, backend, step) {
    const lane = race.lanes[backend];
    if (!lane || lane.status !== "present") return false;
    const frames = lane.story.frames;
    const frame = frames[Math.min(step, frames.length - 1)];
    return frame ? frame.retrieval.target_rank != null : false;
  }

  function renderStatic() {
    const race = state.race;
    dom.concl.hidden = true;
    dom.narr.textContent = "";
    dom.stepLabel.textContent = "";
    dom.flags.innerHTML = "";
    dom.lanes.innerHTML = "";
    dom.grid.innerHTML = "";
    if (!race) return;

    const beats = race.beats;

    /* lanes: name + tick track + status chip */
    for (const backend of race.backend_order) {
      const lane = race.lanes[backend];
      const meta = race.backend_meta[backend];
      const color = C.BACKEND_COLORS[backend];
      const row = el("div", { class: "live-lane", style: "--lc:" + color });
      row.appendChild(el("span", { class: "ll-dot", style: "background:" + color }));
      row.appendChild(el("span", { class: "ll-name" }, meta.label));
      const track = el("div", { class: "ll-track" });
      const ticks = [];
      const nFrames = lane.status === "present" ? lane.story.frames.length : 1;
      for (let i = 0; i < Math.max(beats, nFrames); i++) {
        const tick = el("span", { class: "ll-tick" });
        track.appendChild(tick);
        ticks.push(tick);
      }
      row.appendChild(track);
      const chip = el("span", { class: "ll-chip" }, I.t("l.lane.waiting"));
      row.appendChild(chip);
      dom.lanes.appendChild(row);
      lane._ui = { ticks, chip };
    }

    /* grid: rows = systems, columns = steps */
    const grid = dom.grid;
    grid.style.gridTemplateColumns = "110px repeat(" + beats + ", 1fr)";
    grid.appendChild(el("span", { class: "lg-corner" }));
    for (let s = 0; s < beats; s++) {
      grid.appendChild(el("span", { class: "lg-stepnum" }, String(s + 1)));
    }
    for (const backend of race.backend_order) {
      const meta = race.backend_meta[backend];
      const label = el("span", { class: "lg-name", style: "color:" + C.BACKEND_COLORS[backend] }, meta.label);
      grid.appendChild(label);
      race.lanes[backend]._ui.cells = [];
      for (let s = 0; s < beats; s++) {
        const cell = el("span", { class: "lg-cell" });
        grid.appendChild(cell);
        race.lanes[backend]._ui.cells.push(cell);
      }
    }

    /* divergence flags appear under the grid at their step */
    const div = race.divergence || {};
    const flags = [
      div.retrieval ? { beat: div.retrieval.beat, key: "l.grid.split.memory", kind: "memory" } : null,
      div.action ? { beat: div.action.beat, key: "l.grid.split.behavior", kind: "action" } : null,
    ].filter(Boolean);
    for (const flag of flags) {
      const marker = el(
        "span",
        { class: "live-flag " + flag.kind, title: I.t(flag.key) },
        I.t(flag.key)
      );
      marker.style.left = "calc(110px + (100% - 110px) * " + ((flag.beat + 0.5) / beats) + ")";
      marker.dataset.beat = String(flag.beat);
      dom.flags.appendChild(marker);
    }

    syncPlayButton();
  }

  /* ------------------------------ per-step paint ---------------------------- */

  function paintStep() {
    const race = state.race;
    if (!race) return;
    const beats = race.beats;
    const step = state.step;

    if (step >= 0) {
      dom.stepLabel.textContent = I.t("l.exp.step", { a: step + 1, b: beats });
    }

    const held = [];
    const lost = [];
    for (const backend of race.backend_order) {
      const lane = race.lanes[backend];
      const ui = lane._ui;
      const frames = lane.status === "present" ? lane.story.frames : [];
      const cursor = Math.min(Math.max(step, 0), Math.max(frames.length - 1, 0));
      const finished = step >= 0 && (step >= frames.length - 1 || step >= beats - 1);
      const holds = lane.status === "present" && frames[cursor] &&
        frames[cursor].retrieval.target_rank != null;

      ui.ticks.forEach((tick, i) => {
        tick.classList.toggle("seen", i < step);
        tick.classList.toggle("now", i === step);
      });
      ui.cells.forEach((cell, i) => {
        if (i > step) {
          cell.className = "lg-cell";
          cell.removeAttribute("title");
          return;
        }
        const holdsAtI = holdsFact(race, backend, i);
        cell.className = "lg-cell " + (holdsAtI ? "holds" : "lost");
        cell.style.setProperty("--lc", C.BACKEND_COLORS[backend]);
        cell.title = race.backend_meta[backend].label + " · " +
          I.t(holdsAtI ? "l.grid.holds" : "l.grid.lost");
      });

      if (step < 0) {
        chip_reset(ui.chip);
      } else if (finished) {
        const success = lane.status === "present" && lane.story.success;
        ui.chip.className = "ll-chip " + (success ? "win" : "loss");
        if (success) {
          ui.chip.textContent = I.t("l.lane.win");
        } else {
          const reason = lane.story && lane.story.attribution
            ? I.t("d.attrib." + lane.story.attribution)
            : "";
          ui.chip.textContent = I.t("l.lane.fail", { reason: reason });
        }
      } else {
        ui.chip.className = "ll-chip " + (holds ? "holds" : "lost");
        ui.chip.textContent = I.t(holds ? "l.lane.holds" : "l.lane.lost");
      }

      (holds ? held : lost).push(race.backend_meta[backend].label);
    }

    for (const marker of dom.flags.children) {
      marker.classList.toggle("active", step >= Number(marker.dataset.beat));
    }

    if (step >= 0 && step < beats - 1) {
      dom.narr.textContent = lost.length === 0
        ? I.t("l.narr.allheld", { n: step + 1 })
        : I.t("l.narr.some", { n: step + 1, held: held.join(", "), lost: lost.join(", ") });
    } else if (step >= beats - 1) {
      const winners = race.backend_order
        .filter((b) => race.lanes[b].status === "present" && race.lanes[b].story.success)
        .map((b) => race.backend_meta[b].label);
      const losers = race.backend_order
        .filter((b) => !(race.lanes[b].status === "present" && race.lanes[b].story.success))
        .map((b) => race.backend_meta[b].label);
      dom.narr.textContent = losers.length === 0
        ? I.t("l.narr.end.allwin")
        : I.t("l.narr.end", { winners: winners.join(", "), losers: losers.join(", ") });
      document.getElementById("concl-body").textContent =
        I.t("l.concl." + state.scenario.cell);
      dom.concl.hidden = false;
    }
  }

  function chip_reset(chip) {
    chip.className = "ll-chip";
    chip.textContent = I.t("l.lane.waiting");
  }

  /* -------------------------------- transport ------------------------------- */

  function syncPlayButton() {
    const button = dom.play;
    if (state.playing) {
      button.textContent = I.t("l.exp.pause");
    } else if (state.step < 0) {
      button.textContent = I.t("l.exp.play");
    } else if (state.race && state.step >= state.race.beats - 1) {
      button.textContent = I.t("l.exp.restart");
    } else {
      button.textContent = I.t("l.exp.resume");
    }
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function tick() {
    if (!state.race || state.step >= state.race.beats - 1) {
      state.playing = false;
      stopTimer();
      syncPlayButton();
      return;
    }
    state.step += 1;
    paintStep();
  }

  function onPlayClick() {
    if (!state.race) return;
    if (state.playing) {
      state.playing = false;
      stopTimer();
      syncPlayButton();
      return;
    }
    if (state.step >= state.race.beats - 1) {
      /* restart */
      state.step = -1;
      dom.concl.hidden = true;
      dom.narr.textContent = "";
      paintStep();
    }
    state.playing = true;
    syncPlayButton();
    tick();
    state.timer = setInterval(tick, STEP_MS);
  }

  /* ---------------------------------- load ---------------------------------- */

  function loadRace() {
    const entry = raceIndex.find(
      (item) => item.cell === state.scenario.cell && item.seed === state.scenario.seed
    );
    if (!entry) return;
    state.entry = entry;
    state.race = null;
    dom.lanes.innerHTML = "";
    dom.grid.innerHTML = "";
    dom.narr.textContent = I.t("l.exp.loading");
    fetchJson("data/" + entry.file).then((race) => {
      state.race = race;
      renderStatic();
      paintStep();
    });
  }

  function boot() {
    dom.scenarios = document.getElementById("scenario-seg");
    dom.play = document.getElementById("exp-play");
    dom.stepLabel = document.getElementById("exp-step");
    dom.lanes = document.getElementById("live-lanes");
    dom.grid = document.getElementById("live-grid");
    dom.flags = document.getElementById("live-flags");
    dom.narr = document.getElementById("live-narr");
    dom.concl = document.getElementById("concl-card");

    document.getElementById("lang-mount").appendChild(I.makeLangButton());
    dom.play.addEventListener("click", onPlayClick);

    I.applyToDom(document);
    I.onChange(() => {
      renderScenarioButtons();
      renderStatic();
      paintStep();
      I.applyToDom(document);
    });

    renderScenarioButtons();
    fetchJson("data/races/index.json").then((index) => {
      raceIndex = index;
      loadRace();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
