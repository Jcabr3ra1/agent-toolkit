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
