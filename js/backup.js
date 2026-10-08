/* ============================================================
   backup.js · 自動備份到你自己的資料夾
   用瀏覽器的 File System Access API：你選一次資料夾（建議選
   iCloud Drive / Dropbox 裡的夾），之後每次資料變動就自動寫檔。
   雲端硬碟本來就會幫你同步，等於白嫖一個後端。

   設計成「同步介面」的其中一種實作，之後要再加 Supabase
   只是多一個 adapter，不用改這支也不用改 storage.js。
   ============================================================ */
var Backup = (function () {
  'use strict';

  var DB_NAME = 'dualtrack-backup';
  var STORE = 'handles';
  var KEY = 'dir';
  var MAIN_FILE = 'dualtrack-backup.json';

  var dirHandle = null;
  var lastAt = null;
  var lastError = null;
  var writing = false;
  var listeners = [];

  function supported() {
    return typeof window !== 'undefined' &&
      typeof window.showDirectoryPicker === 'function' &&
      window.isSecureContext;
  }

  /* 不支援的原因，用來給使用者看得懂的訊息 */
  function unsupportedReason() {
    if (typeof window === 'undefined') return '';
    if (!window.isSecureContext) {
      return location.protocol === 'file:'
        ? '直接用 file:// 開啟時不能用自動備份。改用 http://localhost 或上傳到 GitHub Pages 就可以。'
        : '這個連線不是安全連線（需要 https）。';
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      return '這個瀏覽器不支援自動備份（目前只有 Chrome 和 Edge 的桌面版支援）。你還是可以用下面的手動匯出。';
    }
    return '';
  }

  /* ---------- 存放資料夾權杖的小型 IndexedDB ---------- */

  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(STORE, mode);
        var out;
        try { out = fn(tx.objectStore(STORE)); } catch (e) { reject(e); return; }
        tx.oncomplete = function () {
          db.close();
          /* out 是 IDBRequest，要取它的 result；找不到 key 時 result 本來就是 undefined，
             不能用 typeof 判斷，否則會把 request 物件本身傳出去。 */
          resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
        };
        tx.onerror = function () { db.close(); reject(tx.error); };
      };
    });
  }

  function saveHandle(h) { return idb('readwrite', function (s) { return s.put(h, KEY); }); }
  function loadHandle() { return idb('readonly', function (s) { return s.get(KEY); }); }
  function clearHandle() { return idb('readwrite', function (s) { return s.delete(KEY); }); }

  /* ---------- 權限 ---------- */

  function queryPerm(h) {
    if (!h || !h.queryPermission) return Promise.resolve('granted');
    return h.queryPermission({ mode: 'readwrite' });
  }
  function requestPerm(h) {
    if (!h || !h.requestPermission) return Promise.resolve('granted');
    return h.requestPermission({ mode: 'readwrite' });
  }

  /* ---------- 對外 ---------- */

  /* 回傳 'off' | 'ready' | 'needs-permission' | 'unsupported' */
  function state() {
    if (!supported()) return 'unsupported';
    if (!dirHandle) return 'off';
    return dirHandle._perm === 'granted' ? 'ready' : 'needs-permission';
  }

  function status() {
    return {
      state: state(),
      supported: supported(),
      reason: unsupportedReason(),
      folder: dirHandle ? dirHandle.name : null,
      lastAt: lastAt,
      lastError: lastError,
      file: MAIN_FILE
    };
  }

  function emit() { listeners.forEach(function (fn) { try { fn(status()); } catch (e) { /* 忽略 */ } }); }
  function onChange(fn) { listeners.push(fn); }

  /* 開啟時呼叫：把上次選的資料夾找回來，並問瀏覽器還有沒有權限 */
  function init() {
    if (!supported()) return Promise.resolve(status());
    return loadHandle().then(function (h) {
      if (!h) return status();
      dirHandle = h;
      return queryPerm(h).then(function (p) {
        dirHandle._perm = p;
        return status();
      });
    }).catch(function (e) {
      lastError = String(e && e.message || e);
      return status();
    });
  }

  /* 必須由使用者的點擊觸發 */
  function chooseFolder() {
    if (!supported()) return Promise.reject(new Error(unsupportedReason()));
    return window.showDirectoryPicker({ mode: 'readwrite', id: 'dualtrack' })
      .then(function (h) {
        dirHandle = h;
        dirHandle._perm = 'granted';
        lastError = null;
        return saveHandle(h);
      })
      .then(function () { emit(); return status(); });
  }

  function reauthorize() {
    if (!dirHandle) return Promise.reject(new Error('還沒有選過資料夾'));
    return requestPerm(dirHandle).then(function (p) {
      dirHandle._perm = p;
      emit();
      if (p !== 'granted') throw new Error('沒有取得資料夾權限');
      return status();
    });
  }

  function disconnect() {
    dirHandle = null;
    lastAt = null;
    lastError = null;
    return clearHandle().then(function () { emit(); return status(); });
  }

  function writeFile(name, text) {
    return dirHandle.getFileHandle(name, { create: true })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
  }

  /* 主檔每次覆寫；另外每天留一份當天的快照，萬一主檔寫壞還有得救 */
  function write(text, dateStr) {
    if (state() !== 'ready') return Promise.reject(new Error('備份資料夾還沒準備好'));
    if (writing) return Promise.resolve(status());
    writing = true;
    return writeFile(MAIN_FILE, text)
      .then(function () { return writeFile('dualtrack-' + dateStr + '.json', text); })
      .then(function () {
        lastAt = new Date().toISOString();
        lastError = null;
      })
      .catch(function (e) {
        lastError = String(e && e.message || e);
        throw e;
      })
      .then(function () { writing = false; emit(); return status(); },
            function (e) { writing = false; emit(); throw e; });
  }

  /* 從資料夾把主檔讀回來（換電腦時用） */
  function readLatest() {
    if (!dirHandle) return Promise.reject(new Error('還沒有選過資料夾'));
    return requestPerm(dirHandle).then(function (p) {
      dirHandle._perm = p;
      if (p !== 'granted') throw new Error('沒有取得資料夾權限');
      return dirHandle.getFileHandle(MAIN_FILE);
    })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); });
  }

  /* 請瀏覽器不要在空間不足時自動清掉我們的資料 */
  function requestPersistent() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(null);
    return navigator.storage.persisted()
      .then(function (already) { return already ? true : navigator.storage.persist(); })
      .catch(function () { return null; });
  }

  return {
    supported: supported,
    unsupportedReason: unsupportedReason,
    init: init,
    state: state,
    status: status,
    onChange: onChange,
    chooseFolder: chooseFolder,
    reauthorize: reauthorize,
    disconnect: disconnect,
    write: write,
    readLatest: readLatest,
    requestPersistent: requestPersistent
  };
})();
