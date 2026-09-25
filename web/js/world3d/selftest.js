// In-browser smoke test for the 3D client, started with ?selftest=1. With a --dev server it tours
// every location (peaceful dev teleports), checks each room against the engine's view of it, runs a
// fight through the presenter, and watches GPU memory for leaks. Results land in window.__selftest
// and in a small overlay; the game state is returned to where it started.
import { act, getState } from "../app.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// renderer.info only counts geometry once it has been drawn, so let a few frames go by before sampling.
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))));

async function until(fn, ms = 6000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
}

function overlay(report) {
  let el = document.getElementById("selftest-report");
  if (!el) {
    el = document.createElement("div");
    el.id = "selftest-report";
    el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:420px;max-height:40vh;overflow:auto;" +
      "background:#120e0bf0;color:#e8d8b8;border:1px solid #6a5334;padding:8px 10px;font:12px/1.4 monospace;white-space:pre-wrap;pointer-events:auto";
    document.body.appendChild(el);
  }
  const bad = report.checks.filter((c) => !c.ok);
  el.textContent = `3D selftest: ${report.done ? (report.ok ? "PASS" : "FAIL") : "running…"}\n` +
    `${report.checks.length - bad.length}/${report.checks.length} checks ok · ${report.rooms} rooms · ${report.errors.length} errors\n` +
    [...bad.map((c) => `✗ ${c.name}: ${c.detail}`), ...report.errors.map((e) => `! ${e}`), ...report.notes.map((n) => `· ${n}`)].join("\n");
}

export async function runSelftest(world) {
  const report = { done: false, ok: false, rooms: 0, checks: [], errors: [], notes: [], timings: {} };
  window.__selftest = report;
  const check = (name, ok, detail = "") => { report.checks.push({ name, ok: !!ok, detail }); overlay(report); };
  const onErr = (e) => report.errors.push(String(e.message || e.reason || e));
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  overlay(report);

  try {
    await until(() => getState(), 10000);
    let st = getState();
    check("renderer", world.renderer.getContext() && !world.renderer.getContext().isContextLost(), "WebGL context lost");
    if (!st?.player || !st.location) {
      report.notes.push("No game in progress: start or load one, then reload with ?selftest=1 for the full run.");
      return;
    }
    await until(() => world.room?.loc === st.location.id);
    checkRoom(world, st, check);
    if (!st.dev) {
      report.notes.push("Server is not in --dev mode: only the current room was checked.");
      return;
    }
    if (st.mode === "combat") await act({ action: "debug_end_combat" });
    const home = getState().location.id;

    const geo0 = world.renderer.info.memory.geometries;
    const t0 = performance.now();
    for (const L of getState().debug.locations) {
      const r = await act({ action: "debug_teleport", to: L.id, peaceful: 1 });
      if (r?.error) { check(`teleport ${L.id}`, false, r.error); continue; }
      const built = await until(() => world.room?.loc === L.id && getState().location?.id === L.id);
      check(`room ${L.id}`, built, "room did not build");
      if (built) { checkRoom(world, getState(), check, true); report.rooms++; }
    }
    report.timings.tourMs = Math.round(performance.now() - t0);

    await act({ action: "debug_teleport", to: home, peaceful: 1 });
    await until(() => world.room?.loc === home);
    await settle();
    const geoHome = world.renderer.info.memory.geometries;
    for (const to of [report.rooms > 1 ? getState().debug.locations[0].id : home, home]) {
      await act({ action: "debug_teleport", to, peaceful: 1 });
      await until(() => world.room?.loc === to);
      await settle();
    }
    const geoAgain = world.renderer.info.memory.geometries;
    check("no geometry leak on room change", geoAgain <= geoHome + 2, `${geoHome} → ${geoAgain} (start ${geo0})`);

    const encs = getState().debug.encounters || [];
    const enc = encs.find((e) => e === "enc_kd_crawlers") || encs.find((e) => !/boss|lord|matriarch|oath/i.test(e)) || encs[0];
    if (enc) {
      report.notes.push(`Combat check used ${enc}.`);
      // Two identical fights: the first may upload room geometry the tactical camera sees for the
      // first time, so only growth between the first and second pass counts as a leak.
      const after = [];
      for (let pass = 0; pass < 2; pass++) {
        await act({ action: "debug_heal" });
        await act({ action: "debug_encounter", enc });
        const started = await until(() => getState().mode === "combat" && world.combat.active && world.combat.recs.size > 0);
        if (pass === 0) check("combat presenter starts", started, `mode ${getState().mode}`);
        if (started && pass === 0) {
          const units = getState().combat.units.length;
          check("every combat unit has a model", world.combat.recs.size === units, `${world.combat.recs.size}/${units}`);
          await until(() => !world.combatBusy, 8000);
          check("combat playback settles", !world.combatBusy, "presenter still busy after 8 s");
        } else {
          await until(() => !world.combatBusy, 8000);
        }
        if (getState().mode === "combat") await act({ action: "debug_end_combat" });
        await until(() => getState().mode === "explore" && !world.combat.active);
        await sleep(1500);
        await settle();
        if (pass === 0) check("combat cleans up", world.combat.recs.size === 0 && world.cam.mode === "follow", `recs ${world.combat.recs.size}, camera ${world.cam.mode}`);
        after.push(world.renderer.info.memory.geometries);
      }
      check("no geometry leak after combat", after[1] <= after[0] + 2, `${after[0]} → ${after[1]}`);
    }
    report.notes.push(`Toured ${report.rooms} rooms in ${(report.timings.tourMs / 1000).toFixed(1)} s; now back at ${home}.`);
  } catch (e) {
    onErr(e);
  } finally {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onErr);
    report.done = true;
    report.ok = report.errors.length === 0 && report.checks.every((c) => c.ok);
    overlay(report);
    console.info("[selftest]", report.ok ? "PASS" : "FAIL", report);
  }
}

function checkRoom(world, st, check, quiet = false) {
  const room = world.room, loc = st.location;
  const id = loc.id;
  const fails = [];
  for (const e of loc.exits || []) if (!room.doors[e.to]) fails.push(`no door to ${e.to}`);
  for (const n of loc.npcs || []) if (!room.npcSpots[n.id]) fails.push(`no spot for ${n.id}`);
  for (const f of loc.features || []) {
    const s = room.featureSpots[f.id];
    if (!s) fails.push(`no anchor for ${f.id}`);
    else if (room.layout.authored && s.auto) fails.push(`${f.id} auto-placed in an authored room`);
  }
  const probe = room.col && loc.exits?.length ? room.doors[loc.exits[0].to]?.inside : null;
  if (probe && room.col.blocked?.(probe.x, probe.z, 0.4)) fails.push("door approach is blocked");
  if (!quiet || fails.length) check(`room ${id} matches engine`, !fails.length, fails.join("; "));
}
