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
 * 사람 구분: 아이디 + 숫자 4자리 비밀번호 계정 (users 탭).
 *   비밀번호는 솔트를 섞은 해시로만 저장하고, 5번 틀리면 10분 동안 잠급니다.
 *   로그인하면 서명된 세션 토큰(30일)을 주고, 글의 owner 칸에는 아이디의 해시를 저장합니다.
 *   → 아이디 하나당 가게 하나에 리뷰 1개.
 */

const SHEETS = {
  places:  ['id', 'name', 'category', 'area', 'address', 'signature', 'price', 'description', 'owner', 'createdAt', 'phone'],
  reviews: ['id', 'placeId', 'owner', 'nickname', 'taste', 'service', 'mood', 'value', 'overall', 'revisit', 'body', 'visited', 'createdAt', 'updatedAt'],
  photos:  ['id', 'placeId', 'reviewId', 'owner', 'fileId', 'createdAt'],
  users:   ['username', 'key', 'salt', 'pinHash', 'createdAt']
};
const SESSION_DAYS = 30;
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

/* 충주 맛집 리스트(엑셀)의 가게들을 places 탭에 넣습니다. 리뷰는 넣지 않습니다.
   이미 같은 이름의 가게가 있으면 건너뛰므로 여러 번 실행해도 됩니다. */
