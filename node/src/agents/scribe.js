'use strict';
/**
 * Scribe — Documentation Writer
 * Generates CHANGELOG entries, doc stubs, and release notes
 * from changed files and decisions recorded in memory.
 */
const name = 'Scribe';
const role = 'documentation';
const canApprove = false;

function semverBump(task) {
  const t = task.toLowerCase();
  if (/breaking|major|incompatible/.test(t)) return 'major';
  if (/feat|add|new|implement|introduce/.test(t))  return 'minor';
  return 'patch';
}

function formatChangelog(task, changed, decisions, bump) {
  const date    = new Date().toISOString().split('T')[0];
  const grouped = { Added: [], Changed: [], Fixed: [], Removed: [] };

  for (const f of changed) {
    if (/test/i.test(f))                      grouped.Changed.push(`Test coverage for \`${f}\``);
    else if (/readme|doc|changelog/i.test(f)) grouped.Changed.push(`Documentation: \`${f}\``);
    else                                       grouped.Changed.push(`\`${f}\``);
  }

  const t = task.toLowerCase();
  if (/fix|bug|patch/.test(t))    grouped.Fixed.push(task);
  else if (/remove|delete/.test(t)) grouped.Removed.push(task);
  else if (/add|new|feat/.test(t)) grouped.Added.push(task);
  else                              grouped.Changed.push(task);

  const sections = Object.entries(grouped)
    .filter(([, items]) => items.length > 0)
    .map(([type, items]) => `### ${type}\n${items.map(i => `- ${i}`).join('\n')}`)
    .join('\n\n');

  return `## [Unreleased] — ${date} (${bump} bump)\n\n${sections}`;
}

async function run(input, memory) {
  const { task } = input;

  const ctx      = await memory.getContext('scribe', task, task);
  const runState = ctx?.run_state || await memory.getRun() || {};
  const decisions = ctx?.recent_decisions || [];
  const changed   = runState.changed_files || [];

  const bump          = semverBump(task);
  const changelogEntry = formatChangelog(task, changed, decisions, bump);

  const docStubs = changed
    .filter(f => /\.(js|ts|py)$/.test(f) && !/test/i.test(f))
    .map(f => ({
      file: f.replace(/\.\w+$/, '.md'),
      stub: `# ${f.split('/').pop()}\n\n## Overview\n\n_Document purpose, inputs, and outputs._\n\n## Usage\n\n\`\`\`\n// example\n\`\`\`\n\n## API\n\n_Describe exported functions/classes._\n`,
    }));

  await memory.writeback(name, {
    decision: {
      title:     `Docs: ${task}`,
      rationale: `Changelog + ${docStubs.length} doc stub(s) generated`,
      files:     changed,
      tags:      ['docs', 'changelog', bump],
      risk:      'low',
    },
  });

  return {
    agent: name, role, task,
    semver_bump:     bump,
    changelog_entry: changelogEntry,
    doc_stubs:       docStubs,
    decisions_referenced: decisions.length,
    advice: `Paste changelog_entry into CHANGELOG.md. Review ${docStubs.length} doc stub(s). Suggested version bump: ${bump}.`,
  };
}

module.exports = { name, role, canApprove, run };
