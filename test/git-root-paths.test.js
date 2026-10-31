import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import {sameNativePath,syncGitState} from '../src/sync-files.js';

test('Git roots accept native Windows casing but still reject a nested vault', t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'git-root-case-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 fs.writeFileSync(path.join(root,'note.md'),'Note\n');git('add','note.md');git('commit','-m','fixture');
 const spelling=process.platform==='win32'?root.toUpperCase():root;
 assert.equal(syncGitState(spelling).branch,'main');
 const nested=path.join(root,'nested');fs.mkdirSync(nested);
 assert.throws(()=>syncGitState(nested),{code:'git-root'});
});

test('native path equality preserves POSIX casing rules',()=>{
 assert.equal(sameNativePath(path.resolve('Case'),path.resolve('case')),process.platform==='win32');
 assert.equal(sameNativePath(path.resolve('same'),path.resolve('same')),true);
});

// GitHub's Windows runners expose %TEMP% as C:\Users\RUNNER~1\...; Git reports
// the long name, so the vault must be compared through the OS final path.
const shortName=directory=>execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',
 `(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:AGENT_TOOLKIT_SHORT_NAME_PROBE).ShortPath`],
 {encoding:'utf8',stdio:['ignore','pipe','ignore'],env:{...process.env,AGENT_TOOLKIT_SHORT_NAME_PROBE:directory}}).trim();
test('Git roots accept Windows 8.3 short names but still reject a nested vault',{skip:process.platform!=='win32'&&'Windows 8.3 short names only.'},t=>{
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'git-root-short-')));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'repository-with-a-long-directory-name');fs.mkdirSync(root);
 const short=shortName(root);
 if(!short||short===root){t.skip('8.3 short names are disabled on this volume.');return;}
 assert.equal(fs.realpathSync(short)===root,false,'fs.realpathSync must keep the short alias for this regression');
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 fs.writeFileSync(path.join(root,'note.md'),'Note\n');git('add','note.md');git('commit','-m','fixture');
 assert.equal(syncGitState(fs.realpathSync(short)).branch,'main');
 fs.mkdirSync(path.join(root,'nested-directory-with-long-name'));
 const nested=path.join(short,'nested-directory-with-long-name');
 assert.throws(()=>syncGitState(fs.realpathSync(nested)),{code:'git-root'});
});
