# EdukaAI OpenCode

[![CI](https://github.com/elgap/edukaai-opencode/actions/workflows/ci.yml/badge.svg)](https://github.com/elgap/edukaai-opencode/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/@elgap/edukaai-opencode.svg)](https://www.npmjs.com/package/@elgap/edukaai-opencode)

OpenCode plugin to capture conversations to EdukaAI for training data.

## Quick Start

```bash
# 1. Install the plugin
npm install @elgap/edukaai-opencode

# 2. Add to your opencode.json
{
  "plugin": ["@elgap/edukaai-opencode"]
}

# 3. Activate capture (uses default dataset)
npx edukaai-opencode on

# 4. Start OpenCode and chat!
opencode
```

## Installation

```bash
npm install @elgap/edukaai-opencode
```

Or from a local tarball:
```bash
npm install ./elgap-edukaai-opencode-0.1.0-beta.0.tgz
```

**Note:** After install, the plugin copies command files to `.opencode/commands/`. If commands don't appear, run:
```bash
node node_modules/@elgap/edukaai-opencode/bin/postinstall.js
```

## Configuration

### 1. Add to opencode.json

Create or edit `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@elgap/edukaai-opencode"]
}
```

### 2. Set Server URL (Optional)

Create `.env` in your project:
```
EDUKAAI_URL=http://localhost:3030
```

Defaults to `http://localhost:3030` if not set.

## Usage

### Activate Capture

With default dataset:
```bash
npx edukaai-opencode on
```

With specific dataset:
```bash
npx edukaai-opencode on my-dataset
```

With dataset ID:
```bash
npx edukaai-opencode on 1
```

### Deactivate Capture

```bash
npx edukaai-opencode off
```

### Check Status

```bash
npx edukaai-opencode status
```

Shows whether capture is active and which dataset is configured.

### Get Help

```bash
npx edukaai-opencode --help
```

## How It Works

1. **CLI creates config**: Running `npx edukaai-opencode on` creates `.opencode/edukaai-capture-config.json`
2. **Plugin loads on OpenCode startup**: Reads config and starts monitoring
3. **Captures conversations**: On each completed conversation (session.idle), sends user-assistant pairs to EdukaAI
4. **Automatic cleanup**: Removes processing files after activation/deactivation

**Note**: The plugin captures ALL text content including responses after tool usage (web search, file reads, etc).

## Data Format

Sent to `POST /api/capture`:

```json
{
  "source": "opencode",
  "apiVersion": "1.0",
  "session": {
    "id": "opencode_1234567890",
    "name": "Session abc123",
    "startedAt": "2026-03-18T..."
  },
  "records": [{
    "instruction": "user message",
    "output": "assistant response",
    "messageId": "msg_abc123",
    "timestamp": "2026-03-18T...",
    "context": {
      "environment": {
        "os": "darwin",
        "workingDirectory": "/path/to/project",
        "projectName": "my-project"
      }
    }
  }],
  "options": {
    "datasetId": 1,
    "autoApprove": false,
    "skipDuplicates": true,
    "enrichMetadata": true
  }
}
```

When no dataset is specified, `datasetId` is omitted and the server uses its default.

## Troubleshooting

### Check if plugin is working

View the log file:
```bash
cat .opencode/edukaai-capture.log
```

### Plugin not capturing

1. Check activation status:
   ```bash
   npx edukaai-opencode status
   ```

2. Verify config file exists:
   ```bash
   cat .opencode/edukaai-capture-config.json
   ```

3. Check logs for errors:
   ```bash
   tail -f .opencode/edukaai-capture.log
   ```

## Files Created

- `.opencode/edukaai-capture-config.json` - Plugin configuration
- `.opencode/edukaai-capture.log` - Debug and error logs

## Contributing

## License

MIT
