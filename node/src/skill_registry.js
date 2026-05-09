'use strict';
/**
 * Skill Registry — lifecycle store for auto-synthesized MCP tools.
 * Statuses: proposed → sandbox → active → deprecated
 * Persisted to data/skill_registry.json
 */
const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const REGISTRY_PATH = path.join(__dirname, '../../data/skill_registry.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { skills: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function now() {
  return new Date().toISOString();
}

function propose(proposal) {
  const data = load();
  const skill = {
    skill_id: `skill_${randomUUID().slice(0, 8)}`,
    status: 'proposed',
    created_at: now(),
    updated_at: now(),
    qa_result: null,
    ...proposal,
  };
  data.skills.push(skill);
  save(data);
  return skill;
}

function getSkill(skill_id) {
  return load().skills.find(s => s.skill_id === skill_id) || null;
}

function listSkills(status = null) {
  const data = load();
  return status ? data.skills.filter(s => s.status === status) : data.skills;
}

function updateSkill(skill_id, patch) {
  const data = load();
  const idx = data.skills.findIndex(s => s.skill_id === skill_id);
  if (idx === -1) throw new Error(`Skill not found: ${skill_id}`);
  data.skills[idx] = { ...data.skills[idx], ...patch, updated_at: now() };
  save(data);
  return data.skills[idx];
}

function updateQA(skill_id, result) {
  return updateSkill(skill_id, { qa_result: result });
}

function deploy(skill_id) {
  const skill = getSkill(skill_id);
  if (!skill) throw new Error(`Skill not found: ${skill_id}`);
  if (skill.status !== 'sandbox') throw new Error(`Skill must be in sandbox to deploy (is: ${skill.status})`);
  if (!skill.qa_result?.passed) throw new Error('Skill must pass QA before deployment');
  return updateSkill(skill_id, { status: 'active' });
}

function retire(skill_id, reason = '') {
  return updateSkill(skill_id, { status: 'deprecated', retire_reason: reason });
}

function getActive() {
  return listSkills('active');
}

module.exports = { propose, getSkill, listSkills, updateSkill, updateQA, deploy, retire, getActive };
