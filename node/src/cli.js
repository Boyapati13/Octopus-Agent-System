#!/usr/bin/env node
'use strict';
// Load .env first
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * cli.js  —  Octopus Interactive Terminal  (Claude Code / Hermes style)
 *
 * Usage:
 *   node node/src/cli.js       or      npm run cli   (inside node/)
 *
 * Commands:
 *   <message>              - chat / Q&A with the LLM (no slash needed)
 *   /run   <task>          - run full multi-agent pipeline
 *   /plan  <task>          - plan only (Cortex, no execution)
 *   /workspace <url|path>  - clone GitHub repo or open local folder
 *   /files                 - show workspace file tree
 *   /context               - show active workspace context
 *   /agents                - list all agents + roles
 *   /tools                 - list all tools
 *   /routes                - task router config
 *   /models                - installed Ollama models
 *   /provider [set <p> m]  - show / switch LLM provider
 *   /setup                 - interactive provider wizard
 *   /status                - service health check
 *   /dashboard             - open web dashboard
 *   /vault                 - API key status
 *   /clear                 - redraw banner
 *   /help                  - full command reference
 *   /exit                  - quit
 */

const readline = require('readline');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const { execSync } = require('child_process');
const axios    = require('axios');
const chalk    = require('chalk');

// ── Config ─────────────────────────────────────────────────────────────────────
const REPO_ROOT  = path.resolve(__dirname, '..', '..');
const ENV_PATH   = path.join(__dirname, '..', '.env');
const MEMORY_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL    || 'http://localhost:11434';
const SESSION_ID = `${new Date().toISOString().slice(0,10).replace(/-/g,'')}` +
                   `_${Date.now().toString(36).toUpperCase()}`;

function getEnvVar(key) {
  try {
    const m = fs.readFileSync(ENV_PATH,'utf8').match(new RegExp(`^${key}=(.*)$`,'m'));
    return m ? m[1].trim() : (process.env[key] || '');
  } catch { return process.env[key] || ''; }
}
function setEnvVar(key, value) {
  try {
    let c = ''; try { c = fs.readFileSync(ENV_PATH,'utf8'); } catch {}
    const re = new RegExp(`^(${key}=).*$`,'m');
    c = re.test(c) ? c.replace(re, `$1${value}`) : c.trimEnd() + `\n${key}=${value}\n`;
    fs.writeFileSync(ENV_PATH, c, 'utf8');
    process.env[key] = value;
    return true;
  } catch (err) { console.log(chalk.red(`  Cannot write .env: ${err.message}\n`)); return false; }
}

const PROVIDER = getEnvVar('LLM_PROVIDER') || 'ollama';
const MODEL    = getEnvVar('LLM_MODEL')    || 'gemma4:e2b';

// ── Workspace state ─────────────────────────────────────────────────────────────
const workspace = { root:null, name:null, files:[], summary:null, type:null };

// ── ASCII banner ────────────────────────────────────────────────────────────────
const BANNER_LINES = [
  ' ██████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗███████╗',
  '██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██║   ██║██╔════╝',
  '██║   ██║██║        ██║   ██║   ██║██████╔╝██║   ██║███████╗',
  '██║   ██║██║        ██║   ██║   ██║██╔═══╝ ██║   ██║╚════██║',
  '╚██████╔╝╚██████╗   ██║   ╚██████╔╝██║     ╚██████╔╝███████║',
  ' ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝',
];

// ── Tool + Agent catalogues ─────────────────────────────────────────────────────
const TOOL_GROUPS = {
  code:     ['run_task', 'plan_task', 'write_file', 'read_file', 'patch_file'],
  browser:  ['web_search', 'navigate', 'screenshot'],
  memory:   ['memory_add', 'memory_search', 'memory_format'],
  document: ['process_doc', 'doc_summary', 'doc_extract'],
  system:   ['list_agents', 'get_routes', 'reload_agent', 'vault_check'],
  gateway:  ['telegram_send', 'discord_send', 'slack_send', 'ha_trigger'],
};
const AGENT_GROUPS = {
  planning:    ['cortex · planner', 'architect · system design'],
  engineering: ['forge · code', 'probe · testing', 'reviewer · review'],
  security:    ['securityreviewer · OWASP', 'factchecker · verify'],
  research:    ['marketscout · intel', 'navigator · browsing'],
  ops:         ['atlas · memory', 'scribe · docs', 'releasekeeper · release', 'toolsmith · skills', 'sandboxqa · QA'],
};

