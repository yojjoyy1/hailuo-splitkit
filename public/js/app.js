import { getConfig } from './api.js';
import { initProject } from './project.js';
import { initKeys } from './keys.js';
import { initImages } from './images.js';
import { initOptions } from './options.js';
import { initPipeline } from './pipeline.js';

async function main() {
  try {
    const config = await getConfig();
    initProject(config, () => (document.querySelector('#form-error').classList.add('hidden')));
    await initKeys(config);
    initImages(config);
    initOptions(config);
    initPipeline(config);
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="form-error">無法載入設定：${err.message}<br />請確認已用 npm start 啟動伺服器。</p>`;
  }
}

main();
