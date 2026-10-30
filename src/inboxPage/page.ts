import { zipSync } from 'fflate';
import type { InboxConfig } from '../ui/inbox';
import { inboxApi, type Doer, type InboxApi } from './api';
import {
  animalTitle,
  chunks,
  confirmMatches,
  deleteProblem,
  fileCount,
  parseMeta,
  pathOf,
  safeFileName,
  totalFiles,
  zipNames,
  type Animal,
  type Meta,
} from './model';

/**
 * The teacher's inbox page (M16e, D-049). Everything that came from a student (names, class
 * codes) is put on the page as text, never as markup.
 */

type Child = Node | string | null;

function h(
  tag: string,
  attrs: Record<string, string | boolean | undefined> = {},
  ...kids: Child[]
) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  for (const kid of kids) if (kid !== null) node.append(kid);
  return node;
}

interface Card {
  animal: Animal;
  title: HTMLElement;
  when: HTMLElement;
  more: HTMLElement;
  hidden: HTMLElement[];
  img: HTMLImageElement;
  tick: HTMLInputElement;
}

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function mountInbox(
  root: HTMLElement,
  config: InboxConfig | null,
  doFetch: Doer = (...args) => fetch(...args),
): void {
  const heading = h('h1', {}, 'Class inbox');
  const intro = h(
    'p',
    { class: 'intro' },
    'Puzzles that students sent with Download and send. Looking and downloading need no passcode. Deleting does.',
  );
  const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const main = h('main', { class: 'inbox' }, h('header', {}, heading, intro), status);
  root.replaceChildren(main);

  if (!config) {
    main.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, 'This inbox is not set up'),
        h(
          'p',
          {},
          'This copy of the site was built without an inbox address, so there is nothing to show here. See inbox/README.md.',
        ),
      ),
    );
    return;
  }

  const api: InboxApi = inboxApi(config, doFetch);
  let folders: { folder: string; animals: number }[] = [];
  let current: string | null = null;
  let animals: Animal[] = [];
  const metas = new Map<string, Meta>();
  const cards = new Map<string, Card>();
  const ticked = new Set<string>();
  // The passcode is kept here, in memory, after a right one; it is gone when the page is reloaded.
  let passcode = '';
  let busy = false;

  const say = (text: string) => {
    status.textContent = text;
  };

  // ---- Layout ------------------------------------------------------------------------------
  const folderList = h('ul', { class: 'folders' });
  const folderTitle = h('h2', { id: 'folder-title', tabindex: '-1' }, 'Pick a class');
  const tickAll = h(
    'button',
    { type: 'button', class: 'btn btn-glass', id: 'tick-all' },
    'Tick all',
  );
  const downloadTicked = h('button', {
    type: 'button',
    class: 'btn btn-glass',
    id: 'download-ticked',
  });
  const downloadClass = h(
    'button',
    { type: 'button', class: 'btn btn-glass', id: 'download-class' },
    'Download class as ZIP',
  );
  const deleteClass = h(
    'button',
    { type: 'button', class: 'btn btn-danger', id: 'delete-class' },
    'Delete class…',
  );
  const toolbar = h(
    'div',
    { class: 'toolbar', hidden: true },
    tickAll,
    downloadTicked,
    downloadClass,
    deleteClass,
  );
  const cardList = h('ul', { class: 'cards' });
  const empty = h('p', { class: 'hint' });
  const folderPanel = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'folder-title' },
    folderTitle,
    toolbar,
    empty,
    cardList,
  );
  main.append(
    h(
      'div',
      { class: 'layout' },
      h('nav', { 'aria-label': 'Class folders', class: 'panel' }, folderList),
      folderPanel,
    ),
  );

  // ---- The delete question -----------------------------------------------------------------
  const dlgTitle = h('h2', { id: 'del-title' });
  const dlgText = h('p', { id: 'del-text' });
  const passInput = h('input', {
    id: 'del-pass',
    type: 'password',
    autocomplete: 'new-password',
    autocapitalize: 'off',
    spellcheck: 'false',
    required: true,
  }) as HTMLInputElement;
  const confirmLabel = h('label', { for: 'del-confirm' });
  const confirmInput = h('input', {
    id: 'del-confirm',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;
  const confirmField = h('div', { class: 'field' }, confirmLabel, confirmInput);
  const dlgProblem = h('p', { class: 'problem', id: 'del-problem', role: 'alert' });
  const cancelBtn = h(
    'button',
    { type: 'button', class: 'btn btn-glass', id: 'del-cancel' },
    'Cancel',
  );
  const goBtn = h(
    'button',
    { type: 'submit', class: 'btn btn-danger', id: 'del-go' },
    'Delete for good',
  );
  const form = h(
    'form',
    { novalidate: true },
    dlgTitle,
    dlgText,
    h('div', { class: 'field' }, h('label', { for: 'del-pass' }, 'Inbox passcode'), passInput),
    confirmField,
    dlgProblem,
    h('div', { class: 'row' }, cancelBtn, goBtn),
  );
  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-labelledby': 'del-title', 'aria-describedby': 'del-text' },
    form,
  ) as HTMLDialogElement;
  main.append(dialog);

  let pending: null | {
    needsTyped: boolean;
    run: (pass: string) => ReturnType<InboxApi['deleteAnimal']>;
    done: string;
  } = null;

  function askDelete(options: {
    title: string;
    text: string;
    typed: string | null;
    run: (pass: string) => ReturnType<InboxApi['deleteAnimal']>;
    done: string;
  }): void {
    dlgTitle.textContent = options.title;
    dlgText.textContent = options.text;
    passInput.value = passcode;
    confirmInput.value = '';
    dlgProblem.textContent = '';
    confirmField.hidden = options.typed === null;
    confirmLabel.textContent = options.typed === null ? '' : `Type ${options.typed} to confirm`;
    pending = { needsTyped: options.typed !== null, run: options.run, done: options.done };
    typedTarget = options.typed ?? '';
    syncGo();
    dialog.showModal();
    (passcode ? (options.typed === null ? goBtn : confirmInput) : passInput).focus();
  }
  let typedTarget = '';

  function syncGo(): void {
    const typedOk = !pending?.needsTyped || confirmMatches(confirmInput.value, typedTarget);
    goBtn.setAttribute('aria-disabled', String(!(passInput.value !== '' && typedOk)));
  }
  passInput.addEventListener('input', syncGo);
  confirmInput.addEventListener('input', syncGo);
  cancelBtn.addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pending || goBtn.getAttribute('aria-disabled') === 'true' || busy) {
      if (passInput.value === '') dlgProblem.textContent = 'Type the inbox passcode first.';
      else if (pending?.needsTyped) dlgProblem.textContent = `Type ${typedTarget} to confirm.`;
      return;
    }
    busy = true;
    goBtn.setAttribute('aria-disabled', 'true');
    dlgProblem.textContent = 'Deleting…';
    const reply = await pending.run(passInput.value);
    busy = false;
    if (reply.status === 200) {
      passcode = passInput.value;
      const done = pending.done;
      dialog.close();
      say(done);
      await refresh();
      // The button that opened the question may be gone now, so keep focus somewhere real.
      folderTitle.focus();
      return;
    }
    if (reply.status === 401) passcode = '';
    dlgProblem.textContent = deleteProblem(reply.status, reply.data);
    if (reply.status === 409) {
      dialog.close();
      say(deleteProblem(409, null));
      await refresh();
      return;
    }
    syncGo();
  });
  dialog.addEventListener('close', () => {
    passInput.value = '';
    pending = null;
  });

  // ---- Class folders -----------------------------------------------------------------------
  function renderFolders(): void {
    folderList.replaceChildren(
      ...folders.map((f) => {
        const button = h(
          'button',
          {
            type: 'button',
            class: 'folder-btn',
            'data-folder': f.folder,
            'aria-current': f.folder === current ? 'true' : undefined,
          },
          h('span', { class: 'folder-name' }, f.folder),
          h(
            'span',
            { class: 'folder-count' },
            ` ${f.animals} ${f.animals === 1 ? 'animal' : 'animals'}`,
          ),
          f.folder === current ? h('span', { class: 'here' }, ' (open)') : null,
        );
        button.addEventListener('click', () => void openFolder(f.folder, true));
        return h('li', {}, button);
      }),
    );
  }

  async function refresh(): Promise<void> {
    try {
      folders = await api.folders();
    } catch {
      say('Could not reach the inbox. Check the connection and try again.');
      return;
    }
    if (current && !folders.some((f) => f.folder === current)) current = null;
    renderFolders();
    if (current) await openFolder(current, false);
    else showNoFolder();
  }

  function showNoFolder(): void {
    animals = [];
    cards.clear();
    ticked.clear();
    cardList.replaceChildren();
    toolbar.hidden = true;
    folderTitle.textContent = 'Pick a class';
    empty.textContent = folders.length
      ? 'Choose a class on the left to see its puzzles.'
      : 'Nothing has been sent yet.';
  }

  async function openFolder(folder: string, moveFocus: boolean): Promise<void> {
    current = folder;
    renderFolders();
    folderTitle.textContent = `Class ${folder}`;
    empty.textContent = 'Loading…';
    cardList.replaceChildren();
    toolbar.hidden = true;
    try {
      animals = await api.animals(folder);
    } catch {
      empty.textContent = 'Could not load this class. Check the connection and try again.';
      return;
    }
    metas.clear();
    cards.clear();
    ticked.clear();
    empty.textContent = animals.length ? '' : 'This class has no puzzles in it.';
    toolbar.hidden = animals.length === 0;
    for (const animal of animals) cardList.append(buildCard(animal));
    syncToolbar();
    if (moveFocus) folderTitle.focus();
    say(`${animals.length} ${animals.length === 1 ? 'animal' : 'animals'} in class ${folder}.`);
    void loadPictures(folder, animals);
  }

  // ---- Cards -------------------------------------------------------------------------------
  function buildCard(animal: Animal): HTMLElement {
    const img = h('img', {
      class: 'thumb',
      alt: '',
      width: '256',
      height: '256',
      loading: 'lazy',
    }) as HTMLImageElement;
    const title = h('h3', { class: 'card-title' }, animal.base);
    const when = h('p', { class: 'card-meta' }, WHEN.format(new Date(animal.createdAt)));
    const more = h('p', { class: 'card-meta' });
    const tick = h('input', { type: 'checkbox', class: 'tick' }) as HTMLInputElement;
    const tickName = h('span', { class: 'sr' }, ` ${animal.base}`);
    const dl = h('button', { type: 'button', class: 'btn btn-glass small' }, 'Download STL');
    const dlName = h('span', { class: 'sr' }, ` of ${animal.base}`);
    dl.append(dlName);
    const del = h('button', { type: 'button', class: 'btn btn-danger small' }, 'Delete…');
    const delName = h('span', { class: 'sr' }, ` ${animal.base}`);
    del.append(delName);
    const li = h(
      'li',
      { class: 'card', 'data-base': animal.base },
      img,
      h('div', { class: 'card-body' }, title, when, more),
      h('label', { class: 'tick-row' }, tick, h('span', {}, 'Tick', tickName)),
      h('div', { class: 'row' }, dl, del),
    );
    cards.set(animal.base, {
      animal,
      title,
      when,
      more,
      hidden: [tickName, dlName, delName],
      img,
      tick,
    });
    if (!animal.files.stl) {
      dl.setAttribute('disabled', '');
      more.textContent = 'The STL file is missing.';
    }
    tick.disabled = !animal.files.stl;
    tick.addEventListener('change', () => {
      if (tick.checked) ticked.add(animal.base);
      else ticked.delete(animal.base);
      syncToolbar();
    });
    dl.addEventListener('click', () => void downloadSome([animal]));
    del.addEventListener('click', () => askDeleteAnimal(animal));
    return li;
  }

  function titleOf(animal: Animal): string {
    return animalTitle(animal, metas.get(animal.base));
  }

  function fillCard(animal: Animal): void {
    const card = cards.get(animal.base);
    if (!card) return;
    const meta = metas.get(animal.base);
    const name = titleOf(animal);
    card.title.textContent = name;
    for (const span of card.hidden)
      span.textContent = span.textContent?.startsWith(' of ') ? ` of ${name}` : ` ${name}`;
    card.img.alt = `The cut pieces of ${name}`;
    const when = new Date(meta?.createdAt ?? animal.createdAt);
    if (!Number.isNaN(when.getTime())) card.when.textContent = WHEN.format(when);
    if (animal.files.stl) card.more.textContent = meta?.pieces ? `${meta.pieces} pieces` : '';
  }

  function syncToolbar(): void {
    const n = ticked.size;
    downloadTicked.textContent = n ? `Download ${n} ticked` : 'Download ticked';
    downloadTicked.setAttribute('aria-disabled', String(n === 0));
    const selectable = animals.filter((a) => a.files.stl).length;
    tickAll.textContent = n && n === selectable ? 'Untick all' : 'Tick all';
    downloadClass.setAttribute('aria-disabled', String(selectable === 0));
  }

  tickAll.addEventListener('click', () => {
    const all = animals.filter((a) => a.files.stl);
    const turnOn = ticked.size !== all.length;
    for (const a of all) {
      const card = cards.get(a.base);
      if (card) card.tick.checked = turnOn;
      if (turnOn) ticked.add(a.base);
      else ticked.delete(a.base);
    }
    syncToolbar();
  });

  /** The pictures and the exact names: short links for the PNG and JSON, then read the JSON. */
  async function loadPictures(folder: string, list: Animal[]): Promise<void> {
    const wanted = list
      .flatMap((a) => [
        a.files.png ? pathOf(folder, a, 'png') : null,
        a.files.json ? pathOf(folder, a, 'json') : null,
      ])
      .filter((p): p is string => p !== null);
    const urls: Record<string, string> = {};
    try {
      for (const part of chunks(wanted, 100)) Object.assign(urls, await api.sign(part));
    } catch {
      return;
    }
    if (current !== folder) return;
    for (const a of list) {
      const png = urls[pathOf(folder, a, 'png')];
      const card = cards.get(a.base);
      if (png && card) card.img.src = png;
    }
    await Promise.all(
      chunks(list, 6).map(async (group) => {
        for (const a of group) {
          const link = urls[pathOf(folder, a, 'json')];
          if (!link) continue;
          try {
            const res = await doFetch(link);
            if (res.ok) metas.set(a.base, parseMeta(await res.text()));
          } catch {
            // The picture and the file name are still shown.
          }
          if (current === folder) fillCard(a);
        }
      }),
    );
  }

  // ---- Downloads ---------------------------------------------------------------------------
  function save(data: Blob, name: string): void {
    const url = URL.createObjectURL(data);
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function downloadSome(list: Animal[], zipName?: string): Promise<void> {
    const folder = current;
    const withStl = list.filter((a) => a.files.stl);
    if (!folder || withStl.length === 0 || busy) return;
    busy = true;
    try {
      say(`Getting ${withStl.length === 1 ? 'the file' : `${withStl.length} files`}…`);
      const urls: Record<string, string> = {};
      for (const part of chunks(
        withStl.map((a) => pathOf(folder, a, 'stl')),
        100,
      )) {
        Object.assign(urls, await api.sign(part));
      }
      const got: { title: string; bytes: Uint8Array }[] = [];
      for (const a of withStl) {
        const link = urls[pathOf(folder, a, 'stl')];
        if (!link) throw new Error('missing');
        const res = await doFetch(link);
        if (!res.ok) throw new Error('fetch');
        got.push({ title: titleOf(a), bytes: new Uint8Array(await res.arrayBuffer()) });
        if (withStl.length > 1) say(`Got ${got.length} of ${withStl.length}…`);
      }
      if (got.length === 1 && !zipName) {
        const only = got[0]!;
        save(new Blob([only.bytes as BlobPart], { type: 'model/stl' }), zipNames([only.title])[0]!);
        say(`Saved ${zipNames([only.title])[0]}.`);
      } else {
        const names = zipNames(got.map((g) => g.title));
        const files: Record<string, Uint8Array> = {};
        got.forEach((g, i) => (files[names[i]!] = g.bytes));
        const name = `${safeFileName(zipName ?? `class ${folder}`)}.zip`;
        save(
          new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: 'application/zip' }),
          name,
        );
        say(`Saved ${name} with ${got.length} files.`);
      }
    } catch {
      say('Could not download. Check the connection and try again.');
    } finally {
      busy = false;
    }
  }

  downloadTicked.addEventListener('click', () => {
    if (ticked.size === 0) {
      say('Tick the puzzles you want first.');
      return;
    }
    void downloadSome(
      animals.filter((a) => ticked.has(a.base)),
      current ? `class ${current} ticked` : undefined,
    );
  });
  downloadClass.addEventListener(
    'click',
    () => void downloadSome(animals, current ? `class ${current}` : undefined),
  );

  // ---- Deleting ----------------------------------------------------------------------------
  function askDeleteAnimal(animal: Animal): void {
    const folder = current;
    if (!folder) return;
    const name = titleOf(animal);
    askDelete({
      title: `Delete ${name}?`,
      text: `This removes its ${fileCount(animal)} files (the STL, the picture and the details) from the inbox for good. It cannot be undone.`,
      typed: null,
      run: (pass) => api.deleteAnimal(folder, animal.base, pass),
      done: `Deleted ${name}.`,
    });
  }

  deleteClass.addEventListener('click', () => {
    const folder = current;
    if (!folder) return;
    const files = totalFiles(animals);
    askDelete({
      title: `Delete class ${folder}?`,
      text: `Delete class ${folder}: ${files} ${files === 1 ? 'file' : 'files'} from ${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}. This is for good and cannot be undone.`,
      typed: folder,
      run: (pass) => api.deleteClass(folder, files, pass),
      done: `Deleted class ${folder} (${files} files).`,
    });
  });

  // ---- Start -------------------------------------------------------------------------------
  say('Loading the classes…');
  void refresh().then(() => {
    if (current === null && folders.length)
      say(`${folders.length} ${folders.length === 1 ? 'class' : 'classes'} in the inbox.`);
    else if (folders.length === 0 && status.textContent === 'Loading the classes…')
      say('Nothing has been sent yet.');
  });
}
