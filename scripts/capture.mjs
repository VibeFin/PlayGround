import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';

const project = realpathSync(process.env.PROJECT_DIR || process.cwd());
const url = process.env.CAPTURE_URL;
const output = resolve(process.env.CAPTURE_DIR || '.');
const session = `project-capture-${process.pid}`;
const insideProject = path => path === project || path.startsWith(project + sep);
let browserOpened = false;
let exitCode = 0;
function cli(command, args = []) {
  const started = performance.now();
  const result = spawnSync('playwright-cli', [`-s=${session}`, command, ...args, '--json'], { encoding: 'utf8', timeout: 150000, maxBuffer: 8 * 1024 * 1024 });
  console.error(`[timing] playwright-cli ${command}: ${(performance.now() - started).toFixed(1)} ms`);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    throw Object.assign(new Error(result.error?.message || result.stdout || `Browser command ${command} exited ${result.status}`), { exitCode: 75 });
  }
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { throw Object.assign(new Error(`Invalid browser response: ${result.stdout}`), { exitCode: 75 }); }
  if (data.error || data.isError) throw Object.assign(new Error(JSON.stringify(data)), { exitCode: 75 });
  return data;
}
try {
  if (!url || !process.env.CAPTURE_DIR || !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Set CAPTURE_URL to an HTTP(S) URL and CAPTURE_DIR to an external output directory.');
  // Resolve existing ancestors before creating anything, including symlinked paths.
  let ancestor = output;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actualOutput = resolve(realpathSync(ancestor), relative(ancestor, output));
  if (insideProject(output) || insideProject(actualOutput)) throw new Error('CAPTURE_DIR must be outside project source and built output.');
  const started = performance.now();
  mkdirSync(output, { recursive: true });
  console.error(`[timing] create capture evidence directory: ${(performance.now() - started).toFixed(1)} ms`);
  browserOpened = true;
  cli('open', [url]);
  const code = `async (page) => {
    const timings = [], views = [];
    const temporary = /ERR_(CONNECTION|NAME_NOT_RESOLVED|TIMED_OUT|NETWORK|INTERNET_DISCONNECTED|HTTP2)|browser.*closed|Target.*closed|page.*crashed|Protocol error/i;
    async function timed(name, action) { const start=Date.now(); try { return await action(); } finally { timings.push({command:name,milliseconds:Date.now()-start}); } }
    async function capture(target, name) {
      const errors=[];
      target.on('pageerror', error=>errors.push(error.message));
      const response=await timed(name+' navigate exact URL',()=>target.goto(${JSON.stringify(url)},{waitUntil:'load',timeout:45000}).catch(error=>{throw Object.assign(error,{exitCode:75});}));
      if(!response?.ok()) throw Object.assign(new Error('HTTP '+response?.status()+' loading exact capture URL'),{exitCode:!response||[408,429,500,502,503,504].includes(response.status())?75:1});
      await timed(name+' wait for rendered arena',()=>target.waitForFunction(()=>window.gameApp?.world?.renderer?.info?.render?.triangles>100 && document.querySelector('#game-canvas')?.width>0 && document.querySelector('#loading')?.classList.contains('hidden'),null,{timeout:30000}));
      await timed(name+' wait for fonts',()=>target.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:15000}));
      if(errors.length) throw new Error('Application script errors: '+errors.join('; '));
      await timed(name+' deploy gameplay',()=>target.locator('#deploy-button').click({timeout:5000}));
      await timed(name+' wait for active rendered frames',()=>target.waitForFunction(()=>window.gameApp.active && window.gameApp.game.state.timeLeft<479.8 && window.gameApp.world.renderer.info.render.triangles>100,null,{timeout:15000}));
      if(errors.length) throw new Error('Application script errors: '+errors.join('; '));
      const state=await target.evaluate(()=>({title:document.title,url:location.href,triangles:gameApp.world.renderer.info.render.triangles,active:gameApp.active,timeLeft:gameApp.game.state.timeLeft,bots:gameApp.game.state.bots.length,renderer:gameApp.world.renderQuality.gpuName}));
      await timed(name+' screenshot',()=>target.screenshot({path:${JSON.stringify(output)}+'/final-'+name+'.png',timeout:30000}).catch(error=>{if(error.name==='TimeoutError'||!target.context().browser().isConnected())error.exitCode=75;throw error;}));
      views.push({name,...state});
    }
    let mobile;
    try {
      await timed('desktop resize',()=>page.setViewportSize({width:1440,height:900}));
      await capture(page,'desktop');
      // Keep the first view from consuming software-renderer resources while the
      // second view is captured; its screenshot is already complete.
      await timed('desktop release page',()=>page.goto('about:blank'));
      mobile=await timed('mobile browser context',()=>page.context().browser().newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}).catch(error=>{throw Object.assign(error,{exitCode:75});}));
      await capture(mobile,'mobile');
      await timed('mobile close page',()=>mobile.close());mobile=null;
      return {ok:true,views,timings};
    } catch(error) {
      return {ok:false,exitCode:error.exitCode||((temporary.test(error.message)||!page.context().browser().isConnected())?75:1),error:error.message,views,timings};
    } finally { if(mobile) await mobile.close().catch(()=>{}); }
  }`;
  const response = cli('run-code', [code]);
  let report;
  try { report = typeof response.result === 'string' ? JSON.parse(response.result) : response.result; }
  catch { throw new Error(`Capture script did not return a valid report: ${JSON.stringify(response)}`); }
  for (const timing of report?.timings || []) console.error(`[timing] ${timing.command}: ${timing.milliseconds} ms`);
  if (!report?.ok) throw Object.assign(new Error(report?.error || 'Capture script failed.'), { exitCode: report?.exitCode || 1 });
  console.log(JSON.stringify({ output, ...report }, null, 2));
} catch (error) {
  console.error(error.message);
  exitCode = error.exitCode || 1;
} finally {
  if (browserOpened) {
    try { cli('close'); }
    catch (error) { console.error(`Capture browser cleanup failed: ${error.message}`); exitCode ||= 75; }
  }
}
process.exitCode = exitCode;
