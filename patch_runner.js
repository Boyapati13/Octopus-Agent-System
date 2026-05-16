const fs = require('fs');

const path = "node/src/runner.js";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    `_emit('chain_start', {
    task,
    plan: planResult.plan.map(s => s.agent),
  });`,
    `_emit('gateway_task_start', {
    status: 'PROCESSING',
    timestamp: new Date().toISOString(),
    message: \`Binding to workspace repo for task: \${task}\`
  });

  _emit('chain_start', {
    task,
    plan: planResult.plan.map(s => s.agent),
  });`
);

content = content.replace(
    `  _emit('chain_done', {
    task,
    success: true,
    duration_ms: Date.now() - startMs,
  });`,
    `  _emit('chain_done', {
    task,
    success: true,
    duration_ms: Date.now() - startMs,
    message: "Task verified successfully."
  });`
);

fs.writeFileSync(path, content, "utf-8");
