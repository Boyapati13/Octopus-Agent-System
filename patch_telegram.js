const fs = require('fs');

const path = "node/src/gateways/telegram.js";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    `  _isRateLimited(userId) {
    const last = this.lastMsg.get(userId) || 0;
    if (Date.now() - last < 3000) return true;
    this.lastMsg.set(userId, Date.now());
    return false;
  }`,
    `  _isRateLimited(userId) {
    const now = Date.now();
    const last = this.lastMsg.get(userId) || 0;

    // Cleanup old rate limit entries to prevent memory leak
    if (now % 10 === 0) {
      for (const [key, timestamp] of this.lastMsg.entries()) {
        if (now - timestamp > 60000) {
          this.lastMsg.delete(key);
        }
      }
    }

    if (now - last < 3000) return true;
    this.lastMsg.set(userId, now);
    return false;
  }`
);

fs.writeFileSync(path, content, "utf-8");