// ── Spinner ─────────────────────────────────────────────────────────────────────
const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let _sp = 0, _st = null;
function startSpinner(label) {
  process.stdout.write('\n');
  _st = setInterval(() => { process.stdout.write(`\r  ${chalk.cyan(SPIN[_sp++%SPIN.length])} ${label}   `); }, 80);
}
function stopSpinner(label, ok=true) {
  if (_st) { clearInterval(_st); _st = null; }
  process.stdout.write(`\r  ${ok?chalk.green('✓'):chalk.red('✗')} ${label}                        \n`);
}

// ── Service checks ──────────────────────────────────────────────────────────────
async function checkMemory() {
  try { await axios.get(`${MEMORY_URL}/health`,{timeout:3000}); return {ok:true}; } catch { return {ok:false}; }
}
async function checkOllama() {
  try { const r=await axios.get(`${OLLAMA_URL}/api/tags`,{timeout:3000}); return {ok:true,models:(r.data?.models||[]).map(m=>m.name)}; }
  catch { return {ok:false,models:[]}; }
}

// ── File tree ────────────────────────────────────────────────────────────────────
const IGNORE = new Set(['node_modules','.git','__pycache__','.next','dist','build','.venv','venv','coverage']);
const CODE_EXT = new Set(['.js','.ts','.jsx','.tsx','.py','.go','.rs','.java','.cs','.cpp','.c','.rb','.php','.sh','.md','.json','.yaml','.yml','.toml','.html','.css','.sql','.env.example']);

function walkDir(dir, base=dir, depth=0, max=4) {
  if (depth>max) return [];
  let out=[];
  try {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      if (e.name.startsWith('.')&&e.name!=='.env.example') continue;
      if (IGNORE.has(e.name)) continue;
      const full=path.join(dir,e.name), rel=path.relative(base,full);
      if (e.isDirectory()) { out.push({type:'d',path:rel,depth}); out=out.concat(walkDir(full,base,depth+1,max)); }
      else if (CODE_EXT.has(path.extname(e.name).toLowerCase())||depth===0) out.push({type:'f',path:rel,depth});
    }
  } catch {}
  return out;
}

function renderTree(entries, maxLines=60) {
  const lines=[];
  for (const e of entries.slice(0,maxLines)) {
    const ind='  '.repeat(e.depth);
    if (e.type==='d') lines.push(`${ind}${chalk.cyan('▸')} ${chalk.bold(path.basename(e.path))}/`);
    else {
      const ext=path.extname(e.path).toLowerCase();
      const col=['.js','.ts','.jsx','.tsx'].includes(ext)?chalk.yellow:['.py','.go','.rs'].includes(ext)?chalk.green:['.md'].includes(ext)?chalk.white:chalk.dim;
      lines.push(`${ind}  ${col(path.basename(e.path))}`);
    }
  }
  if (entries.length>maxLines) lines.push(chalk.dim(`  … and ${entries.length-maxLines} more`));
  return lines.join('\n');
}

// ── Workspace load ───────────────────────────────────────────────────────────────
async function loadWorkspace(target) {
  const isGit = /^https?:\/\/github\.com\//i.test(target)||/^git@github\.com:/i.test(target);
  if (isGit) {
    const slug=target.replace(/\.git$/,'').split('/').slice(-2).join('/');
    const name=slug.split('/')[1];
    const dir=path.join(os.tmpdir(),'octo_ws',name);
    fs.mkdirSync(path.dirname(dir),{recursive:true});
    if (fs.existsSync(dir)) {
      console.log(chalk.dim('  Pulling latest…'));
      try { execSync(`git -C "${dir}" pull --ff-only`,{timeout:30000,stdio:'pipe'}); } catch {}
    } else {
      startSpinner(`Cloning ${chalk.cyan(slug)}…`);
      try { execSync(`git clone --depth 1 "${target}" "${dir}"`,{timeout:60000,stdio:'pipe'}); stopSpinner(`Cloned ${slug}`); }
      catch (err) { stopSpinner('Clone failed',false); console.log(chalk.red(`  ${err.message}\n`)); return false; }
    }
    workspace.root=dir; workspace.name=slug; workspace.type='git';
  } else {
    const abs=path.resolve(target);
    if (!fs.existsSync(abs)) { console.log(chalk.red(`  Path not found: ${abs}\n`)); return false; }
    workspace.root=abs; workspace.name=path.basename(abs); workspace.type='local';
  }
  workspace.files=walkDir(workspace.root);
  const exts=[...new Set(workspace.files.filter(e=>e.type==='f').map(e=>path.extname(e.path).replace('.',''))).values()].filter(Boolean).slice(0,8);
  workspace.summary=`Workspace: ${workspace.name} (${workspace.type})\nRoot: ${workspace.root}\nLanguages: ${exts.join(', ')}\nFiles: ${workspace.files.filter(e=>e.type==='f').slice(0,20).map(e=>e.path).join(', ')}`;
  return true;
}

