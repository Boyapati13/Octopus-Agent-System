'use strict';
/**
 * MarketScout — Market Intelligence (Phase 1 of Skill Evolution Pipeline)
 * Monitors GitHub Trending, npm registry, and PyPI for deprecations and innovations.
 * Generates Skill Proposals for CEO (Cortex) approval → Toolsmith synthesis.
 */
const axios   = require('axios');
const registry = require('../skill_registry');

const name = 'MarketScout';
const role = 'market-intelligence';
const canApprove = false;

const SOURCES = {
  npm: async (topics) => {
    const proposals = [];
    for (const topic of topics) {
      try {
        const res = await axios.get('https://registry.npmjs.org/-/v1/search', {
          params: { text: topic, size: 5, ranking: 'popularity' },
          timeout: 8000,
        });
        for (const pkg of (res.data.objects || [])) {
          const p = pkg.package;
          proposals.push({
            type: 'innovation',
            source: 'npm',
            name: p.name.replace(/[^a-z0-9_]/gi, '_'),
            display_name: p.name,
            description: p.description || '',
            doc_url: p.links?.homepage || p.links?.npm || `https://www.npmjs.com/package/${p.name}`,
            reason: `npm trending: ${p.name} v${p.version} — ${p.description || 'no description'}`,
            keywords: p.keywords || [],
          });
        }
      } catch {
        // source unreachable — skip
      }
    }
    return proposals;
  },

  pypi: async (topics) => {
    const proposals = [];
    for (const topic of topics.slice(0, 3)) {
      try {
        const res = await axios.get(`https://pypi.org/search/?q=${encodeURIComponent(topic)}&o=-created`, {
          timeout: 8000,
          headers: { Accept: 'application/json' },
        });
        // PyPI search returns HTML; extract package names via simple pattern
        const matches = (res.data.toString().match(/class="package-snippet__name">([^<]+)</g) || [])
          .slice(0, 3)
          .map(m => m.replace(/.*>/, '').trim());
        for (const pkgName of matches) {
          proposals.push({
            type: 'innovation',
            source: 'pypi',
            name: pkgName.replace(/[^a-z0-9_]/gi, '_'),
            display_name: pkgName,
            description: `PyPI package matching topic: ${topic}`,
            doc_url: `https://pypi.org/project/${pkgName}/`,
            reason: `PyPI trending: ${pkgName} for topic "${topic}"`,
            keywords: [topic],
          });
        }
      } catch {
        // source unreachable — skip
      }
    }
    return proposals;
  },

  github: async (topics) => {
    const proposals = [];
    for (const topic of topics.slice(0, 2)) {
      try {
        const res = await axios.get(`https://api.github.com/search/repositories`, {
          params: { q: `topic:${topic}`, sort: 'stars', order: 'desc', per_page: 3 },
          timeout: 8000,
          headers: { Accept: 'application/vnd.github+json' },
        });
        for (const repo of (res.data.items || [])) {
          proposals.push({
            type: 'innovation',
            source: 'github',
            name: repo.name.replace(/[^a-z0-9_]/gi, '_'),
            display_name: repo.full_name,
            description: repo.description || '',
            doc_url: repo.homepage || repo.html_url,
            reason: `GitHub trending: ${repo.full_name} (${repo.stargazers_count} stars) — ${repo.description || ''}`,
            keywords: repo.topics || [],
          });
        }
      } catch {
        // source unreachable or rate-limited — skip
      }
    }
    return proposals;
  },
};

function deduplicateVsRegistry(proposals) {
  const active = registry.getActive().map(s => s.display_name?.toLowerCase() || s.name?.toLowerCase());
  const seen = new Set();
  return proposals.filter(p => {
    const key = (p.display_name || p.name).toLowerCase();
    if (seen.has(key) || active.includes(key)) return false;
    seen.add(key);
    return true;
  });
}

async function run(input, _memory) {
  const topics = input.topics || ['llm', 'vector-search', 'agent', 'mcp'];

  const [npmResults, pypiResults, githubResults] = await Promise.all([
    SOURCES.npm(topics),
    SOURCES.pypi(topics),
    SOURCES.github(topics),
  ]);

  const all = [...npmResults, ...pypiResults, ...githubResults];
  const novel = deduplicateVsRegistry(all);

  // Register top proposals
  const saved = novel.slice(0, 5).map(p => registry.propose({
    ...p,
    market_alignment: p.reason,
  }));

  return {
    agent: name,
    role,
    topics_scanned: topics,
    total_found: all.length,
    novel_proposals: novel.length,
    proposals: saved,
    advice: saved.length > 0
      ? `${saved.length} skill proposal(s) ready for Toolsmith synthesis. Review and approve.`
      : 'No novel skills found this scan cycle.',
  };
}

module.exports = { name, role, canApprove, run };