function seed() {
  // [상호명, 분류, 동네, 주소, 대표 메뉴, 연락처]
  const list = [
    ["탄금대왕갈비탕", "해장국·탕", "", "충주시 능바우길 35", "갈비탕", "043-857-8577"],
    ["감자서리", "해장국·탕", "", "충주시 행정13길 19", "감자탕", "043-853-2307"],
    ["대림불고기", "고기·구이", "", "충주시 봉방9길 14 대림불고기", "고기", "043-846-7312"],
    ["궁중포크", "고기·구이", "", "충주시 번영대로 71", "고기", "0507-1432-7965"],
    ["간판없는 삼겹살", "고기·구이", "", "충주시 연수상가길 4 1층 간판없는삼겹살", "고기", "010-7548-7273"],
    ["금강식당", "한식", "금가면", "충주시 금가면 마사1길 141", "김치찌개", "043-853-0555"],
    ["춘천메밀촌닭갈비", "고기·구이", "", "충주시 신립로 79 일광빌딩", "닭갈비", "0507-1320-3102"],
    ["동구밖 과수원길", "기타", "", "충주시 충주호수로 1354", "돈까스", "043-843-1233"],
    ["바람꽃", "기타", "", "충주시 직동길 92 예술인마을 상가 1층 바람꽃", "돈까스", "0507-1459-0287"],
    ["생생손두부", "한식", "", "충주시 금봉대로 692", "두부전골", "043-842-4932"],
    ["남한강 막국수", "면·냉면", "중앙탑면", "충주시 중앙탑면 중앙탑길 113", "막국수, 보쌈", "0507-1364-2359"],
    ["메밀마당", "면·냉면", "중앙탑면", "충주시 중앙탑면 탑평리 42", "막국수, 치킨", "0507-1400-0283"],
    ["스마일만두", "한식", "", "충주시 칠금10길 10", "만두전골", "0507-1345-0903"],
    ["시골묵집", "한식", "", "충주시 충주호수로 140", "묵밥", "043-857-7074"],
    ["통나무 묵집", "한식", "", "충주시 안림로 146", "묵밥", "0507-1392-5059"],
    ["듀레베이커리", "카페·디저트", "", "충주시 중원대로 3250 1층(호암점)", "베이커리", "043-848-5451"],
    ["모담보리밥", "한식", "", "충주시 사직로 299-1 모담보리밥", "보리밥", "0507-1329-8931"],
    ["성진복식당", "해장국·탕", "", "충주시 금제1길 25", "복지리탕", "043-843-9179"],
    ["장김밥", "분식", "", "충주시 행정8길 26", "분식", "043-853-4396"],
    ["유선분식", "분식", "", "충주시 예성로 167", "분식", "043-847-2003"],
    ["금능가든", "일식·회", "", "충주시 국원대로 308 1층", "비빔회", "043-848-5101"],
    ["채상궁", "기타", "", "충주시 금곡서2길 23 2층", "샤브샤브", "043-847-0020"],
    ["본가참숯석갈비", "고기·구이", "", "충주시 능바우길 1", "석갈비", "0507-1355-7839"],
    ["강금자 손수제비", "한식", "", "충주시 야현3길 17 강금자손수제비", "수제비", "0507-1417-1346"],
    ["갱고개", "일식·회", "", "충주시 연원로 8 예성빌딩 1층", "숙성회", "043-853-7755"],
    ["일번지 순대국", "해장국·탕", "", "충주시 연수상가2길 9", "순대국", "043-852-4334"],
    ["중원순대", "해장국·탕", "", "충주시 공설시장길 19", "순대국", "043-847-5375"],
    ["진아구", "한식", "", "충주시 호암수청6길 9 1층", "아구찜", "043-847-1049"],
    ["미친 양꼬치", "중식", "", "충주시 갱고개로 142-1", "양꼬치", "043-854-9991"],
    ["석수오리 돌판구이", "고기·구이", "대소원면", "충주시 대소원면 쇠실로 966", "오리고기", "043-852-5291"],
    ["택이네 조개전골", "한식", "", "충주시 갱고개로 166 1층 102호", "조개전골", "043-852-0223"],
    ["조개와 칼국수", "한식", "", "충주시 연수로 58 조개와칼국수", "조개전골", "043-857-1254"],
    ["터줏골 명가", "한식", "", "충주시 금제7길 14 터줏골명가", "짜글이", "0507-1348-4408"],
    ["육짬뽕", "중식", "", "충주시 예성로 312 1층", "짬뽕", "043-857-3999"],
    ["행복짬뽕", "중식", "", "충주시 행정7길 30", "짬뽕", "043-856-8060"],
    ["이씨식당", "한식", "", "충주시 능바우길 15", "쭈꾸미덮밥", "043-848-6066"],
    ["아그집들깨칼국수", "면·냉면", "", "충주시 남산4길 73-7 충주 공판장 뒷편", "칼국수", "043-845-5898"],
    ["풀향기 궁중 칼국수 손만두 전골", "면·냉면", "", "충주시 탄금대로 278 풀향기궁중칼국수", "칼국수", "043-853-0253"],
    ["청정 야채 버섯 칼국수", "면·냉면", "", "충주시 형설로 109", "칼국수", "043-852-6966"],
    ["대전얼큰한칼국수", "면·냉면", "", "충주시 연원10길 3", "칼국수", "043-842-1435"],
    ["국수타령", "면·냉면", "", "충주시 안림로 186", "칼국수", "0507-1368-3231"],
    ["충주홍두깨칼국수보쌈", "면·냉면", "", "충주시 안림로 72", "칼국수", "043-852-7070"],
    ["덕수파스타", "기타", "", "충주시 호암토성5길 46 1층", "파스타", "0507-1377-1036"],
    ["옛날육개장", "해장국·탕", "", "", "육개장", ""],
    ["꼬마등", "기타", "", "", "", ""]
  ];
  const key = s => String(s).replace(/\s/g, '').toLowerCase();
  const names = rows_('places').map(p => key(p.name));
  const now = Date.now();
  // '메밀마당'처럼 이미 '메밀마당 중앙탑본점'으로 들어가 있는 가게도 건너뜀
  list.filter(r => !names.some(n => n.indexOf(key(r[0])) === 0)).forEach((r, i) => append_('places', {
    id: Utilities.getUuid(), name: r[0], category: r[1], area: r[2], address: r[3], signature: r[4],
    price: '', description: '', owner: '', createdAt: now - i, phone: r[5] ? "'" + r[5] : ''
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
    if (req.action === 'register' || req.action === 'login') {
      lock.waitLock(20000);
      return json_({ ok: true, result: req.action === 'register' ? register_(req) : login_(req) });
    }
    const owner = identify_(req);
    lock.waitLock(20000);
    const handlers = { addPlace, deletePlace, saveReview, deleteReview, addPhoto, deletePhoto };
    const fn = handlers[req.action];
    if (!fn) throw new Error('알 수 없는 요청이에요.');
    return json_({ ok: true, result: fn(req, owner) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err), code: err.code || '' });
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
    owner, createdAt: Date.now(), phone: phone_(req.phone)
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
  } else if (sh.getLastColumn() < headers.length) {    // 나중에 추가된 칸(phone 등) 제목 채우기
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
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
  }).filter(o => o[headers[0]] !== "" && o[headers[0]] != null);
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

/* ───────── 계정 ───────── */
function normKey_(username) { return String(username || '').trim().toLowerCase(); }

function register_(req) {
  const username = String(req.username || '').trim();
  if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(username)) throw new Error('아이디는 한글·영문·숫자로 2~12자예요.');
  if (!/^\d{4}$/.test(String(req.pin || ''))) throw new Error('비밀번호는 숫자 4자리예요.');
  const key = normKey_(username);
  if (rows_('users').some(u => String(u.key) === key)) throw new Error('이미 있는 아이디예요. 다른 아이디를 써 주세요.');
  const salt = Utilities.getUuid();
  // 앞에 ' 를 붙여 '0123' 같은 숫자 아이디도 글자 그대로 저장
  append_('users', { username: "'" + username, key: "'" + key, salt, pinHash: pinHash_(salt, req.pin), createdAt: Date.now() });
  return session_(key, username);
}

