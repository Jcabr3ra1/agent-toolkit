import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {isPortableAbsolutePath,toGitPath} from '../src/platform.js';

test('portable declarative paths accept canonical POSIX and Windows roots, reject traversal',()=>{
 for(const p of ['/fictitious/project','C:/work/repo','//server/share/repo','C:\\work\\repo','\\\\server\\share\\repo'])assert.equal(isPortableAbsolutePath(p),true,p);
 for(const p of ['relative/path','C:relative','/a/../b','C:\\a\\..\\b','C:\\repo\\note:stream','\\\\.\\pipe\\name'])assert.equal(isPortableAbsolutePath(p),false,p);
 assert.equal(toGitPath('00-INICIO\\lock'),'00-INICIO/lock');
});
test('platform warning uses stderr once, stays silent on POSIX and respects quiet env',()=>{
 const url=new URL('../src/platform.js',import.meta.url).href;
 const run=(platform,quiet)=>spawnSync(process.execPath,['--input-type=module','-e',`import {warnPlatformPermissions} from ${JSON.stringify(url)};warnPlatformPermissions({platform:${JSON.stringify(platform)}});warnPlatformPermissions({platform:${JSON.stringify(platform)}});`],{encoding:'utf8',env:{...process.env,AGENT_TOOLKIT_QUIET_PLATFORM_WARNINGS:quiet?'1':'0'}});
 const win=run('win32',false);assert.equal(win.status,0);assert.equal(win.stdout,'');assert.equal(win.stderr.trim().split('\n').length,1);assert.match(win.stderr,/Windows/);
 for(const platform of ['linux','darwin']){const r=run(platform,false);assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');}
 const quiet=run('win32',true);assert.equal(quiet.status,0);assert.equal(quiet.stdout,'');assert.equal(quiet.stderr,'');
});
