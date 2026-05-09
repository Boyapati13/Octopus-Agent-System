'use strict';
/**
 * Scribe — Documentation
 * Generates changelog entry and doc stubs from changed files + decisions.
 * Only needs changed_files, decisions, and run notes — not source AST or security data.
 */
const name = 'Scribe';
const role = 'documentation';
const canApprove = false;

async function run(input, memory) {
  const { task } = input;
  const ctx = await memory.getContext('scribe', task);
  const run = ctx?.run_state || {};
  const decisions = ctx?.recent_decisions || [];
  const changed = run.changed_files || [];

  const ts = new Date().toISOString().split('T')[0];
  const changelogEntry = [
    `## [Unreleased] — ${ts}`,
    `### Task`,
    `- ${task}`,
    changed.length > 0 ? `### Changed Files\n${changed.map(f => `- \`${f}\``).join('\n')}` : '',
    decisions.length > 0
      ? `### Decisions\n${decisions.map(d => `- **${d.title}**: ${d.rationale || ''}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const docStubs = changed.map(f => ({
    file: f,
    stub: `# ${f}\n\n_Auto-generated stub by Scribe. Update with actual documentation._\n`,
  }));

  await memory.writeback(name, {
    decision: {
      title: `Scribe: doc update for "${task}"`,
      rationale: `Changelog and stubs generated for ${changed.length} file(s)`,
      files: changed,
      tags: ['docs', 'changelog'],
      risk: 'low',
    },
  });

  return {
    agent: name, role, task,
    changelog_entry: changelogEntry,
    doc_stubs: docStubs,
    advice: 'Paste changelog_entry into CHANGELOG.md. Review and expand doc_stubs.',
  };
}

module.exports = { name, role, canApprove, run };
