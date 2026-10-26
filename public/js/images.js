import { $, escapeHtml, uid } from './util.js';

const MAX_DIMENSION = 1600;
const MAX_RAW_BYTES = 1.5 * 1024 * 1024;

let images = [];
let maxImages = 10;

export function initImages(config) {
  maxImages = config.generation.maxImages;
  const input = $('#image-input');
  const drop = $('#image-drop');

  $('#image-browse').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    await addFiles([...input.files]);
    input.value = '';
  });

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    await addFiles([...e.dataTransfer.files]);
  });

  document.addEventListener('paste', async (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      await addFiles(files);
    }
  });

  $('#image-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    images = images.filter((img) => img.id !== btn.dataset.id);
    render();
  });
}

export function getImages() {
  return images.map(({ dataUrl }) => ({ dataUrl }));
}

async function addFiles(files) {
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    if (images.length >= maxImages) {
      alert(`最多 ${maxImages} 張截圖`);
      break;
    }
    images.push({ id: uid(), name: file.name, dataUrl: await toDataUrl(file) });
  }
  render();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 大圖縮小以節省 token 與傳輸量 */
async function toDataUrl(file) {
  const original = await readAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = original;
  });
  const supported = /^image\/(png|jpeg|gif|webp)$/.test(file.type);
  const tooBig = file.size > MAX_RAW_BYTES || Math.max(img.width, img.height) > MAX_DIMENSION;
  if (supported && !tooBig) return original;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function render() {
  $('#image-list').innerHTML = images
    .map(
      (img) => `<div class="image-item" title="${escapeHtml(img.name)}">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
        <button type="button" data-id="${img.id}" aria-label="移除">×</button>
      </div>`
    )
    .join('');
}
