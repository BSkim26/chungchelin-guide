/**
 * 충슐랭 가이드 — Google 스프레드시트 백엔드 (Apps Script)
 *
 * 설치: 스프레드시트 > 확장 프로그램 > Apps Script 에 이 파일 내용을 통째로 붙여넣고
 *       1) 함수 목록에서 setup 을 골라 실행(권한 허용)
 *       2) 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자) → 웹 앱 URL 을 config.js 에 넣기
 *
 * 탭 구조 (setup 이 자동으로 만듭니다)
 *   places  : 맛집
 *   reviews : 리뷰 (한 사람당 가게 하나에 리뷰 하나, overall = 네 항목 평균)
 *   photos  : 사진 (파일은 드라이브 '충슐랭 사진' 폴더, 여기엔 파일 id)
 *
 * '사람'은 로그인 대신 브라우저마다 만든 비밀 토큰으로 구분합니다.
 * 시트에는 토큰의 SHA-256 해시(owner)만 저장하고, 수정·삭제는 같은 토큰을 가진 브라우저만 할 수 있습니다.
 */

const SHEETS = {
  places:  ['id', 'name', 'category', 'area', 'address', 'signature', 'price', 'description', 'owner', 'createdAt'],
  reviews: ['id', 'placeId', 'owner', 'nickname', 'taste', 'service', 'mood', 'value', 'overall', 'revisit', 'body', 'visited', 'createdAt', 'updatedAt'],
  photos:  ['id', 'placeId', 'reviewId', 'owner', 'fileId', 'createdAt']
};
const CATS = ['한식', '해장국·탕', '면·냉면', '고기·구이', '중식', '일식·회', '분식', '카페·디저트', '기타'];
const FOLDER_NAME = '충슐랭 사진';
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

/* ───────── 최초 1회 실행 ───────── */
function setup() {
  Object.keys(SHEETS).forEach(sheet_);
  folder_();
  // 첫 번째 기본 탭(시트1)이 비어 있으면 정리
  const ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(s => {
    if (!SHEETS[s.getName()] && s.getLastRow() === 0 && ss.getSheets().length > 3) ss.deleteSheet(s);
  });
}

/* (선택) 처음 목록에 보일 충주 가게 4곳. 리뷰는 넣지 않습니다. */
function seed() {
  const list = [
    ['삼정면옥', '면·냉면', '성내동', '충주시 관아3길 21', '평양냉면, 수육', 2, '1979년부터 평양냉면과 수육을 내어온 노포.'],
    ['장금옥', '해장국·탕', '동량면', '충주시 동량면 대미길 13', '올갱이해장국, 올갱이장떡', 1, '된장 베이스의 순한 올갱이해장국 전문점.'],
    ['운정식당', '해장국·탕', '', '', '올뱅이해장국', 1, '새벽 6시부터 문을 여는 올뱅이해장국집.'],
    ['메밀마당 중앙탑본점', '면·냉면', '중앙탑면', '', '메밀치킨, 막국수', 2, '바삭한 메밀치킨과 막국수 조합으로 알려진 곳.']
  ];
  const names = rows_('places').map(p => p.name);
  list.filter(r => names.indexOf(r[0]) < 0).forEach(r => append_('places', {
    id: Utilities.getUuid(), name: r[0], category: r[1], area: r[2], address: r[3], signature: r[4],
    price: r[5], description: r[6], owner: '', createdAt: Date.now()
  }));
}

