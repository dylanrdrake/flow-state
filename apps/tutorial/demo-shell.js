const previewFrame = document.getElementById('preview-frame');
const fileTabs = document.getElementById('file-tabs');
const codeDisplay = document.getElementById('code-display');
const cache = {};

let title = 'Demo';
let root = '../item-editor';
let entry = 'index.html';
let files = ['index.html', 'app.js'];

async function resolveDemoConfig() {
  try {
    const cfg = await fetch('./demo-shell.config.json').then((r) => {
      if (!r.ok) throw new Error(`Failed to load demo-shell.config.json (${r.status})`);
      return r.json();
    });

    title = cfg?.title || title;
    root = cfg?.root || root;
    entry = cfg?.entry || entry;
    if (Array.isArray(cfg?.files) && cfg.files.length > 0) {
      files = cfg.files;
    }
  } catch (err) {
    console.warn('[demo-shell] Falling back to built-in demo settings.', err);
  }
}

function languageForFile(filename) {
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.html')) return 'html';
  if (filename.endsWith('.css')) return 'css';
  return 'javascript';
}

async function loadFile(filename) {
  if (cache[filename]) return cache[filename];
  const text = await fetch(`${root}/${filename}`).then((r) => r.text());
  cache[filename] = text;
  return text;
}

async function showFile(filename) {
  document.querySelectorAll('.file-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.file === filename);
  });

  const text = await loadFile(filename);
  const lang = languageForFile(filename);
  codeDisplay.className = `language-${lang}`;
  codeDisplay.textContent = text;
  codeDisplay.removeAttribute('data-highlighted');
  if (window.hljs) hljs.highlightElement(codeDisplay);
}

function buildFileTabs() {
  fileTabs.innerHTML = '';
  files.forEach((filename, index) => {
    const btn = document.createElement('button');
    btn.className = `file-tab${index === 0 ? ' active' : ''}`;
    btn.dataset.file = filename;
    btn.textContent = filename;
    btn.addEventListener('click', () => showFile(filename));
    fileTabs.appendChild(btn);
  });
}

function initMainTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
      });
      document.getElementById('preview-pane').hidden = view !== 'preview';
      document.getElementById('code-pane').hidden = view !== 'code';
      if (view === 'code') {
        const active = document.querySelector('.file-tab.active')?.dataset.file || files[0];
        if (active) showFile(active);
      }
    });
  });
}

async function init() {
  await resolveDemoConfig();
  document.title = `${title} Demo - FlowState`;

  if (previewFrame) {
    previewFrame.src = `${root}/${entry}`;
    previewFrame.title = title;
  }

  buildFileTabs();
  initMainTabs();
  if (files[0]) showFile(files[0]);
}

init();