function injectWorkspace(task) {
  if (!workspace.root) return task;
  const topFiles=workspace.files.filter(e=>e.type==='f').slice(0,15).map(e=>e.path).join(', ');
  return `[Workspace: ${workspace.name} — ${workspace.root}]\nKey files: ${topFiles}\n\nTask: ${task}`;
}

// ── Banner ───────────────────────────────────────────────────────────────────────
async function showBanner() {
  let version='4.x';
  try { version=require(path.join(REPO_ROOT,'package.json')).version||'4.x'; } catch {}

  console.clear();
  for (const line of BANNER_LINES) console.log(chalk.hex('#FF8C00').bold(line));
  console.log();
  console.log(chalk.hex('#FFB347')(`  Octopus Agent v${version}`) + chalk.dim(` · Session ${SESSION_ID}`));
  console.log(chalk.dim('  ' + '─'.repeat(72)));
  console.log();

  // Two-column: tools | agents
  const TL=Object.entries(TOOL_GROUPS).map(([c,t])=>`  ${chalk.hex('#FFB347')(c.padEnd(12))} ${chalk.dim(t.join(', '))}`);
  const AL=Object.entries(AGENT_GROUPS).map(([c,a])=>`  ${chalk.hex('#FF8C00')(c.padEnd(14))} ${chalk.dim(a.join(' · '))}`);
  console.log(`  ${chalk.bold.white('Available Tools')}` + ' '.repeat(26) + chalk.bold.white('Agents'));
  for (let i=0;i<Math.max(TL.length,AL.length);i++) {
    console.log(`${(TL[i]||'').padEnd(50)}${AL[i]||''}`);
  }
  console.log();

  const [mem,oll]=await Promise.all([checkMemory(),checkOllama()]);
  const memB=mem.ok?chalk.green('● online') :chalk.red('● offline');
  const ollB=oll.ok?chalk.green(`● ${oll.models.length} models`):chalk.yellow('● offline');
  const ws=workspace.name?chalk.hex('#FFB347')(`📁 ${workspace.name}`):chalk.dim('no workspace');

  console.log(chalk.dim('  ' + '─'.repeat(72)));
  console.log(`  ${chalk.hex('#FFB347').bold(PROVIDER)}${chalk.dim(':')}${chalk.white(MODEL.split('/').pop())} · ${ws} · mem ${memB} · ollama ${ollB}`);
  console.log(chalk.dim(`\n  ${Object.values(TOOL_GROUPS).flat().length} tools · ${Object.values(AGENT_GROUPS).flat().length} agents · /help for commands\n`));
}

// ── Help ─────────────────────────────────────────────────────────────────────────
function printHelp() {
  const C=chalk.hex('#FFB347'), D=chalk.dim;
  console.log(`\n${chalk.bold.white('  Commands:')}\n`);
  [
    ['<message>',             'Chat directly — answered by LLM (no agent pipeline)'],
    ['/run <task>',           'Full multi-agent pipeline: plan → code → test → review'],
    ['/plan <task>',          'Show execution plan without running it'],
    ['/workspace <url|path>', 'Load GitHub repo (https://github.com/…) or local folder'],
    ['/files',                'File tree of current workspace'],
    ['/context',              'Active workspace summary'],
    ['/agents',               'All agents + roles'],
    ['/tools',                'All tools + categories'],
    ['/routes',               'Task router — which model each agent role uses'],
    ['/models',               'Installed Ollama models'],
    ['/provider',             'Show active LLM provider'],
    ['/provider set <p> [m]', 'Switch: ollama, anthropic, openai, nvidia, router…'],
    ['/setup',                'Interactive wizard — pick provider, enter key, test'],
    ['/status',               'Health check all services'],
    ['/dashboard',            'Open web dashboard in browser'],
    ['/vault',                'API key status for all providers'],
    ['/clear',                'Redraw banner'],
    ['/help',                 'This help'],
    ['/exit',                 'Quit'],
  ].forEach(([c,d])=>console.log(`    ${C(c.padEnd(30))} ${D(d)}`));
  console.log();
}

