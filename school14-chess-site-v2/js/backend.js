/*
  Supabase-тэй харилцах жижиг давхарга (нэмэлт сан ашиглахгүй, зөвхөн fetch).

  Нийтийн хуудас (athletes.html) ба админ хуудас (admin.html) хоёул үүгээр дамжина.
  Хэн юу уншиж, бичиж чадахыг энэ файл шийдэхгүй — сервер дээрх дүрэм
  (supabase/schema.sql) шийднэ. Энд зөвхөн хүсэлт илгээж, хариуг ойлгомжтой болгоно.
*/
const Backend = (() => {
  'use strict';

  const config = typeof BACKEND_CONFIG !== 'undefined' ? BACKEND_CONFIG : {};
  const baseUrl = (config.url || '').trim().replace(/\/+$/, '');
  const anonKey = (config.anonKey || '').trim();
  const isConfigured = /^https?:\/\//.test(baseUrl) && anonKey.length > 0;

  const PHOTO_BUCKET = 'athlete-photos';
  const SESSION_KEY = 'club-admin-session';

  /** Хэрэглэгчид харуулах монгол тайлбартай алдаа. */
  class BackendError extends Error {
    constructor(message, { status = 0, code = '' } = {}) {
      super(message);
      this.name = 'BackendError';
      this.status = status;
      this.code = code;
    }
  }

  /* Нэвтрэлтийн мэдээлэл --------------------------------------------------- */

  // Токен зөвхөн энэ таб нээлттэй байх хугацаанд хадгалагдана (таб хаахад устна).
  // Токен нь нууц үг биш: богино хугацаатай бөгөөд эрхийг сервер шалгана.
  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    session = null;
  }

  function saveSession(next) {
    session = next;
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // sessionStorage хаалттай бол нэвтрэлт зөвхөн хуудсыг дахин ачаалах хүртэл үргэлжилнэ.
    }
  }

  function toSession(data) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      email: data.user?.email || '',
    };
  }

  /* Хүсэлт илгээх ---------------------------------------------------------- */

  function describeError(status, body) {
    const detail = body?.message || body?.msg || body?.error_description || body?.error || '';
    if (status === 401) return 'Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.';
    if (status === 403) return 'Энэ үйлдлийг хийх эрх алга.';
    if (status === 413) return 'Файл хэт том байна.';
    if (status === 429) return 'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.';
    if (/row-level security|permission denied/i.test(detail)) return 'Энэ үйлдлийг хийх эрх алга.';
    if (/publish_requires_consent/i.test(detail)) {
      return 'Мэдээлэл нийтлэх зөвшөөрөл баталгаажаагүй тамирчныг нийтлэх боломжгүй.';
    }
    if (/too_many_registrations/.test(detail)) {
      return 'Энэ утаснаас өнөөдөр хэт олон бүртгэл илгээсэн байна. Маргааш дахин оролдох эсвэл утсаар холбогдоно уу.';
    }
    if (/school_type_required/.test(detail)) return 'Аль сургуулийн сурагч болохыг сонгоно уу.';
    if (/consent_required/.test(detail)) return 'Мэдээлэл хадгалах зөвшөөрлийг тэмдэглэнэ үү.';
    if (/parent_phone_check/.test(detail)) return 'Утасны дугаар 8 оронтой байх ёстой.';
    if (/payments_one_per_period|duplicate key/.test(detail)) {
      return 'Энэ хүүхдийн тухайн үеийн төлбөр аль хэдийн баталгаажсан байна.';
    }
    if (/violates check constraint/.test(detail)) return 'Зарим талбарын утга буруу байна. Шалгаад дахин илгээнэ үү.';
    if (/mime type|not supported/i.test(detail)) return 'Энэ төрлийн файлыг хүлээн авахгүй.';
    if (/exceeded the maximum|too large/i.test(detail)) return 'Файл хэт том байна.';
    if (status >= 500) return 'Сервер түр ажиллахгүй байна. Дараа дахин оролдоно уу.';
    return detail ? `Алдаа гарлаа: ${detail}` : `Алдаа гарлаа (код ${status}).`;
  }

  // Хуучин «anon» түлхүүр (JWT) нь Authorization толгойд мөн очих ёстой;
  // шинэ «publishable» түлхүүрийг зөвхөн apikey толгойд илгээнэ.
  function authHeaders(token) {
    const headers = { apikey: anonKey };
    if (token) headers.Authorization = 'Bearer ' + token;
    else if (anonKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + anonKey;
    return headers;
  }

  async function request(path, { method = 'GET', body, headers = {}, token, raw = false } = {}) {
    if (!isConfigured) {
      throw new BackendError('Өгөгдлийн серверийн тохиргоо хийгдээгүй байна.', {
        code: 'not-configured',
      });
    }

    const options = { method, headers: { ...authHeaders(token), ...headers } };
    if (body instanceof Blob) {
      options.body = body;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(baseUrl + path, options);
    } catch {
      throw new BackendError('Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.', {
        code: 'network',
      });
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      if (response.status === 401 && token) saveSession(null);
      throw new BackendError(describeError(response.status, errorBody), {
        status: response.status,
        code: errorBody?.code || errorBody?.error_code || '',
      });
    }

    if (raw) return response;
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Хугацаа нь дуусах дөхсөн токеныг шинэчилж, хүчинтэй токен буцаана.
  async function accessToken() {
    if (!session) {
      throw new BackendError('Нэвтрээгүй байна.', { status: 401, code: 'signed-out' });
    }
    if (session.expiresAt - Date.now() < 60_000) {
      try {
        const data = await request('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: { refresh_token: session.refreshToken },
        });
        saveSession({ ...toSession(data), email: data.user?.email || session.email });
      } catch (error) {
        saveSession(null);
        throw new BackendError('Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.', {
          status: 401,
          code: 'session-expired',
        });
      }
    }
    return session.accessToken;
  }

  /* Нэвтрэх, гарах --------------------------------------------------------- */

  async function signIn(email, password) {
    let data;
    try {
      data = await request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email, password },
      });
    } catch (error) {
      if (error.status === 400 || error.status === 401 || error.status === 422) {
        throw new BackendError('Имэйл эсвэл нууц үг буруу байна.', { status: error.status });
      }
      throw error;
    }
    saveSession(toSession(data));
  }

  async function signOut() {
    const token = session?.accessToken;
    saveSession(null);
    if (token) {
      // Сервер дээрх нэвтрэлтийг хүчингүй болгоно; амжилтгүй болсон ч хөтөч талд гарсан хэвээр.
      await request('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
    }
  }

  /** Нэвтэрсэн хэрэглэгч админы жагсаалтад байгаа эсэхийг серверээс асууна. */
  async function isAdmin() {
    const token = await accessToken();
    return (await request('/rest/v1/rpc/is_admin', { method: 'POST', body: {}, token })) === true;
  }

  /* Хүснэгтүүд ------------------------------------------------------------- */

  const idFilter = (id) => `id=eq.${encodeURIComponent(id)}`;

  /** Нийтийн уншилт: нэвтрэлт шаардахгүй (зөвхөн public_* харагдацууд нээлттэй). */
  const readPublic = (view, query = 'select=*') => request(`/rest/v1/${view}?${query}`);

  /** Нийтийн функц дуудах (бүртгүүлэх, төлөв шалгах). Сервер өөрөө шалгаж, хязгаарлана. */
  const callPublic = (name, args) =>
    request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });

  /** Админы уншилт. */
  const list = async (table, query = 'select=*') =>
    request(`/rest/v1/${table}?${query}`, { token: await accessToken() });

  async function insert(table, row) {
    const rows = await request(`/rest/v1/${table}`, {
      method: 'POST',
      body: row,
      headers: { Prefer: 'return=representation' },
      token: await accessToken(),
    });
    return rows[0];
  }

  async function update(table, id, patch) {
    const rows = await request(`/rest/v1/${table}?${idFilter(id)}`, {
      method: 'PATCH',
      body: patch,
      headers: { Prefer: 'return=representation' },
      token: await accessToken(),
    });
    // Эрхгүй үед сервер алдаа өгөлгүй 0 мөр буцаадаг тул тусад нь шалгана.
    if (!rows || rows.length === 0) {
      throw new BackendError('Өөрчлөлт хадгалагдсангүй. Бүртгэл олдсонгүй эсвэл эрх алга.', {
        status: 403,
      });
    }
    return rows[0];
  }

  async function remove(table, id) {
    const rows = await request(`/rest/v1/${table}?${idFilter(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
      token: await accessToken(),
    });
    if (!rows || rows.length === 0) {
      throw new BackendError('Устгагдсангүй. Бүртгэл олдсонгүй эсвэл эрх алга.', { status: 403 });
    }
  }

  /* Зураг ------------------------------------------------------------------ */

  const photoPath = (path) =>
    `/storage/v1/object/${PHOTO_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

  async function uploadPhoto(path, blob) {
    await request(photoPath(path), {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': blob.type, 'x-upsert': 'true' },
      token: await accessToken(),
    });
  }

  async function removePhoto(path) {
    await request(photoPath(path), { method: 'DELETE', token: await accessToken() });
  }

  /**
   * Зургийг татаж, <img src>-д тавих түр хаяг буцаана.
   * Зураг хувийн саванд байдаг тул шууд холбоосоор нээгдэхгүй; сервер хандах эрхийг шалгана.
   * asAdmin = false үед зөвхөн нийтэлсэн, зураг нийтлэх зөвшөөрөлтэй тамирчны зураг татагдана.
   */
  async function photoUrl(path, { asAdmin = false } = {}) {
    const response = await request(photoPath(path), {
      raw: true,
      token: asAdmin ? await accessToken() : undefined,
    });
    return URL.createObjectURL(await response.blob());
  }

  return {
    isConfigured,
    BackendError,
    get email() {
      return session?.email || '';
    },
    get hasSession() {
      return Boolean(session);
    },
    signIn,
    signOut,
    isAdmin,
    readPublic,
    callPublic,
    list,
    insert,
    update,
    remove,
    uploadPhoto,
    removePhoto,
    photoUrl,
  };
})();
