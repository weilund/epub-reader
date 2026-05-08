// 目录状态与渲染
let _tocItems = [];
let _ascending = true;

export function getTocItems() {
  return _tocItems;
}

export function clearToc() {
  _tocItems = [];
}

export function renderToc(items, tocListEl, goToFn, tocPanelEl) {
  _tocItems = items;
  renderSorted(tocListEl, goToFn, tocPanelEl);
}

export function toggleSort(tocListEl, goToFn, tocPanelEl) {
  _ascending = !_ascending;
  renderSorted(tocListEl, goToFn, tocPanelEl);
}

function renderSorted(tocListEl, goToFn, tocPanelEl) {
  tocListEl.innerHTML = '';
  const sorted = _ascending ? _tocItems : [..._tocItems].reverse();
  for (const item of sorted) {
    const li = document.createElement('li');
    li.textContent = item.label;
    li.dataset.cfi = item.cfi;
    if (item.depth > 0) li.classList.add('subchapter');
    li.addEventListener('click', () => {
      goToFn(item.cfi);
      tocPanelEl.classList.add('hidden');
    });
    tocListEl.appendChild(li);
  }
  const sortIcon = document.getElementById('tocSortIcon');
  if (sortIcon) sortIcon.textContent = _ascending ? '↓' : '↑';
}

export function flattenToc(toc, depth = 0) {
  let items = [];
  for (const item of toc) {
    items.push({ label: item.label, cfi: item.href, depth });
    if (item.subitems && item.subitems.length > 0) {
      items = items.concat(flattenToc(item.subitems, depth + 1));
    }
  }
  return items;
}