function login_(req) {
  const key = normKey_(req.username);
  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + hash_(key).slice(0, 40);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('비밀번호를 5번 틀려서 10분 동안 로그인할 수 없어요.');
  const u = rows_('users').find(x => String(x.key) === key);
  if (!u || pinHash_(u.salt, req.pin) !== u.pinHash) {
    cache.put(failKey, String(fails + 1), 600);
    throw new Error('아이디 또는 비밀번호가 맞지 않아요.' + (fails + 1 >= 3 ? ` (${fails + 1}/5회)` : ''));
  }
  cache.remove(failKey);
  return session_(key, String(u.username));
}

function pinHash_(salt, pin) {
  let h = String(salt) + ':' + String(pin);
  for (let i = 0; i < 300; i++) h = hash_(h + ':' + salt);
  return h;
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESSION_SECRET', s); }
  return s;
}
function sign_(data) {
  return Utilities.computeHmacSha256Signature(data, secret_())
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function session_(key, name) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = Utilities.base64EncodeWebSafe(key, Utilities.Charset.UTF_8) + '.' + exp;
  return { token: payload + '.' + sign_(payload), key, name, exp };
}

/* ───────── 사람 확인: 세션 토큰 → owner ───────── */
function identify_(req) {
  const fail = msg => { const e = new Error(msg); e.code = 'auth'; throw e; };
  const parts = String(req.session || '').split('.');
  if (parts.length !== 3) fail('로그인이 필요해요.');
  const payload = parts[0] + '.' + parts[1];
  if (sign_(payload) !== parts[2]) fail('로그인 정보가 올바르지 않아요. 다시 로그인해 주세요.');
  if (!(Number(parts[1]) > Date.now())) fail('로그인이 만료됐어요. 다시 로그인해 주세요.');
  const key = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8');
  return hash_('u:' + key);
}

/* ───────── 값 검사 ───────── */
function text_(v, max, required, label) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (required && !s) throw new Error(label + '을(를) 입력해 주세요.');
  if (/^[=+\-@]/.test(s)) s = "'" + s;          // 수식으로 해석되지 않게
  return s;
}
function phone_(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 20);
  if (s && !/^[0-9\-+() ]+$/.test(s)) throw new Error('연락처는 숫자와 - 만 입력해 주세요.');
  return s ? "'" + s : '';                      // 앞자리 0이 사라지지 않게
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
