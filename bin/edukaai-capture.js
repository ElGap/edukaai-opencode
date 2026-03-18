#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];
const dataset = args[1];

const cwd = process.cwd();
const opencodeDir = path.join(cwd, '.opencode');
const configFile = path.join(opencodeDir, 'edukaai-capture-config.json');

function showHelp() {
  console.log(`
EdukaAI OpenCode - Manage conversation capture

Usage:
  npx edukaai-opencode on [dataset]     Activate capture (optional dataset)
  npx edukaai-opencode off              Deactivate capture  
  npx edukaai-opencode status           Check current status

Examples:
  npx edukaai-opencode on               # Use default dataset
  npx edukaai-opencode on my-dataset    # Use specific dataset
  npx edukaai-opencode on 1             # Use dataset ID
  npx edukaai-opencode off
  npx edukaai-opencode status
`);
}

function ensureOpencodeDir() {
  if (!fs.existsSync(opencodeDir)) {
    fs.mkdirSync(opencodeDir, { recursive: true });
  }
}

function saveConfig(enabled, dataset) {
  ensureOpencodeDir();
  
  let datasetId = undefined;
  let datasetName = undefined;
  
  if (dataset) {
    if (/^\d+$/.test(dataset)) {
      datasetId = parseInt(dataset, 10);
    } else {
      datasetName = dataset;
    }
  }
  
  const config = {
    enabled,
    datasetId,
    datasetName,
    lastVerified: new Date().toISOString()
  };
  
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

function activate(dataset) {
  ensureOpencodeDir();
  
  // Save config immediately so status works
  saveConfig(true, dataset);
  
  // Also create the activation file for the plugin to pick up
  const activateFile = path.join(opencodeDir, 'edukaai-activate');
  fs.writeFileSync(activateFile, dataset || '', 'utf-8');
  
  if (dataset) {
    console.log(`✅ Capture activated for dataset: ${dataset}`);
  } else {
    console.log('✅ Capture activated (using default dataset)');
  }
  console.log('   Start OpenCode and begin chatting!');
}

function deactivate() {
  ensureOpencodeDir();
  
  // Update config
  saveConfig(false, null);
  
  // Also create deactivation file
  const deactivateFile = path.join(opencodeDir, 'edukaai-deactivate');
  fs.writeFileSync(deactivateFile, '', 'utf-8');
  
  console.log('✅ Capture deactivated');
}

function status() {
  if (!fs.existsSync(configFile)) {
    console.log('⏸️  Capture not configured');
    console.log('   Run: npx edukaai-capture on [dataset]');
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    const status = config.enabled ? '✅ Active' : '⏸️  Inactive';
    const dataset = config.datasetName || (config.datasetId ? `ID: ${config.datasetId}` : 'Default (server-side)');
    
    console.log(`Status: ${status}`);
    console.log(`Dataset: ${dataset}`);
    if (config.lastVerified) {
      console.log(`Last verified: ${new Date(config.lastVerified).toLocaleString()}`);
    }
  } catch (error) {
    console.error('❌ Error reading config:', error.message);
  }
}

switch (command) {
  case 'on':
  case 'activate':
    activate(dataset);
    break;
  case 'off':
  case 'deactivate':
    deactivate();
    break;
  case 'status':
    status();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }
}