/* ───────── 웹 앱 진입점 ───────── */
function doGet() {
  try {
    return json_({ ok: true, places: rows_('places'), reviews: rows_('reviews'), photos: rows_('photos') });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    if (!req.token || String(req.token).length < 20) throw new Error('잘못된 요청이에요.');
    const owner = hash_(req.token);
    lock.waitLock(20000);
    const handlers = { addPlace, deletePlace, saveReview, deleteReview, addPhoto, deletePhoto };
    const fn = handlers[req.action];
    if (!fn) throw new Error('알 수 없는 요청이에요.');
    return json_({ ok: true, result: fn(req, owner) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ───────── 맛집 ───────── */
function addPlace(req, owner) {
  const name = text_(req.name, 40, true, '가게 이름');
  if (CATS.indexOf(req.category) < 0) throw new Error('분류를 골라 주세요.');
  const key = s => String(s).replace(/\s/g, '').toLowerCase();
  if (rows_('places').some(p => key(p.name) === key(name))) throw new Error('이미 등록된 가게예요. 목록에서 찾아 리뷰를 남겨 주세요.');
  const row = {
    id: Utilities.getUuid(), name, category: req.category,
    area: text_(req.area, 20), address: text_(req.address, 80), signature: text_(req.signature, 40),
    price: clampInt_(req.price, 1, 4, 2), description: text_(req.description, 200),
    owner, createdAt: Date.now()
  };
  append_('places', row);
  return { id: row.id };
}

function deletePlace(req, owner) {
  const p = find_('places', req.id);
  if (!p || p.row.owner !== owner) throw new Error('내가 등록한 가게만 삭제할 수 있어요.');
  if (rows_('reviews').some(r => r.placeId === req.id)) throw new Error('리뷰가 있는 가게는 삭제할 수 없어요.');
  rows_('photos').filter(ph => ph.placeId === req.id).forEach(ph => removePhoto_(ph));
  sheet_('places').deleteRow(p.index);
  return true;
}

/* ───────── 리뷰 ───────── */
function saveReview(req, owner) {
  if (!find_('places', req.placeId)) throw new Error('가게를 찾을 수 없어요.');
  const s = {};
  ['taste', 'service', 'mood', 'value'].forEach(k => {
    const v = Number(req[k]);
    if (!(v >= 1 && v <= 5 && Math.floor(v) === v)) throw new Error('모든 항목에 1~5점을 매겨 주세요.');
    s[k] = v;
  });
  const visited = String(req.visited || '');
  if (visited && !/^\d{4}-\d{2}$/.test(visited)) throw new Error('방문한 달 형식이 올바르지 않아요.');
  const now = Date.now();
  const existing = rows_('reviews').find(r => r.placeId === req.placeId && r.owner === owner);
  const row = {
    id: existing ? existing.id : Utilities.getUuid(),
    placeId: req.placeId, owner,
    nickname: text_(req.nickname, 20, true, '닉네임'),
    taste: s.taste, service: s.service, mood: s.mood, value: s.value,
    overall: Math.round((s.taste + s.service + s.mood + s.value) / 4 * 10) / 10,
    revisit: req.revisit ? 'Y' : 'N',
    body: text_(req.body, 600),
    visited: visited ? "'" + visited : '',      // 날짜로 자동 변환되지 않게
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  };
  if (existing) {
    const f = find_('reviews', existing.id);
    sheet_('reviews').getRange(f.index, 1, 1, SHEETS.reviews.length).setValues([SHEETS.reviews.map(h => row[h])]);
  } else {
    append_('reviews', row);
  }
  return { id: row.id };
}

function deleteReview(req, owner) {
  const f = find_('reviews', req.id);
  if (!f || f.row.owner !== owner) throw new Error('내 리뷰만 삭제할 수 있어요.');
  rows_('photos').filter(ph => ph.reviewId === req.id).forEach(ph => removePhoto_(ph));
  sheet_('reviews').deleteRow(find_('reviews', req.id).index);
  return true;
}

/* ───────── 사진 ───────── */
function addPhoto(req, owner) {
  if (!find_('places', req.placeId)) throw new Error('가게를 찾을 수 없어요.');
  const reviewId = req.reviewId || '';
  if (reviewId) {
    const r = find_('reviews', reviewId);
    if (!r || r.row.owner !== owner) throw new Error('내 리뷰에만 사진을 올릴 수 있어요.');
  }
  const count = rows_('photos').filter(ph => ph.placeId === req.placeId && ph.owner === owner && String(ph.reviewId) === reviewId).length;
  if (count >= MAX_PHOTOS) throw new Error('사진은 최대 3장까지 올릴 수 있어요.');
  const bytes = Utilities.base64Decode(String(req.data || '').replace(/^data:image\/jpeg;base64,/, ''));
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('사진 용량이 너무 커요.');
  if (!(bytes[0] === -1 && bytes[1] === -40)) throw new Error('JPEG 사진만 올릴 수 있어요.'); // FF D8
  const id = Utilities.getUuid();
  const file = folder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  append_('photos', { id, placeId: req.placeId, reviewId, owner, fileId: file.getId(), createdAt: Date.now() });
  return { id, fileId: file.getId() };
}

function deletePhoto(req, owner) {
  const f = find_('photos', req.id);
  if (!f || f.row.owner !== owner) throw new Error('내 사진만 삭제할 수 있어요.');
  removePhoto_(f.row);
  return true;
}

function removePhoto_(ph) {
  try { DriveApp.getFileById(ph.fileId).setTrashed(true); } catch (_) {}
  const f = find_('photos', ph.id);
  if (f) sheet_('photos').deleteRow(f.index);
}

/* ───────── 시트 도우미 ───────── */
function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const headers = SHEETS[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = SHEETS[name];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map(r => {
    const o = {};
    headers.forEach((h, i) => { const v = r[i]; o[h] = v instanceof Date ? v.toISOString() : v; });
    return o;
  }).filter(o => o.id);
}

function find_(name, id) {
  if (!id) return null;
  const list = rows_(name);
  const i = list.findIndex(r => r.id === id);
  return i < 0 ? null : { row: list[i], index: i + 2 };
}

function append_(name, obj) {
  sheet_(name).appendRow(SHEETS[name].map(h => obj[h] === undefined ? '' : obj[h]));
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (_) {} }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

/* ───────── 값 검사 ───────── */
function text_(v, max, required, label) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (required && !s) throw new Error(label + '을(를) 입력해 주세요.');
  if (/^[=+\-@]/.test(s)) s = "'" + s;          // 수식으로 해석되지 않게
  return s;
}
function clampInt_(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return n >= lo && n <= hi ? n : dflt;
}
function hash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