// ── Setup wizard ─────────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value:'ollama',      label:'Ollama (local — no API key)',            model:'',                              key:null,              note:'Runs on your machine — ollama.ai' },
  { value:'router',      label:'Auto Router (best model per task)',       model:'',                              key:null,              note:'Uses available keys + Ollama fallback per agent role' },
  { value:'anthropic',   label:'Anthropic Claude Sonnet',                model:'claude-sonnet-4-6',             key:'ANTHROPIC_API_KEY', note:'console.anthropic.com/settings/keys' },
  { value:'openai',      label:'OpenAI GPT-4o',                          model:'gpt-4o',                        key:'OPENAI_API_KEY',    note:'platform.openai.com/api-keys' },
  { value:'nvidia',      label:'NVIDIA NIM (free trial)',                model:'meta/llama-3.1-405b-instruct',  key:'NVIDIA_API_KEY',    note:'build.nvidia.com/settings/api-key' },
  { value:'huggingface', label:'HuggingFace (free)',                     model:'google/gemma-3-4b-it',          key:'HF_TOKEN',          note:'huggingface.co/settings/tokens' },
  { value:'custom_http', label:'Custom HTTP (vLLM, LM Studio, llamafile)',model:'',                             key:null,              note:'Any OpenAI-compatible server' },
];

async function runSetupWizard() {
  let enq; try { enq=require('enquirer'); } catch { console.log(chalk.yellow('\n  Run: npm install enquirer\n')); return; }
  const {Select,Password,Input}=enq;
  console.log(chalk.bold.white('\n  ╔══ Octopus Setup Wizard ══╗\n'));
  const oll=await checkOllama();
  PROVIDERS.forEach((p,i)=>console.log(`  ${chalk.dim(`${i+1}.`)} ${chalk.hex('#FFB347')(p.label.padEnd(42))} ${chalk.dim(p.note)}`));
  console.log();
  let choice;
  try {
    const ans=await new Select({name:'p',message:'Select LLM provider:',choices:PROVIDERS.map((p,i)=>`${i+1}. ${p.label}`)}).run();
    choice=PROVIDERS[parseInt(ans.split('.')[0])-1];
  } catch { console.log(chalk.yellow('\n  Cancelled.\n')); return; }

  if (choice.value==='ollama') {
    if (!oll.ok) { console.log(chalk.yellow('  Ollama offline — start: ollama serve\n')); return; }
    let m='gemma4:e2b';
    if (oll.models.length) {
      try {
        const picked=await new Select({name:'m',message:'Select model:',choices:[...oll.models,'(enter different name)']}).run();
        m=picked.startsWith('(')?await new Input({name:'custom',message:'Model name:'}).run():picked;
      } catch {}
    } else console.log(chalk.yellow('  No models — run: ollama pull gemma4:e2b'));
    setEnvVar('LLM_PROVIDER','ollama'); setEnvVar('LLM_MODEL',m);
    console.log(chalk.green(`\n  ✅ Set: ollama / ${m}`));
    console.log(chalk.yellow('  Restart Octopus to apply.\n')); return;
  }
  if (choice.value==='router') {
    setEnvVar('LLM_PROVIDER','router');
    console.log(chalk.green('\n  ✅ Auto Router enabled.'));
    console.log(chalk.dim('  Run /routes to see the full model routing table.\n')); return;
  }
  if (choice.value==='custom_http') {
    let url='',model='';
    try { url=await new Input({name:'url',message:'Server URL:'}).run(); model=await new Input({name:'model',message:'Model name:'}).run(); }
    catch { console.log(chalk.yellow('\n  Cancelled.\n')); return; }
    setEnvVar('LLM_PROVIDER','custom_http'); setEnvVar('CUSTOM_HTTP_URL',url.trim()); setEnvVar('CUSTOM_HTTP_MODEL',model.trim());
    console.log(chalk.green(`\n  ✅ custom_http → ${url} / ${model}\n`)); return;
  }
  console.log(chalk.hex('#FFB347')(`  ${choice.note}`));
  let key='';
  try { key=await new Password({name:'k',message:`Paste ${choice.key} (hidden):`}).run(); }
  catch { console.log(chalk.yellow('\n  Cancelled.\n')); return; }
  if (!key||key.trim().length<8) { console.log(chalk.red('\n  Key too short.\n')); return; }
  setEnvVar(choice.key,key.trim()); setEnvVar('LLM_PROVIDER',choice.value); setEnvVar('LLM_MODEL',choice.model);
  console.log(chalk.green(`\n  ✅ Setup complete: ${choice.value} / ${choice.model}`));
  console.log(chalk.yellow('  Restart Octopus to apply.\n'));
}

