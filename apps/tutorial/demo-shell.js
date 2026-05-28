const params = new URLSearchParams(window.location.search);

const title = params.get('title') || 'Demo';
const base = params.get('base') || '../item-editor';
const app = params.get('app') || 'index.html';
const filesParam = params.get('files') || 'index.html,app.js';
const files = filesParam
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

document.title = `${title} Demo - FlowState`;

const previewFrame = document.getElementById('preview-frame');
const fileTabs = document.getElementById('file-tabs');
const codeDisplay = document.getElementById('code-display');
const cache = {};

if (previewFrame) {
  previewFrame.src = `${base}/${app}`;
  previewFrame.title = title;
}

function languageForFile(filename) {
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.html')) return 'html';
  if (filename.endsWith('.css')) return 'css';
  return 'javascript';
}

async function loadFile(filename) {
  if (cache[filename]) return cache[filename];
  const text = await fetch(`${base}/${filename}`).then((r) => r.text());
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

buildFileTabs();
initMainTabs();
if (files[0]) showFile(files[0]);
