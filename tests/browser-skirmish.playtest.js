async (page) => {
  const results = [];
  const check = (condition, label, detail = '') => {
    if (!condition) throw new Error(`${label}: ${detail}`);
    results.push({ check: label, result: 'passed', detail });
  };
  const read = () => page.evaluate(() => ({ ...__game.state, entities: __game.state.entities.map(e => ({ ...e })), selected: [...__app.selected] }));
  const advance = async seconds => {
    await page.evaluate(seconds => __game.update(seconds), seconds);
    await page.waitForTimeout(160);
  };
  const clickEntity = async id => {
    const p = await page.evaluate(id => {
      const e = __game.state.entities.find(e => e.id === id);
      const p = __view.project(e.x, e.z);
      for (let y = -8; y > -150; y -= 4) for (let x = -36; x <= 36; x += 4) {
        if (__view.pick(p.x + x, p.y + y) === id) return { x: p.x + x, y: p.y + y };
      }
      throw new Error(`Entity ${id} not pickable`);
    }, id);
    await page.mouse.click(p.x, p.y);
  };
  const build = async (workerId, key, x, z) => {
    await page.keyboard.press('h');
    await clickEntity(workerId);
    await page.keyboard.press(key);
    const p = await page.evaluate(({ x, z }) => __view.project(x, z), { x, z });
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  };
  await page.goto('http://localhost:3002');
  await page.waitForFunction(() => window.__game && window.__view);
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  let s = await read();
  const workers = s.entities.filter(e => e.kind === 'worker' && e.team === 'player');
  await build(workers[0].id, 'b', -12, 27);
  await advance(32);
  s = await read();
  const barracks = s.entities.find(e => e.kind === 'barracks');
  check(barracks?.buildProgress === 1, 'Constructed Barracks through canvas controls');
  await build(workers[2].id, 'f', -17, 36);
  await advance(20);
  s = await read();
  check(s.entities.some(e => e.kind === 'farm' && e.buildProgress === 1) && s.foodCap === 30, 'Developed supply infrastructure with harvested resources');
  await page.keyboard.press('h');
  await clickEntity(barracks.id);
  for (const [kind, hotkey] of [['footman', 't'], ['footman', 't'], ['archer', 'r'], ['footman', 't']]) {
    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(kind => __game.canAfford(kind), kind)) break;
      await advance(5);
    }
    await page.keyboard.press(hotkey);
    const after = await read();
    check(after.entities.find(e => e.id === barracks.id).queue.some(item => item.kind === kind), `Queued ${kind} with documented training hotkey`);
  }
  await page.screenshot({ path: 'public/evidence/base-development.png' });
  for (let waited = 0; waited < 120; waited += 4) {
    s = await read();
    if (s.entities.filter(e => e.team === 'player' && e.kind === 'footman').length === 7 && s.entities.some(e => e.team === 'player' && e.kind === 'archer')) break;
    await advance(4);
  }
  s = await read();
  check(s.entities.filter(e => e.team === 'player' && e.kind === 'footman').length === 7 && s.entities.some(e => e.team === 'player' && e.kind === 'archer'), 'Training produces a mixed 3D army');

  // Navigate using the actual minimap, not a direct camera API call.
  const maps = await page.locator('canvas').evaluateAll(elements => elements.map(el => ({ id: el.id, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })).filter(el => el.width > 80 && el.width < 350 && el.height > 70));
  check(maps.length === 1, 'Visible minimap available for strategic navigation');
  const m = maps[0];
  await page.mouse.click(m.x + m.width * (29 + 55) / 110, m.y + m.height * (-28 + 55) / 110);
  const focus = await page.evaluate(() => ({ ...__view.center }));
  check(Math.hypot(focus.x - 29, focus.z + 28) < 8, 'Minimap click navigates to the enemy fortress');
  const focusMap = async (x, z) => {
    const m = await page.evaluate(() => { const r = document.getElementById('minimap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.mouse.click(m.x + m.w * (x + 55) / 110, m.y + m.h * (z + 55) / 110);
    await page.waitForTimeout(300);
  };
  const clickGround = async (x, z, label) => {
    await focusMap(x, z);
    const pt = await page.evaluate(({ x, z }) => __view.project(x, z), { x, z });
    const hitCanvas = await page.evaluate(p => {
      const el = document.elementFromPoint(p.x, p.y);
      return el?.tagName === 'CANVAS' && el.closest('#battlefield') ? true : (el?.outerHTML || 'none').slice(0, 120);
    }, pt);
    check(hitCanvas === true, `${label} is clickable on the 3D canvas (no HUD overlay blocks orders)`, typeof hitCanvas === 'string' ? hitCanvas : 'canvas');
    await page.mouse.click(pt.x, pt.y);
  };
  await page.getByRole('button', { name: 'Army', exact: true }).click();
  await page.keyboard.press('a');
  // Phase 1: attack-move onto open ground by the fortress gates so the army clears defenders first.
  await clickGround(24, -20, 'Staging ground outside the fortress');
  s = await read();
  check(s.selected.length >= 5 && s.selected.every(id => ['hero', 'footman', 'archer'].includes(s.entities.find(e => e.id === id)?.kind)) && s.selected.some(id => ['attackMove', 'attack'].includes(s.entities.find(e => e.id === id)?.order?.type)), 'Commanded the reinforced army against the enemy', `${s.selected.length} units selected`);

  let spellCount = 0;
  let combatCaptured = false;
  const castWhenReady = async () => {
    const hero = (await read()).entities.find(e => e.kind === 'hero' && e.team === 'player');
    const near = (await read()).entities.some(e => e.team === 'enemy' && hero && Math.hypot(e.x - hero.x, e.z - hero.z) < 10);
    if (hero && hero.spellCooldown <= 0 && near) {
      await page.keyboard.press('Space');
      await page.keyboard.press('q');
      spellCount++;
      await page.waitForTimeout(60);
      if (!combatCaptured) {
        await page.screenshot({ path: 'public/evidence/combat.png' });
        combatCaptured = true;
      }
      await page.keyboard.press('Control+a');
    }
  };
  for (let waited = 0; waited < 100; waited += 4) {
    await advance(4);
    s = await read();
    if (s.status !== 'playing') break;
    await castWhenReady();
    if (s.kills >= 3) break;
  }
  s = await read();
  check(s.kills >= 3, 'Attack-move clears the fortress defenders', `${s.kills} enemies defeated`);
  // Phase 2: click the stronghold itself for the killing blow.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('a');
  await clickGround(29, -26, 'Enemy stronghold');
  for (let waited = 0; waited < 150; waited += 4) {
    await advance(4);
    s = await read();
    if (s.status !== 'playing') break;
    await castWhenReady();
  }
  s = await read();
  check(spellCount > 0, 'Hero Sunburst used through keyboard input', `${spellCount} casts`);
  check(s.status === 'victory' && !s.entities.some(e => e.kind === 'stronghold') && s.entities.some(e => e.kind === 'hall'), 'Complete economy → build → train → command → combat → victory loop', `${s.time.toFixed(1)} simulated seconds; ${s.kills} enemies defeated`);
  await page.screenshot({ path: 'public/evidence/victory.png' });
  const victoryTime = s.time;
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  s = await read();
  check(s.status === 'playing' && s.time < 2 && s.entities.some(e => e.kind === 'stronghold') && !s.entities.some(e => e.kind === 'barracks'), 'Visible restart restores a fresh skirmish after victory');

  await advance(360);
  s = await read();
  check(s.status === 'defeat' && !s.entities.some(e => e.kind === 'hall'), 'Escalating enemy raids defeat an unattended settlement', `${s.time.toFixed(1)} simulated seconds`);
  await page.screenshot({ path: 'public/evidence/defeat.png' });
  const defeatTime = s.time;
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  s = await read();
  check(s.status === 'playing' && s.time < 2 && s.gold >= 350 && s.entities.filter(e => e.kind === 'worker').length === 4 && s.entities.some(e => e.kind === 'hall'), 'Visible restart also recovers from defeat');
  await page.screenshot({ path: 'public/evidence/battlefield.png' });
  return { method: 'Actual canvas selection/building placement, training hotkeys, minimap click, army attack and hero spell input. game.update advances unchanged simulation rules to shorten waits. No resource/stat grants, enemy deletion or status overrides.', victoryTime, defeatTime, checks: results };
}