// ── LLM chat ─────────────────────────────────────────────────────────────────────
async function chat(message) {
  startSpinner(chalk.dim('thinking…'));
  try {
    const {complete}=require('./llm');
    const octoMemory=require('./octo_memory');
    const mem=octoMemory.format(6);
    const wsCtx=workspace.root?`\nWorkspace: ${workspace.name}\nKey files: ${workspace.files.filter(e=>e.type==='f').slice(0,10).map(e=>e.path).join(', ')}\n`:'';
    const prompt=`${mem?'Context:\n'+mem+'\n':''}${wsCtx}\nUser: ${message}\n\nAssistant:`;
    const raw=await complete(prompt,{maxTokens:800,timeout:45000});
    const answer=(raw||'').trim();
    stopSpinner('done');
    if (!answer){console.log(chalk.yellow('  (no response)\n'));return;}
    console.log();
    answer.split('\n').forEach(l=>console.log('  '+l));
    console.log();
    octoMemory.add(`Q: ${message.slice(0,100)} → A: ${answer.slice(0,200)}`,'chat');
  } catch(err){stopSpinner('failed',false);console.log(chalk.red(`  ${err.message}\n`));}
}

// ── Agent runners ─────────────────────────────────────────────────────────────────
async function runPlan(task) {
  startSpinner('Cortex planning…');
  try {
    const {runAgent}=require('./agents');
    const mem=require('./memory');
    const r=await runAgent('cortex',{task:injectWorkspace(task),query:task},mem);
    stopSpinner('Plan ready');
    if (r?.plan){
      console.log(chalk.bold('\n  Execution plan:'));
      r.plan.forEach((s,i)=>console.log(`    ${chalk.hex('#FFB347')(`${i+1}.`)} ${chalk.white(s.agent.padEnd(22))} ${chalk.dim(s.reason||'')}`));
      console.log(chalk.dim(`\n  Execute: /run ${task}\n`));
    } else console.log('  '+JSON.stringify(r,null,2)+'\n');
  } catch(err){stopSpinner('Failed',false);console.log(chalk.red(`  ${err.message}\n`));}
}

async function runTask(task) {
  const full=injectWorkspace(task);
  console.log(chalk.bold(`\n  ${chalk.hex('#FF8C00')('⟩')} ${task}\n`));
  try {
    const mem=require('./memory');
    const {runTask:exec}=require('./runner');
    const orig=console.error.bind(console);
    console.error=(...a)=>{
      const m=a.join(' ');
      if (m.includes('[runner] Spawning')) process.stdout.write(`  ${chalk.hex('#FFB347')('→')} ${chalk.white(m.replace('[runner] Spawning','').replace('…','').trim())}\n`);
      else if (m.includes('[runner] Parallel stage')) process.stdout.write(`  ${chalk.cyan('⟦')} ${m.replace('[runner] Parallel stage:','').replace(/[\[\]]/g,'').trim()} ${chalk.cyan('⟧')}\n`);
      else if (!m.includes('[runner] Task:')) orig(...a);
    };
    const result=await exec(full,mem);
    console.error=orig;
    const ok=Object.values(result.results||{}).filter(r=>r?.approved===true).length;
    const er=(result.errors||[]).length;
    console.log(chalk.bold(`\n  ${chalk.green('✅')} Complete — ${ok} approved, ${er} errors`));
    if (er) result.errors.forEach(e=>console.log(`    ${chalk.red('✗')} ${e.agent}: ${e.error}`));
    console.log();
  } catch(err){console.log(chalk.red(`\n  ${err.message}\n`));}
}

