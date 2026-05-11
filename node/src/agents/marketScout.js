'use strict';
/**
 * MarketScout — Skill Opportunity Scout (Phase 1 of Skill Evolution Pipeline)
 * Scans npm, PyPI, and GitHub for packages relevant to a topic list.
 * Deduplicates against the active skill registry before proposing.
 */
const axios    = require('axios');
const registry = require('../skill_registry');

const name = 'MarketScout';
const role = 'skill-scouting';
const canApprove = false;

const SOURCES = {
  npm: async (topics) => {
    const proposals = [];
    for (const topic of topics.slice(0, 3)) {
      try {
        const res = await axios.get('https://registry.npmjs.org/-/v1/search', {
          params: { text: topic, size: 3 },
          timeout: 8000,
        });
        for (const obj of res.data?.objects || []) {
          const pkg = obj.package;
          proposals.push({
            type: 'innovation', source: 'npm',
            name:         pkg.name.replace(/[^a-z0-9_]/gi, '_'),
            display_name: pkg.name,
            description:  pkg.description || '',
            doc_url:      pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
            reason:       `npm: ${pkg.name}@${pkg.version} — ${pkg.description || 'no description'}`,
            keywords:     pkg.keywords || [],
          });
        }
      } catch { /* source unreachable */ }
    }
    return proposals;
  },

  pypi: async (topics) => {
    const proposals = [];
    for (const topic of topics.slice(0, 3)) {
      try {
        const res = await axios.get(`https://pypi.org/search/?q=${encodeURIComponent(topic)}&o=-created`, {
          timeout: 8000,
          headers: { Accept: 'text/html' },
        });
        const matches = (res.data.toString().match(/class="package-snippet__name">([^<]+)</g) || [])
          .slice(0, 3)
          .map(m => { const hit = m.match(/>([^<]+)</); return hit ? hit[1].trim() : null; })
          .filter(Boolean);
        for (const pkgName of matches) {
          proposals.push({
            type: 'innovation', source: 'pypi',
            name:         pkgName.replace(/[^a-z0-9_]/gi, '_'),
            display_name: pkgName,
            description:  `PyPI package for topic: ${topic}`,
            doc_url:      `https://pypi.org/project/${pkgName}/`,
            reason:       `PyPI: ${pkgName} matches topic "${topic}"`,
            keywords:     [topic],
          });
        }
      } catch { /* source unreachable */ }
    }
    return proposals;
  },

  github: async (topics) => {
    const proposals = [];
    const headers = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    for (const topic of topics.slice(0, 2)) {
      try {
        const res = await axios.get('https://api.github.com/search/repositories', {
          params: { q: `topic:${topic}`, sort: 'stars', order: 'desc', per_page: 3 },
          timeout: 8000, headers,
        });
        for (const repo of res.data?.items || []) {
          proposals.push({
            type: 'innovation', source: 'github',
            name:         repo.name.replace(/[^a-z0-9_]/gi, '_'),
            display_name: repo.full_name,
            description:  repo.description || '',
            doc_url:      repo.homepage || repo.html_url,
            reason:       `GitHub: ${repo.full_name} ★${repo.stargazers_count} — ${repo.description || ''}`,
            keywords:     repo.topics || [],
          });
        }
      } catch { /* rate-limited or unreachable */ }
    }
    return proposals;
  },
};

async function run(input, memory) {
  const { topics = [] } = input;

  if (!topics.length) {
    return { agent: name, role, proposals: [], advice: 'Provide topics array to scout.' };
  }

  const [npmR, pypiR, githubR] = await Promise.all([
    SOURCES.npm(topics),
    SOURCES.pypi(topics),
    SOURCES.github(topics),
  ]);

  const all = [...npmR, ...pypiR, ...githubR];

  // Deduplicate against active registry
  const active = (registry.getActive ? registry.getActive() : []).map(s => s.name);
  const deduped = all.filter(p => !active.includes(p.name));
  const unique  = deduped.filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i);

  await memory.writeback(name, {
    decision: {
      title:     `MarketScout: ${topics.join(', ')}`,
      rationale: `Found ${unique.length} new skill opportunities across npm/PyPI/GitHub`,
      tags:      ['skill-scouting', 'marketplace'],
      risk:      'low',
    },
  });

  return {
    agent: name, role,
    topics_scanned:    topics,
    proposals:         unique,
    total_found:       all.length,
    after_dedup:       unique.length,
    by_source:         { npm: npmR.length, pypi: pypiR.length, github: githubR.length },
    advice: unique.length > 0
      ? `Found ${unique.length} skill opportunity(ies). Pass to Toolsmith to synthesise.`
      : 'No new opportunities found — all known packages already have skills.',
  };
}

module.exports = { name, role, canApprove, run };
