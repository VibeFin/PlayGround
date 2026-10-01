async (page) => {
  const results = [];
  const browserErrors = [];
  const onError = error => browserErrors.push(error.message);
  page.on('pageerror', onError);
  const check = (condition, label, detail = '') => {
    if (!condition) throw new Error(`${label}: ${detail}`);
    results.push({ check: label, result: 'passed', detail });
  };
  const state = () => page.evaluate(() => ({
    gold: __game.state.gold, lumber: __game.state.lumber, food: __game.state.food,
    foodCap: __game.state.foodCap, status: __game.state.status, time: __game.state.time,
    entities: __game.state.entities.map(e => ({ ...e })),
    selected: [...__app.selected], mode: __app.mode,
  }));
  const advance = seconds => page.evaluate(seconds => {
    for (let t = 0; t < seconds; t += .05) __game.update(.05);
  }, seconds);
  const point = (x, z) => page.evaluate(({ x, z }) => __view.project(x, z), { x, z });
  const clickEntity = async (id, button = 'left') => {
    const p = await page.evaluate(id => {
      const entity = __game.state.entities.find(e => e.id === id);
      if (!entity) throw new Error(`Entity ${id} is gone`);
      const center = __view.project(entity.x, entity.z);
      for (let dy = -12; dy >= -140; dy -= 4) {
        for (let dx = -32; dx <= 32; dx += 4) {
          const p = { x: center.x + dx, y: center.y + dy };
          if (__view.pick(p.x, p.y) === id) return p;
        }
      }
      if (__view.pick(center.x, center.y) === id) return center;
      throw new Error(`Entity ${id} cannot be picked at ${JSON.stringify(center)}`);
    }, id);
    await page.mouse.click(p.x, p.y, { button });
  };
  await page.goto('http://localhost:3002');
  await page.waitForFunction(() => window.__game && window.__view && __game.state.entities.length > 10);
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  let s = await state();
  check(s.status === 'playing' && s.entities.some(e => e.kind === 'hall'), 'Playable skirmish starts with a base');
  const armyBounds = await page.evaluate(() => {
    const points = __game.state.entities.filter(e => e.team === 'player' && ['hero', 'footman'].includes(e.kind)).map(e => __view.project(e.x, e.z));
    return { left: Math.min(...points.map(p => p.x)) - 20, right: Math.max(...points.map(p => p.x)) + 20, top: Math.min(...points.map(p => p.y)) - 30, bottom: Math.max(...points.map(p => p.y)) + 8 };
  });
  await page.mouse.move(armyBounds.left, armyBounds.top);
  await page.mouse.down();
  await page.mouse.move(armyBounds.right, armyBounds.bottom, { steps: 8 });
  await page.mouse.up();
  s = await state();
  check(s.selected.filter(id => ['hero', 'footman'].includes(s.entities.find(e => e.id === id)?.kind)).length >= 4, 'Drag box selects a group of 3D combat units');
  const worker = s.entities.find(e => e.team === 'player' && e.kind === 'worker');
  const mine = s.entities.find(e => e.kind === 'goldmine' && Math.hypot(e.x + 28, e.z - 26) < 30);
  await clickEntity(worker.id);
  s = await state();
  check(s.selected.includes(worker.id), 'Canvas click selects a worker');
  await clickEntity(mine.id, 'right');
  s = await state();
  check(s.entities.find(e => e.id === worker.id).order?.type === 'gather', 'Right-click mine assigns gathering');
  const goldBefore = s.gold;
  await advance(20);
  s = await state();
  check(s.gold > goldBefore, 'Workers return mined gold to the economy', `${goldBefore} → ${s.gold}`);

  await page.keyboard.press('h');
  const tree = s.entities.filter(e => e.kind === 'tree').sort((a, b) => Math.hypot(a.x + 28, a.z - 26) - Math.hypot(b.x + 28, b.z - 26))[0];
  await clickEntity(worker.id);
  await clickEntity(tree.id, 'right');
  const lumberBefore = (await state()).lumber;
  await advance(20);
  s = await state();
  check(s.lumber > lumberBefore, 'Workers harvest and deposit lumber', `${lumberBefore} → ${s.lumber}`);

  await page.keyboard.press('h');
  await clickEntity(worker.id);
  const beforeCap = s.foodCap;
  await page.keyboard.press('f');
  check((await state()).mode === 'build:farm', 'Farm hotkey enters placement mode');
  const buildPoint = await point(-15, 31);
  await page.mouse.move(buildPoint.x, buildPoint.y);
  await page.mouse.click(buildPoint.x, buildPoint.y);
  s = await state();
  const farm = s.entities.find(e => e.kind === 'farm' && Math.hypot(e.x + 15, e.z - 31) < 3);
  check(!!farm && farm.buildProgress < 1, 'Canvas placement creates a paid construction site');
  await advance(22);
  s = await state();
  check(s.foodCap > beforeCap, 'Completed farm increases army supply', `${beforeCap} → ${s.foodCap}`);

  await page.keyboard.press('Space');
  s = await state();
  const paladin = s.entities.find(e => e.team === 'player' && e.kind === 'hero');
  check(s.selected.includes(paladin.id), 'Space selects and focuses the hero');
  const dest = await point(-15, 16);
  await page.mouse.click(dest.x, dest.y, { button: 'right' });
  const oldDistance = Math.hypot(paladin.x + 15, paladin.z - 16);
  await advance(5);
  s = await state();
  const moved = s.entities.find(e => e.id === paladin.id);
  check(Math.hypot(moved.x + 15, moved.z - 16) < oldDistance - 2, 'Right-click moves the 3D hero across the map');

  await page.keyboard.press('Control+a');
  s = await state();
  check(s.selected.length >= 4 && s.selected.every(id => ['hero', 'footman', 'archer'].includes(s.entities.find(e => e.id === id)?.kind)), 'Ctrl+A selects the combat army');
  await page.keyboard.press('a');
  const attackPoint = await point(-6, 9);
  await page.mouse.click(attackPoint.x, attackPoint.y);
  s = await state();
  check(s.selected.some(id => s.entities.find(e => e.id === id)?.order?.type === 'attackMove'), 'A plus a canvas click issues attack-move');

  const cameraBefore = await page.evaluate(() => ({ ...__view.center }));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(before => Math.hypot(__view.center.x - before.x, __view.center.z - before.z) > 1, cameraBefore, { timeout: 15000 });
  await page.keyboard.up('ArrowRight');
  const cameraAfter = await page.evaluate(() => ({ ...__view.center }));
  check(Math.hypot(cameraAfter.x - cameraBefore.x, cameraAfter.z - cameraBefore.z) > 1, 'Arrow keys pan the 3D camera');
  const zoomBefore = await page.evaluate(() => __view.camera.isOrthographicCamera ? (__view.camera.top - __view.camera.bottom) / __view.camera.zoom : __view.camera.position.y);
  await page.mouse.move(700, 300);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  const zoomAfter = await page.evaluate(() => __view.camera.isOrthographicCamera ? (__view.camera.top - __view.camera.bottom) / __view.camera.zoom : __view.camera.position.y);
  check(Math.abs(zoomAfter - zoomBefore) > .1, 'Mouse wheel changes the 3D camera zoom');
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  await page.keyboard.press('h');
  s = await state();
  const builder = s.entities.find(e => e.kind === 'worker' && e.team === 'player');
  await clickEntity(builder.id);
  await page.keyboard.press('b');
  const sitePoint = await point(-12, 27);
  await page.mouse.move(sitePoint.x, sitePoint.y);
  await page.mouse.click(sitePoint.x, sitePoint.y);
  s = await state();
  check(!!s.entities.find(e => e.kind === 'barracks'), 'Canvas click places the Barracks site');
  for (let waited = 0; waited < 30; waited += 2) {
    s = await state();
    if ((s.entities.find(e => e.kind === 'barracks')?.buildProgress || 0) > 0) break;
    await advance(2);
  }
  s = await state();
  const site = s.entities.find(e => e.kind === 'barracks');
  check(site && site.buildProgress > 0 && site.buildProgress < 1, 'Worker reaches and actively constructs the Barracks');
  await page.keyboard.press('s');
  const pausedProgress = (await state()).entities.find(e => e.id === site.id).buildProgress;
  await advance(2);
  s = await state();
  check(Math.abs(s.entities.find(e => e.id === site.id).buildProgress - pausedProgress) < .001, 'Stopping the builder pauses construction');
  const wallet = s.gold;
  await clickEntity(site.id, 'right');
  s = await state();
  check(s.entities.find(e => e.id === builder.id).order?.type === 'build' && s.gold >= wallet, 'Right-click resumes a friendly site without paying twice');
  for (let waited = 0; waited < 40; waited += 2) {
    s = await state();
    if (s.entities.find(e => e.id === site.id)?.buildProgress === 1) break;
    await advance(2);
  }
  s = await state();
  check(s.entities.find(e => e.id === site.id).buildProgress === 1, 'Resumed construction completes through the normal worker rules');
  await page.getByRole('button', { name: /restart|new skirmish/i }).last().click();
  s = await state();
  check(s.status === 'playing' && s.time < 2 && !s.entities.some(e => e.kind === 'farm' && Math.hypot(e.x + 15, e.z - 31) < 3), 'Visible restart resets the entire skirmish');
  check(browserErrors.length === 0, 'No uncaught browser exceptions during the playtest', browserErrors.join('; '));
  page.off('pageerror', onError);
  return { method: 'Actual DOM buttons, keyboard and canvas mouse input. Fixed simulation time advances speed up economy/construction waits without granting resources or changing combat stats.', checks: results };
}