// ── Command router ────────────────────────────────────────────────────────────────
async function handleCommand(input) {
  const t=input.trim(); if (!t) return;
  if (!t.startsWith('/')) { await chat(t); return; }
  const parts=t.slice(1).split(' ');
  const cmd=parts[0].toLowerCase(), arg=parts.slice(1).join(' ').trim();

  switch(cmd) {

    case 'run':
      if (!arg){console.log(chalk.yellow('  Usage: /run <task>\n'));break;}
      await runTask(arg); break;

    case 'plan':
      if (!arg){console.log(chalk.yellow('  Usage: /plan <task>\n'));break;}
      await runPlan(arg); break;

    case 'workspace': case 'ws': case 'clone': case 'load': {
      if (!arg){
        console.log(chalk.yellow('  Usage: /workspace <github-url|local-path>'));
        console.log(chalk.dim('  e.g.  /workspace https://github.com/Boyapati13/Octopus-Agent-System'));
        console.log(chalk.dim('        /workspace ~/projects/my-app\n')); break;
      }
      const ok=await loadWorkspace(arg);
      if (ok){
        console.log(chalk.green(`\n  ✅ Workspace: ${chalk.bold(workspace.name)}`));
        console.log(chalk.dim(`  ${workspace.files.filter(e=>e.type==='f').length} files · /files to browse · /run to code\n`));
      }
      break;
    }

    case 'files':
      if (!workspace.root){console.log(chalk.yellow('  No workspace — use /workspace first\n'));break;}
      console.log(chalk.bold(`\n  📁 ${workspace.name}  ${chalk.dim(workspace.root)}`));
      console.log(chalk.dim('  ' + '─'.repeat(60)));
      console.log(renderTree(workspace.files));
      console.log(); break;

    case 'context':
      if (!workspace.root){console.log(chalk.yellow('  No workspace loaded\n'));break;}
      console.log(chalk.bold('\n  Workspace context:'));
      workspace.summary.split('\n').forEach(l=>console.log('  '+chalk.dim(l)));
      console.log(); break;

    case 'agents': {
      const {listAgents}=require('./agents');
      console.log(chalk.bold('\n  Agents:'));
      listAgents().forEach(a=>console.log(`    ${chalk.hex('#FFB347')(a.name.padEnd(22))} ${chalk.dim(a.role)}${a.canApprove?chalk.red(' [gate]'):''}`));
      console.log(); break;
    }

    case 'tools':
      console.log(chalk.bold('\n  Tools:'));
      Object.entries(TOOL_GROUPS).forEach(([c,t])=>{
        console.log(`\n    ${chalk.hex('#FFB347').bold(c)}`);
        t.forEach(x=>console.log(`      ${chalk.cyan('•')} ${chalk.white(x)}`));
      });
      console.log(); break;

    case 'routes': {
      const {summarise}=require('./task_router');
      const active=(getEnvVar('LLM_PROVIDER')||'ollama')==='router';
      console.log(chalk.bold('\n  Task Router')+(active?chalk.green(' [ACTIVE]'):chalk.yellow(' [inactive — /provider set router]')));
      console.log(chalk.dim('  '+'-'.repeat(64)));
      summarise().forEach(r=>{
        console.log(`  ${chalk.dim(r.role.padEnd(20))} ${chalk.hex('#FFB347')(r.provider.padEnd(14))} ${chalk.white(r.model.split('/').pop())}${r.overridden?chalk.yellow(' [override]'):''}`);
        if (r.agents.length) console.log(`  ${' '.repeat(20)} ${chalk.dim('agents: '+r.agents.join(', '))}`);
      });
      console.log(chalk.dim('\n  Override any role: ROUTE_PLANNER=ollama:llama3.2 in node/.env\n'));
      break;
    }

    case 'models': {
      const oll=await checkOllama();
      const active=getEnvVar('LLM_MODEL')||MODEL;
      console.log(chalk.bold('\n  Ollama models:'));
      if (!oll.ok) console.log(chalk.yellow('  Offline — start: ollama serve'));
      else if (!oll.models.length) { console.log(chalk.dim('  None installed.')); console.log(chalk.dim('  Pull one: ollama pull gemma4:e2b')); }
      else oll.models.forEach(m=>console.log(`    ${chalk.cyan(m)}${m===active?chalk.green(' ← active'):''}`));
      console.log(chalk.dim('\n  Pull: ollama pull <name>   Switch: /provider set ollama <name>\n'));
      break;
    }

    case 'provider': {
      const sub=parts[1]?.toLowerCase();
      if (!sub||sub==='show'){
        console.log(chalk.bold('\n  Active provider:'));
        console.log(`    Provider  ${chalk.hex('#FFB347')(getEnvVar('LLM_PROVIDER')||'ollama')}`);
        console.log(`    Model     ${chalk.white(getEnvVar('LLM_MODEL')||'(default)')}`);
        console.log(chalk.dim('\n  Switch: /provider set <provider> [model]\n')); break;
      }
      if (sub==='set') {
        const newP=parts[2]?.toLowerCase(), newM=parts.slice(3).join(' ').trim();
        const ALL=['ollama','anthropic','openai','google','nvidia','huggingface','custom_http','router','openrouter'];
        if (!newP||!ALL.includes(newP)){console.log(chalk.yellow(`  Providers: ${ALL.join(', ')}\n`));break;}
        setEnvVar('LLM_PROVIDER',newP); if (newM) setEnvVar('LLM_MODEL',newM);
        console.log(chalk.green(`  ✅ Set LLM_PROVIDER=${newP}${newM?` LLM_MODEL=${newM}`:''}`));
        console.log(chalk.yellow('  Restart to apply.\n'));
      }
      break;
    }

    case 'setup': await runSetupWizard(); break;

    case 'status': {
      const [mem,oll]=await Promise.all([checkMemory(),checkOllama()]);
      console.log(chalk.bold('\n  Services:'));
      console.log(`    Memory    ${mem.ok?chalk.green('✅ online'):chalk.red('❌ offline')}  ${chalk.dim(MEMORY_URL)}`);
      console.log(`    Ollama    ${oll.ok?chalk.green(`✅ ${oll.models.length} models`):chalk.yellow('⚠  offline')}  ${chalk.dim(OLLAMA_URL)}`);
      console.log(`    Provider  ${chalk.hex('#FFB347')(getEnvVar('LLM_PROVIDER')||'ollama')}  ${chalk.dim(getEnvVar('LLM_MODEL'))}`);
      if (workspace.root) console.log(`    Workspace ${chalk.hex('#FFB347')(workspace.name)}  ${chalk.dim(workspace.root)}`);
      if (!mem.ok) console.log(chalk.yellow('\n  Start memory: python python/services/memory_service.py'));
      if (!oll.ok) console.log(chalk.yellow('  Start Ollama: ollama serve'));
      console.log(); break;
    }

    case 'dashboard': {
      const url=`http://localhost:${process.env.PORT||3001}/dashboard`;
      console.log(chalk.bold(`\n  Dashboard: ${chalk.hex('#FFB347')(url)}\n`));
      try { require('child_process').exec(process.platform==='win32'?`start ${url}`:process.platform==='darwin'?`open ${url}`:`xdg-open ${url}`,{timeout:3000},()=>{}); } catch {}
      break;
    }

    case 'vault': {
      startSpinner('Checking keys…');
      let v={};
      try { const {getSecureKey}=require('./llm'); for (const p of ['anthropic','openai','google','nvidia','huggingface','openrouter']) v[p]=(await getSecureKey(p))?chalk.green('present'):chalk.dim('none'); } catch {}
      stopSpinner('Done');
      console.log(chalk.bold('\n  API Keys:'));
      Object.entries(v).forEach(([p,s])=>console.log(`    ${chalk.hex('#FFB347')(p.padEnd(16))} ${s}`));
      console.log(); break;
    }

    case 'clear': await showBanner(); break;

    case 'help': printHelp(); break;

    case 'exit': case 'quit':
      console.log(chalk.hex('#FF8C00')('\n  Goodbye 🐙\n')); process.exit(0); break;

    default:
      console.log(chalk.yellow(`  Unknown: /${cmd} — /help\n`));
  }
}

// ── REPL ─────────────────────────────────────────────────────────────────────────
let rl;
function prompt() {
  if (!rl) return;
  const ws=workspace.name?chalk.dim(` ${workspace.name}`):'';
  rl.setPrompt(chalk.hex('#FF8C00').bold('❯')+chalk.hex('#FFB347')(ws)+chalk.hex('#FF8C00')(' '));
  rl.prompt();
}

async function main() {
  rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
  rl.on('line',async input=>{ rl.pause(); await handleCommand(input); prompt(); rl.resume(); });
  rl.on('close',()=>{ console.log(chalk.hex('#FF8C00')('\n  Goodbye 🐙\n')); process.exit(0); });
  await showBanner();
  prompt();
}

main().catch(err=>{ console.error(chalk.red('Fatal: '+err.message)); process.exit(1); });
