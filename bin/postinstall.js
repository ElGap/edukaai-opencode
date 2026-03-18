const fs = require('fs');
const path = require('path');

const instructions = `
╔══════════════════════════════════════════════════════════════════╗
║           @elgap/edukaai-opencode - Installed!                  ║
╚══════════════════════════════════════════════════════════════════╝

QUICK START:

1. Add to your opencode.json:
   
   {
     "plugin": ["@elgap/edukaai-opencode"]
   }

2. Set server URL (create .env - optional):
   
   EDUKAAI_URL=http://localhost:3030

3. Activate capture:
   
   npx edukaai-opencode on

4. Start OpenCode and chat!
   
   opencode

USAGE:
   npx edukaai-opencode on [dataset]  - Activate capture
   npx edukaai-opencode off           - Deactivate capture
   npx edukaai-opencode status        - Check current status
   npx edukaai-opencode --help        - Show all options

DOCS: https://github.com/elgap/edukaai-opencode
`;

const cwd = process.cwd();
const commandsDir = path.join(cwd, '.opencode', 'commands');
const pkgCommandsDir = path.join(__dirname, '..', 'commands');

console.log(instructions);

if (fs.existsSync(pkgCommandsDir)) {
  try {
    fs.mkdirSync(commandsDir, { recursive: true });
    const files = fs.readdirSync(pkgCommandsDir);
    for (const file of files) {
      fs.copyFileSync(
        path.join(pkgCommandsDir, file),
        path.join(commandsDir, file)
      );
    }
    console.log('✓ Commands copied to .opencode/commands/');
  } catch (e) {
    console.log('⚠ Could not copy commands:', e.message);
  }
}
