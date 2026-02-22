import {
  getDB, generateId, generateToken, hashPassword, verifyPassword,
  type User, type Section, type Lesson, type Question, type Sign,
  type DictionarySection, type DictionaryEntry, type Post, type Comment,
  type Like, type Report, type QuizResult, type UserMistake,
  type TrainingSession, type Notification, type AdminLog
} from './database';

// ============ RATE LIMITING ============
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(key: string, max = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetTime) { rateLimitMap.set(key, { count: 1, resetTime: now + windowMs }); return true; }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ============ VALIDATION ============
function validateEmail(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function sanitize(s: string): string { return s.replace(/<[^>]*>/g, '').trim(); }

interface ApiRes<T = unknown> { success: boolean; data?: T; error?: string; code: number; }
function ok<T>(data: T, code = 200): ApiRes<T> { return { success: true, data, code }; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function err(error: string, code = 400): ApiRes<any> { return { success: false, error, code }; }

// ============ AUTH HELPERS ============
async function getAuthUser(token: string): Promise<User | null> {
  const db = await getDB();
  const at = await db.get('authTokens', token);
  if (!at || new Date(at.expiresAt) < new Date()) return null;
  return db.get('users', at.userId);
}

async function isAdmin(token: string): Promise<boolean> {
  const u = await getAuthUser(token);
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.role === 'manager') return true;
  return false;
}

// Update user role/permissions/verified
export async function apiUpdateUser(token: string, userId: string, data: { role?: string; permissions?: string[]; verified?: boolean; isBanned?: boolean }): Promise<ApiRes<Omit<User, 'password'>>> {
  const admin = await getAuthUser(token);
  if (!admin || (admin.role !== 'admin' && admin.role !== 'manager')) return err('غير مصرح', 403);
  const db = await getDB();
  const user = await db.get('users', userId);
  if (!user) return err('مستخدم غير موجود', 404);
  if (data.role !== undefined) user.role = data.role as User['role'];
  if (data.permissions !== undefined) user.permissions = data.permissions;
  if (data.verified !== undefined) user.verified = data.verified;
  if (data.isBanned !== undefined) user.isBanned = data.isBanned;
  await db.put('users', user);
  await logAdmin(token, 'تعديل مستخدم', `${user.email} - role: ${user.role}, verified: ${user.verified}`);
  const { password: _, ...safe } = user; void _;
  return ok(safe);
}

// ============ AUTH API ============

/** Check if a username is available. Returns { available, suggestions } */
export async function apiCheckUsername(username: string): Promise<ApiRes<{ available: boolean; suggestions: string[] }>> {
  username = sanitize(username).toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (username.length < 3) return ok({ available: false, suggestions: [] });
  const db = await getDB();
  const all = await db.getAll('users');
  const taken = new Set(all.map(u => u.username?.toLowerCase()));
  const available = !taken.has(username);

  const suggestions: string[] = [];
  if (!available) {
    // Generate up to 5 unique suggestions
    const base = username.replace(/\d+$/, ''); // strip trailing digits
    const tried = new Set<string>();
    const rand = () => Math.floor(Math.random() * 900 + 100);
    const suffixes = [rand(), rand(), rand(), new Date().getFullYear() % 100, rand()];
    for (const s of suffixes) {
      const candidate = `${base}${s}`;
      if (!taken.has(candidate) && !tried.has(candidate)) {
        suggestions.push(candidate);
        tried.add(candidate);
      }
      if (suggestions.length >= 3) break;
    }
    // Also try adding underscore variants
    const alt1 = `${base}_${rand()}`;
    if (!taken.has(alt1) && suggestions.length < 3) suggestions.push(alt1);
  }
  return ok({ available, suggestions });
}

export async function apiRegister(email: string, password: string, name: string, extra?: { firstName?: string; lastName?: string; username?: string }): Promise<ApiRes<{ user: Omit<User, 'password'>; token: string; refreshToken: string }>> {
  if (!checkRateLimit('reg_' + email, 5, 300000)) return err('تجاوز الحد المسموح', 429);
  email = sanitize(email).toLowerCase(); name = sanitize(name);
  if (!validateEmail(email)) return err('بريد إلكتروني غير صالح');
  if (password.length < 6) return err('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  if (name.length < 2) return err('الاسم قصير جداً');

  const db = await getDB();
  const existing = await db.getFromIndex('users', 'email', email);
  if (existing) return err('البريد مسجل مسبقاً', 409);

  // Validate/generate username
  let requestedUsername = extra?.username ? sanitize(extra.username).toLowerCase().replace(/[^a-z0-9_.]/g, '') : '';
  if (requestedUsername.length < 3) {
    // Auto-generate from first name
    const baseFromName = (extra?.firstName || name.split(' ')[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    requestedUsername = `${baseFromName}_${Math.random().toString(36).substring(2, 6)}`;
  }

  // Check uniqueness — if taken, generate alternative
  const allUsers = await db.getAll('users');
  const takenUsernames = new Set(allUsers.map(u => u.username?.toLowerCase()));
  let finalUsername = requestedUsername;
  if (takenUsernames.has(finalUsername)) {
    let i = 1;
    while (takenUsernames.has(`${requestedUsername}_${i}`) && i < 100) i++;
    finalUsername = `${requestedUsername}_${i}`;
    // Return error so front-end can show suggestions (only if user explicitly typed a username)
    if (extra?.username) {
      return err(`اسم المستخدم "${requestedUsername}" مستخدم بالفعل`, 409);
    }
  }

  const now = new Date().toISOString();
  const role = email === 'admin@patente.com' ? 'admin' : 'user';
  const user: User = {
    id: generateId(), email, password: await hashPassword(password), name,
    firstName: extra?.firstName || '', lastName: extra?.lastName || '',
    username: finalUsername, avatar: '', bio: '',
    role, permissions: [], isBanned: false, verified: false,
    following: [],
    profileComplete: false, birthDate: '', country: '', province: '',
    gender: '', phone: '', phoneCode: '', italianLevel: '',
    privacyHideStats: false,
    createdAt: now, lastLogin: now,
    progress: {
      totalQuizzes: 0, correctAnswers: 0, wrongAnswers: 0,
      completedLessons: [], completedTopics: [],
      currentStreak: 0, bestStreak: 0, lastStudyDate: '',
      level: 1, xp: 0, badges: ['newcomer'], examReadiness: 0,
    },
    settings: { language: 'both', theme: 'light', notifications: true, soundEffects: true, fontSize: 'medium' },
  };
  await db.put('users', user);

  const token = generateToken();
  const refreshToken = generateToken();
  await db.put('authTokens', { token, refreshToken, userId: user.id, createdAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });

  const { password: _, ...safe } = user; void _;
  return ok({ user: safe, token, refreshToken }, 201);
}

export async function apiLogin(email: string, password: string): Promise<ApiRes<{ user: Omit<User, 'password'>; token: string; refreshToken: string }>> {
  if (!checkRateLimit('login_' + email, 10, 300000)) return err('تجاوز الحد', 429);
  email = sanitize(email).toLowerCase();
  const db = await getDB();
  const user = await db.getFromIndex('users', 'email', email);
  if (!user) return err('بريد أو كلمة مرور خاطئة', 401);
  if (user.isBanned) return err('هذا الحساب محظور', 403);
  if (!(await verifyPassword(password, user.password))) return err('بريد أو كلمة مرور خاطئة', 401);

  const now = new Date().toISOString();
  const lastStudy = user.progress.lastStudyDate;
  if (lastStudy) {
    const ld = new Date(lastStudy).toDateString();
    const yd = new Date(Date.now() - 86400000).toDateString();
    const td = new Date().toDateString();
    if (ld !== td && ld !== yd) user.progress.currentStreak = 0;
  }
  user.lastLogin = now;
  await db.put('users', user);

  const token = generateToken(); const refreshToken = generateToken();
  await db.put('authTokens', { token, refreshToken, userId: user.id, createdAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  const { password: _, ...safe } = user; void _;
  return ok({ user: safe, token, refreshToken });
}

export async function apiGetUser(token: string): Promise<ApiRes<Omit<User, 'password'>>> {
  const user = await getAuthUser(token);
  if (!user) return err('جلسة منتهية', 401);
  const { password: _, ...safe } = user; void _;
  return ok(safe);
}

export async function apiLogout(token: string): Promise<ApiRes> {
  const db = await getDB(); await db.delete('authTokens', token); return ok(null);
}

export async function apiResetPassword(email: string, newPassword: string): Promise<ApiRes> {
  if (newPassword.length < 6) return err('كلمة المرور قصيرة');
  const db = await getDB();
  const user = await db.getFromIndex('users', 'email', email.toLowerCase());
  if (!user) return err('بريد غير موجود', 404);
  user.password = await hashPassword(newPassword);
  await db.put('users', user);
  return ok(null);
}

export async function apiUpdateProfile(token: string, data: { name?: string; avatar?: string }): Promise<ApiRes<Omit<User, 'password'>>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  if (data.name) user.name = sanitize(data.name);
  if (data.avatar !== undefined) user.avatar = data.avatar;
  const db = await getDB(); await db.put('users', user);
  const { password: _, ...safe } = user; void _;
  return ok(safe);
}

export async function apiUpdateSettings(token: string, settings: Partial<User['settings']>): Promise<ApiRes<User['settings']>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  user.settings = { ...user.settings, ...settings };
  const db = await getDB(); await db.put('users', user);
  return ok(user.settings);
}

export async function apiUpdateProgress(token: string, p: Partial<User['progress']>): Promise<ApiRes<User['progress']>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  user.progress = { ...user.progress, ...p };
  const db = await getDB(); await db.put('users', user);
  return ok(user.progress);
}

// ============ SECTIONS API ============
export async function apiGetSections(): Promise<ApiRes<Section[]>> {
  const db = await getDB();
  const all = await db.getAll('sections');
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiCreateSection(token: string, data: Omit<Section, 'id' | 'createdAt'>): Promise<ApiRes<Section>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const s: Section = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('sections', s);
  await logAdmin(token, 'إنشاء قسم', s.nameAr);
  return ok(s, 201);
}

export async function apiUpdateSection(token: string, id: string, data: Partial<Section>): Promise<ApiRes<Section>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('sections', id);
  if (!s) return err('قسم غير موجود', 404);
  Object.assign(s, data);
  await db.put('sections', s);
  return ok(s);
}

export async function apiDeleteSection(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('sections', id);
  if (!s) return err('غير موجود', 404);
  s.status = 'deleted';
  s.deletedAt = new Date().toISOString();
  await db.put('sections', s);
  await logAdmin(token, 'حذف قسم', s.nameAr);
  return ok(null);
}

export async function apiArchiveSection(token: string, id: string, archive: boolean): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('sections', id);
  if (!s) return err('غير موجود', 404);
  s.status = archive ? 'archived' : 'active';
  if (!archive) s.deletedAt = undefined;
  await db.put('sections', s);
  await logAdmin(token, archive ? 'أرشفة قسم' : 'استعادة قسم', s.nameAr);
  return ok(null);
}

export async function apiRestoreSection(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('sections', id);
  if (!s) return err('غير موجود', 404);
  s.status = 'active';
  s.deletedAt = undefined;
  await db.put('sections', s);
  await logAdmin(token, 'استعادة قسم', s.nameAr);
  return ok(null);
}

export async function apiPermanentDeleteSection(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  await db.delete('sections', id);
  await logAdmin(token, 'حذف نهائي قسم', id);
  return ok(null);
}

// ============ LESSONS API ============
export async function apiGetLessons(sectionId?: string): Promise<ApiRes<Lesson[]>> {
  const db = await getDB();
  let all: Lesson[];
  if (sectionId) { all = await db.getAllFromIndex('lessons', 'sectionId', sectionId); }
  else { all = await db.getAll('lessons'); }
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiGetLesson(id: string): Promise<ApiRes<Lesson>> {
  const db = await getDB();
  const l = await db.get('lessons', id);
  if (!l) return err('درس غير موجود', 404);
  return ok(l);
}

export async function apiCreateLesson(token: string, data: Omit<Lesson, 'id' | 'createdAt'>): Promise<ApiRes<Lesson>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const l: Lesson = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('lessons', l);
  await logAdmin(token, 'إنشاء درس', l.titleAr);
  return ok(l, 201);
}

export async function apiUpdateLesson(token: string, id: string, data: Partial<Lesson>): Promise<ApiRes<Lesson>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const l = await db.get('lessons', id);
  if (!l) return err('درس غير موجود', 404);
  Object.assign(l, data);
  await db.put('lessons', l);
  return ok(l);
}

export async function apiDeleteLesson(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const l = await db.get('lessons', id);
  if (!l) return err('غير موجود', 404);
  l.status = 'deleted';
  l.deletedAt = new Date().toISOString();
  await db.put('lessons', l);
  await logAdmin(token, 'حذف درس', l.titleAr);
  return ok(null);
}

export async function apiArchiveLesson(token: string, id: string, archive: boolean): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const l = await db.get('lessons', id);
  if (!l) return err('غير موجود', 404);
  l.status = archive ? 'archived' : 'active';
  if (!archive) l.deletedAt = undefined;
  await db.put('lessons', l);
  await logAdmin(token, archive ? 'أرشفة درس' : 'استعادة درس', l.titleAr);
  return ok(null);
}

export async function apiRestoreLesson(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const l = await db.get('lessons', id);
  if (!l) return err('غير موجود', 404);
  l.status = 'active';
  l.deletedAt = undefined;
  await db.put('lessons', l);
  await logAdmin(token, 'استعادة درس', l.titleAr);
  return ok(null);
}

export async function apiPermanentDeleteLesson(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  await db.delete('lessons', id);
  await logAdmin(token, 'حذف نهائي درس', id);
  return ok(null);
}

// ============ QUESTIONS API ============
export async function apiGetQuestions(lessonId?: string, sectionId?: string): Promise<ApiRes<Question[]>> {
  const db = await getDB();
  let all: Question[];
  if (lessonId) { all = await db.getAllFromIndex('questions', 'lessonId', lessonId); }
  else if (sectionId) { all = await db.getAllFromIndex('questions', 'sectionId', sectionId); }
  else { all = await db.getAll('questions'); }
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiCreateQuestion(token: string, data: Omit<Question, 'id' | 'createdAt'>): Promise<ApiRes<Question>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const q: Question = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('questions', q);
  await logAdmin(token, 'إنشاء سؤال', q.questionAr.substring(0, 50));
  return ok(q, 201);
}

export async function apiUpdateQuestion(token: string, id: string, data: Partial<Question>): Promise<ApiRes<Question>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const q = await db.get('questions', id);
  if (!q) return err('سؤال غير موجود', 404);
  Object.assign(q, data);
  await db.put('questions', q);
  return ok(q);
}

export async function apiDeleteQuestion(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const q = await db.get('questions', id);
  if (!q) return err('غير موجود', 404);
  q.status = 'deleted';
  q.deletedAt = new Date().toISOString();
  await db.put('questions', q);
  await logAdmin(token, 'حذف سؤال', q.questionAr.substring(0, 40));
  return ok(null);
}

export async function apiArchiveQuestion(token: string, id: string, archive: boolean): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const q = await db.get('questions', id);
  if (!q) return err('غير موجود', 404);
  q.status = archive ? 'archived' : 'active';
  if (!archive) q.deletedAt = undefined;
  await db.put('questions', q);
  await logAdmin(token, archive ? 'أرشفة سؤال' : 'استعادة سؤال', q.questionAr.substring(0, 40));
  return ok(null);
}

export async function apiRestoreQuestion(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const q = await db.get('questions', id);
  if (!q) return err('غير موجود', 404);
  q.status = 'active';
  q.deletedAt = undefined;
  await db.put('questions', q);
  await logAdmin(token, 'استعادة سؤال', q.questionAr.substring(0, 40));
  return ok(null);
}

export async function apiPermanentDeleteQuestion(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  await db.delete('questions', id);
  await logAdmin(token, 'حذف نهائي سؤال', id);
  return ok(null);
}

// ============ SIGNS API ============
export async function apiGetSigns(category?: string): Promise<ApiRes<Sign[]>> {
  const db = await getDB();
  let all: Sign[];
  if (category) { all = await db.getAllFromIndex('signs', 'category', category); }
  else { all = await db.getAll('signs'); }
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiCreateSign(token: string, data: Omit<Sign, 'id' | 'createdAt'>): Promise<ApiRes<Sign>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const s: Sign = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('signs', s);
  return ok(s, 201);
}

export async function apiUpdateSign(token: string, id: string, data: Partial<Sign>): Promise<ApiRes<Sign>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('signs', id); if (!s) return err('إشارة غير موجودة', 404);
  Object.assign(s, data); await db.put('signs', s);
  return ok(s);
}

export async function apiDeleteSign(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('signs', id);
  if (!s) return err('غير موجود', 404);
  s.status = 'deleted';
  s.deletedAt = new Date().toISOString();
  await db.put('signs', s);
  await logAdmin(token, 'حذف إشارة', s.nameAr);
  return ok(null);
}

export async function apiArchiveSign(token: string, id: string, archive: boolean): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('signs', id);
  if (!s) return err('غير موجود', 404);
  s.status = archive ? 'archived' : 'active';
  if (!archive) s.deletedAt = undefined;
  await db.put('signs', s);
  await logAdmin(token, archive ? 'أرشفة إشارة' : 'استعادة إشارة', s.nameAr);
  return ok(null);
}

export async function apiRestoreSign(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('signs', id);
  if (!s) return err('غير موجود', 404);
  s.status = 'active';
  s.deletedAt = undefined;
  await db.put('signs', s);
  await logAdmin(token, 'استعادة إشارة', s.nameAr);
  return ok(null);
}

export async function apiPermanentDeleteSign(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  await db.delete('signs', id);
  await logAdmin(token, 'حذف نهائي إشارة', id);
  return ok(null);
}

// ============ DICTIONARY API ============
export async function apiGetDictSections(): Promise<ApiRes<DictionarySection[]>> {
  const db = await getDB();
  const all = await db.getAll('dictionarySections');
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiCreateDictSection(token: string, data: Omit<DictionarySection, 'id' | 'createdAt'>): Promise<ApiRes<DictionarySection>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const s: DictionarySection = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('dictionarySections', s);
  return ok(s, 201);
}

export async function apiUpdateDictSection(token: string, id: string, data: Partial<DictionarySection>): Promise<ApiRes<DictionarySection>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const s = await db.get('dictionarySections', id); if (!s) return err('غير موجود', 404);
  Object.assign(s, data); await db.put('dictionarySections', s);
  return ok(s);
}

export async function apiDeleteDictSection(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB(); await db.delete('dictionarySections', id);
  return ok(null);
}

export async function apiGetDictEntries(sectionId?: string): Promise<ApiRes<DictionaryEntry[]>> {
  const db = await getDB();
  let all: DictionaryEntry[];
  if (sectionId) { all = await db.getAllFromIndex('dictionaryEntries', 'sectionId', sectionId); }
  else { all = await db.getAll('dictionaryEntries'); }
  all.sort((a, b) => a.order - b.order);
  return ok(all);
}

export async function apiCreateDictEntry(token: string, data: Omit<DictionaryEntry, 'id' | 'createdAt'>): Promise<ApiRes<DictionaryEntry>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const e: DictionaryEntry = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('dictionaryEntries', e);
  return ok(e, 201);
}

export async function apiUpdateDictEntry(token: string, id: string, data: Partial<DictionaryEntry>): Promise<ApiRes<DictionaryEntry>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const e = await db.get('dictionaryEntries', id); if (!e) return err('غير موجود', 404);
  Object.assign(e, data); await db.put('dictionaryEntries', e);
  return ok(e);
}

export async function apiDeleteDictEntry(token: string, id: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB(); await db.delete('dictionaryEntries', id);
  return ok(null);
}

// ============ COMMUNITY API ============
export async function apiGetPosts(): Promise<ApiRes<Post[]>> {
  const db = await getDB();
  const all = await db.getAll('posts');
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ok(all);
}

export async function apiCreatePost(token: string, content: string, image: string): Promise<ApiRes<Post>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  if (user.isBanned) return err('حسابك محظور', 403);
  if (!content.trim()) return err('المحتوى فارغ');
  const p: Post = {
    id: generateId(), userId: user.id, userName: user.name, userAvatar: user.avatar,
    content: sanitize(content), image, type: 'post',
    quizQuestion: '', quizAnswer: false, quizStats: { trueCount: 0, falseCount: 0 },
    pinned: false,
    likesCount: 0, commentsCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const db = await getDB(); await db.put('posts', p);
  return ok(p, 201);
}

export async function apiUpdatePost(token: string, id: string, content: string): Promise<ApiRes<Post>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const p = await db.get('posts', id); if (!p) return err('منشور غير موجود', 404);
  if (p.userId !== user.id && user.role !== 'admin') return err('غير مصرح', 403);
  p.content = sanitize(content); p.updatedAt = new Date().toISOString();
  await db.put('posts', p);
  return ok(p);
}

export async function apiDeletePost(token: string, id: string): Promise<ApiRes> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const p = await db.get('posts', id); if (!p) return err('غير موجود', 404);
  if (p.userId !== user.id && user.role !== 'admin') return err('غير مصرح', 403);
  await db.delete('posts', id);
  // delete related comments and likes
  const comments = await db.getAllFromIndex('comments', 'postId', id);
  for (const c of comments) await db.delete('comments', c.id);
  const likes = await db.getAllFromIndex('likes', 'postId', id);
  for (const l of likes) await db.delete('likes', l.id);
  return ok(null);
}

export async function apiGetComments(postId: string): Promise<ApiRes<Comment[]>> {
  const db = await getDB();
  const all = await db.getAllFromIndex('comments', 'postId', postId);
  all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return ok(all);
}

export async function apiCreateComment(token: string, postId: string, content: string): Promise<ApiRes<Comment>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  if (user.isBanned) return err('حسابك محظور', 403);
  const db = await getDB();
  const post = await db.get('posts', postId); if (!post) return err('منشور غير موجود', 404);
  const c: Comment = { id: generateId(), postId, userId: user.id, userName: user.name, userAvatar: user.avatar, content: sanitize(content), createdAt: new Date().toISOString() };
  await db.put('comments', c);
  post.commentsCount++;
  await db.put('posts', post);
  return ok(c, 201);
}

export async function apiDeleteComment(token: string, id: string): Promise<ApiRes> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const c = await db.get('comments', id); if (!c) return err('غير موجود', 404);
  if (c.userId !== user.id && user.role !== 'admin') return err('غير مصرح', 403);
  await db.delete('comments', id);
  const post = await db.get('posts', c.postId);
  if (post) { post.commentsCount = Math.max(0, post.commentsCount - 1); await db.put('posts', post); }
  return ok(null);
}

export async function apiToggleLike(token: string, postId: string): Promise<ApiRes<{ liked: boolean; count: number }>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const post = await db.get('posts', postId); if (!post) return err('غير موجود', 404);
  const allLikes = await db.getAllFromIndex('likes', 'postId', postId);
  const existing = allLikes.find(l => l.userId === user.id);
  if (existing) {
    await db.delete('likes', existing.id);
    post.likesCount = Math.max(0, post.likesCount - 1);
    await db.put('posts', post);
    return ok({ liked: false, count: post.likesCount });
  } else {
    const like: Like = { id: generateId(), postId, userId: user.id, createdAt: new Date().toISOString() };
    await db.put('likes', like);
    post.likesCount++;
    await db.put('posts', post);
    return ok({ liked: true, count: post.likesCount });
  }
}

export async function apiCheckLike(token: string, postId: string): Promise<ApiRes<boolean>> {
  const user = await getAuthUser(token);
  if (!user) return ok(false);
  const db = await getDB();
  const allLikes = await db.getAllFromIndex('likes', 'postId', postId);
  return ok(allLikes.some(l => l.userId === user.id));
}

export async function apiCreateReport(token: string, type: Report['type'], targetId: string, reason: string): Promise<ApiRes<Report>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const r: Report = { id: generateId(), type, targetId, userId: user.id, reason: sanitize(reason), status: 'pending', createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('reports', r);
  return ok(r, 201);
}

// ============ QUIZ / TRAINING API ============
export async function apiSaveQuizResult(token: string, result: Omit<QuizResult, 'id' | 'userId' | 'createdAt'>): Promise<ApiRes<QuizResult>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const qr: QuizResult = { ...result, id: generateId(), userId: user.id, createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('quizResults', qr);

  // Update progress
  user.progress.totalQuizzes++;
  user.progress.correctAnswers += result.correctAnswers;
  user.progress.wrongAnswers += result.wrongAnswers;
  const xpGained = result.correctAnswers * 10 + (result.score >= 80 ? 50 : 0);
  user.progress.xp += xpGained;
  user.progress.level = Math.floor(user.progress.xp / 500) + 1;

  // Streak
  const today = new Date().toDateString();
  const last = user.progress.lastStudyDate;
  if (!last || new Date(last).toDateString() !== today) {
    const yd = new Date(Date.now() - 86400000).toDateString();
    if (last && new Date(last).toDateString() === yd) user.progress.currentStreak++;
    else if (!last) user.progress.currentStreak = 1;
    user.progress.bestStreak = Math.max(user.progress.bestStreak, user.progress.currentStreak);
  }
  user.progress.lastStudyDate = new Date().toISOString();

  // Track lesson completion
  if (result.score >= 70 && result.lessonId && !user.progress.completedLessons.includes(result.lessonId)) {
    user.progress.completedLessons.push(result.lessonId);
  }

  // Badges
  if (user.progress.totalQuizzes >= 10 && !user.progress.badges.includes('quiz_master')) user.progress.badges.push('quiz_master');
  if (result.score === 100 && !user.progress.badges.includes('perfect_score')) user.progress.badges.push('perfect_score');
  if (user.progress.currentStreak >= 7 && !user.progress.badges.includes('week_streak')) user.progress.badges.push('week_streak');
  if (user.progress.level >= 5 && !user.progress.badges.includes('level_5')) user.progress.badges.push('level_5');

  // Exam readiness - comprehensive calculation
  const allResults = await db.getAllFromIndex('quizResults', 'userId', user.id);
  if (allResults.length > 0) {
    // Factor 1: Recent average score (40%)
    const recent = allResults.slice(-20);
    const avgScore = recent.reduce((s, r) => s + r.score, 0) / recent.length;
    // Factor 2: Total quizzes taken (20%) - max at 30 quizzes
    const quizFactor = Math.min(100, (allResults.length / 30) * 100);
    // Factor 3: Accuracy (20%)
    const totalA = user.progress.correctAnswers + user.progress.wrongAnswers;
    const accFactor = totalA > 0 ? (user.progress.correctAnswers / totalA) * 100 : 0;
    // Factor 4: Lessons completed (10%)
    const allLessons = await db.getAll('lessons');
    const lessonFactor = allLessons.length > 0 ? (user.progress.completedLessons.length / allLessons.length) * 100 : 0;
    // Factor 5: Consistency/streak (10%)
    const streakFactor = Math.min(100, user.progress.currentStreak * 14);
    
    user.progress.examReadiness = Math.round(
      avgScore * 0.4 + quizFactor * 0.2 + accFactor * 0.2 + lessonFactor * 0.1 + streakFactor * 0.1
    );
  }

  await db.put('users', user);

  // Track mistakes
  for (const a of result.answers) {
    if (!a.correct) {
      const mistakes = await db.getAllFromIndex('userMistakes', 'userId', user.id);
      const existing = mistakes.find(m => m.questionId === a.questionId);
      if (existing) {
        existing.count++;
        existing.lastMistakeAt = new Date().toISOString();
        await db.put('userMistakes', existing);
      } else {
        const q = await db.get('questions', a.questionId);
        const mistake: UserMistake = {
          id: generateId(), userId: user.id, questionId: a.questionId,
          questionAr: q?.questionAr || '', questionIt: q?.questionIt || '',
          correctAnswer: q?.isTrue ?? true, userAnswer: a.userAnswer,
          count: 1, lastMistakeAt: new Date().toISOString(),
        };
        await db.put('userMistakes', mistake);
      }
    }
  }

  return ok(qr, 201);
}

export async function apiGetQuizHistory(token: string): Promise<ApiRes<QuizResult[]>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const all = await db.getAllFromIndex('quizResults', 'userId', user.id);
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ok(all);
}

export async function apiGetUserMistakes(token: string): Promise<ApiRes<UserMistake[]>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const all = await db.getAllFromIndex('userMistakes', 'userId', user.id);
  all.sort((a, b) => b.count - a.count);
  return ok(all);
}

export async function apiSaveTrainingSession(token: string, data: Omit<TrainingSession, 'id' | 'userId' | 'createdAt'>): Promise<ApiRes<TrainingSession>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const ts: TrainingSession = { ...data, id: generateId(), userId: user.id, createdAt: new Date().toISOString() };
  const db = await getDB(); await db.put('trainingSessions', ts);
  return ok(ts, 201);
}

// ============ ADMIN API ============
export async function apiAdminGetUsers(token: string): Promise<ApiRes<Omit<User, 'password'>[]>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const all = await db.getAll('users');
  return ok(all.map(u => { const { password: _, ...safe } = u; void _; return safe; }));
}

export async function apiAdminBanUser(token: string, userId: string, banned: boolean): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const user = await db.get('users', userId); if (!user) return err('مستخدم غير موجود', 404);
  user.isBanned = banned;
  await db.put('users', user);
  await logAdmin(token, banned ? 'حظر مستخدم' : 'إلغاء حظر', user.email);
  return ok(null);
}

export async function apiAdminDeleteUser(token: string, userId: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB(); await db.delete('users', userId);
  await logAdmin(token, 'حذف مستخدم', userId);
  return ok(null);
}

export async function apiAdminGetReports(token: string): Promise<ApiRes<Report[]>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const all = await db.getAll('reports');
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ok(all);
}

export async function apiAdminUpdateReport(token: string, id: string, status: Report['status']): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const r = await db.get('reports', id); if (!r) return err('غير موجود', 404);
  r.status = status; await db.put('reports', r);
  return ok(null);
}

export async function apiAdminGetLogs(token: string): Promise<ApiRes<AdminLog[]>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const all = await db.getAll('adminLogs');
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ok(all);
}

export async function apiAdminGetStats(token: string): Promise<ApiRes<{
  totalUsers: number; totalPosts: number; totalQuestions: number; totalSections: number;
  totalLessons: number; totalSigns: number; totalReports: number; activeToday: number;
}>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const users = await db.getAll('users');
  const today = new Date().toDateString();
  return ok({
    totalUsers: users.length,
    totalPosts: (await db.getAll('posts')).length,
    totalQuestions: (await db.getAll('questions')).length,
    totalSections: (await db.getAll('sections')).length,
    totalLessons: (await db.getAll('lessons')).length,
    totalSigns: (await db.getAll('signs')).length,
    totalReports: (await db.getAll('reports')).length,
    activeToday: users.filter(u => new Date(u.lastLogin).toDateString() === today).length,
  });
}

// ============ NOTIFICATIONS API ============
export async function apiGetNotifications(token: string): Promise<ApiRes<Notification[]>> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const all = await db.getAllFromIndex('notifications', 'userId', user.id);
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return ok(all);
}

export async function apiMarkNotificationRead(token: string, id: string): Promise<ApiRes> {
  const user = await getAuthUser(token);
  if (!user) return err('غير مصرح', 401);
  const db = await getDB();
  const n = await db.get('notifications', id);
  if (n && n.userId === user.id) { n.read = true; await db.put('notifications', n); }
  return ok(null);
}

// ============ DATA IMPORT/EXPORT ============
export async function apiExportData(token: string, storeName: string): Promise<ApiRes<unknown[]>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  const all = await db.getAll(storeName);
  return ok(all);
}

export async function apiImportData(token: string, storeName: string, data: unknown[]): Promise<ApiRes<number>> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();
  let count = 0;
  for (const item of data) {
    await db.put(storeName, item);
    count++;
  }
  await logAdmin(token, 'استيراد بيانات', `${storeName}: ${count} سجل`);
  return ok(count);
}

// ============ SEED DATA ============
export async function apiSeedData(token: string): Promise<ApiRes> {
  if (!(await isAdmin(token))) return err('غير مصرح', 403);
  const db = await getDB();

  // Seed sections
  const sections: Section[] = [
    { id: 's1', nameAr: 'إشارات الخطر', nameIt: 'Segnali di pericolo', descriptionAr: 'تعرف على إشارات التحذير من الأخطار', descriptionIt: 'Impara i segnali di pericolo', image: '', icon: 'warning', color: '#ef4444', order: 1, createdAt: new Date().toISOString() },
    { id: 's2', nameAr: 'إشارات المنع', nameIt: 'Segnali di divieto', descriptionAr: 'إشارات الحظر والمنع المرورية', descriptionIt: 'Segnali di divieto stradali', image: '', icon: 'block', color: '#dc2626', order: 2, createdAt: new Date().toISOString() },
    { id: 's3', nameAr: 'إشارات الإلزام', nameIt: "Segnali d'obbligo", descriptionAr: 'الإشارات التي تلزمك بفعل معين', descriptionIt: 'Segnali che obbligano a un comportamento', image: '', icon: 'arrow_circle_up', color: '#2563eb', order: 3, createdAt: new Date().toISOString() },
    { id: 's4', nameAr: 'أولوية المرور', nameIt: 'Precedenza', descriptionAr: 'قواعد الأولوية في التقاطعات', descriptionIt: 'Regole di precedenza', image: '', icon: 'swap_vert', color: '#f59e0b', order: 4, createdAt: new Date().toISOString() },
    { id: 's5', nameAr: 'حدود السرعة', nameIt: 'Limiti di velocità', descriptionAr: 'السرعات القصوى على أنواع الطرق', descriptionIt: 'Limiti di velocità sulle strade', image: '', icon: 'speed', color: '#8b5cf6', order: 5, createdAt: new Date().toISOString() },
    { id: 's6', nameAr: 'مسافة الأمان', nameIt: 'Distanza di sicurezza', descriptionAr: 'المسافة الآمنة بين المركبات', descriptionIt: 'Distanza di sicurezza tra veicoli', image: '', icon: 'social_distance', color: '#06b6d4', order: 6, createdAt: new Date().toISOString() },
  ];
  for (const s of sections) await db.put('sections', s);

  // Seed lessons
  const lessons: Lesson[] = [
    { id: 'l1', sectionId: 's1', titleAr: 'مقدمة في إشارات الخطر', titleIt: 'Introduzione ai segnali di pericolo', contentAr: 'إشارات الخطر هي إشارات تحذيرية تنبه السائق إلى وجود خطر محتمل على الطريق. تتميز بشكلها المثلثي مع حافة حمراء وخلفية بيضاء. توضع عادة على بعد 150 متراً من الخطر.', contentIt: 'I segnali di pericolo sono segnali di avvertimento che avvisano il conducente della presenza di un potenziale pericolo sulla strada. Hanno forma triangolare con bordo rosso e sfondo bianco. Sono posti di norma a 150 m dal pericolo.', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'l2', sectionId: 's1', titleAr: 'إشارات المنعطفات والطريق الزلق', titleIt: 'Segnali di curve e strada sdrucciolevole', contentAr: 'إشارة المنعطف الخطير تحذر من وجود منعطف حاد. إشارة الطريق الزلق تحذر من أن الطريق قد يكون زلقاً خاصة في الأمطار. يجب تخفيف السرعة عند رؤية هذه الإشارات.', contentIt: 'Il segnale di curva pericolosa avverte di una curva stretta. Il segnale di strada sdrucciolevole avverte che la strada può essere scivolosa specialmente con la pioggia.', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'l3', sectionId: 's2', titleAr: 'مقدمة في إشارات المنع', titleIt: 'Introduzione ai segnali di divieto', contentAr: 'إشارات المنع دائرية الشكل بحافة حمراء وخلفية بيضاء. تدل على أفعال ممنوعة على الطريق مثل منع الدخول أو منع التجاوز أو تحديد السرعة القصوى.', contentIt: 'I segnali di divieto sono circolari con bordo rosso e sfondo bianco. Indicano azioni vietate sulla strada come divieto di accesso, sorpasso o limiti di velocità.', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'l4', sectionId: 's3', titleAr: 'مقدمة في إشارات الإلزام', titleIt: "Introduzione ai segnali d'obbligo", contentAr: 'إشارات الإلزام دائرية زرقاء مع رموز بيضاء. تلزم السائق بفعل معين مثل الاتجاه الإجباري أو استخدام سلاسل الثلج.', contentIt: "I segnali d'obbligo sono circolari blu con simboli bianchi. Obbligano il conducente a un comportamento specifico.", image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'l5', sectionId: 's4', titleAr: 'قواعد الأولوية', titleIt: 'Regole di precedenza', contentAr: 'في التقاطعات بدون إشارات، الأولوية للقادم من اليمين. إشارة STOP تلزم بالتوقف التام. المثلث المقلوب يعني إعطاء الأولوية.', contentIt: 'Negli incroci senza segnali, la precedenza è a chi viene da destra. Lo STOP obbliga alla fermata completa.', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'l6', sectionId: 's5', titleAr: 'حدود السرعة في إيطاليا', titleIt: 'Limiti di velocità in Italia', contentAr: 'داخل المدينة 50 كم/س، طرق خارجية ثانوية 90 كم/س، طرق خارجية رئيسية 110 كم/س، أوتوسترادا 130 كم/س. في المطر تنخفض الحدود.', contentIt: 'Centro abitato 50 km/h, extraurbane secondarie 90 km/h, extraurbane principali 110 km/h, autostrada 130 km/h.', image: '', order: 1, createdAt: new Date().toISOString() },
  ];
  for (const l of lessons) await db.put('lessons', l);

  // Seed questions (true/false format)
  const questions: Question[] = [
    { id: 'q1', lessonId: 'l1', sectionId: 's1', questionAr: 'إشارات الخطر لها شكل مثلث بحافة حمراء وخلفية بيضاء', questionIt: 'I segnali di pericolo hanno forma triangolare con bordo rosso e sfondo bianco', isTrue: true, explanationAr: 'صحيح. جميع إشارات الخطر مثلثية الشكل', explanationIt: 'Vero. Tutti i segnali di pericolo sono triangolari', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q2', lessonId: 'l1', sectionId: 's1', questionAr: 'توضع إشارات الخطر عادة على بعد 50 متراً من الخطر', questionIt: 'I segnali di pericolo sono posti di norma a 50 m dal pericolo', isTrue: false, explanationAr: 'خطأ. توضع على بعد 150 متراً وليس 50', explanationIt: 'Falso. Sono posti a 150 m, non 50', difficulty: 'medium', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q3', lessonId: 'l1', sectionId: 's1', questionAr: 'عند رؤية إشارة خطر يجب زيادة السرعة لتجاوز الخطر بسرعة', questionIt: 'Vedendo un segnale di pericolo bisogna aumentare la velocità per superare il pericolo velocemente', isTrue: false, explanationAr: 'خطأ. يجب تخفيف السرعة وزيادة الانتباه', explanationIt: 'Falso. Bisogna rallentare e aumentare l\'attenzione', difficulty: 'easy', image: '', order: 3, createdAt: new Date().toISOString() },
    { id: 'q4', lessonId: 'l1', sectionId: 's1', questionAr: 'إشارة الأطفال تحذر من احتمال وجود أطفال بالقرب من مدرسة', questionIt: 'Il segnale bambini avverte della possibile presenza di bambini vicino a scuole', isTrue: true, explanationAr: 'صحيح. هذه الإشارة تنبه لوجود أطفال', explanationIt: 'Vero. Questo segnale avverte della presenza di bambini', difficulty: 'easy', image: '', order: 4, createdAt: new Date().toISOString() },
    { id: 'q5', lessonId: 'l2', sectionId: 's1', questionAr: 'إشارة الطريق الزلق تعني أنه يجب زيادة السرعة', questionIt: 'Il segnale strada sdrucciolevole significa che bisogna aumentare la velocità', isTrue: false, explanationAr: 'خطأ. يجب تخفيف السرعة لأن الطريق زلق', explanationIt: 'Falso. Bisogna rallentare perché la strada è scivolosa', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q6', lessonId: 'l2', sectionId: 's1', questionAr: 'إشارة المنعطف الخطير تحذر من وجود منعطف حاد أمامك', questionIt: 'Il segnale di curva pericolosa avverte di una curva stretta avanti', isTrue: true, explanationAr: 'صحيح. هذه الإشارة تحذر من منعطف خطير', explanationIt: 'Vero. Avverte di una curva pericolosa', difficulty: 'easy', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q7', lessonId: 'l3', sectionId: 's2', questionAr: 'إشارات المنع دائرية بحافة حمراء وخلفية بيضاء', questionIt: 'I segnali di divieto sono circolari con bordo rosso e sfondo bianco', isTrue: true, explanationAr: 'صحيح', explanationIt: 'Vero', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q8', lessonId: 'l3', sectionId: 's2', questionAr: 'إشارة ممنوع الدخول تسمح بالدخول للدراجات فقط', questionIt: 'Il divieto di accesso permette l\'accesso solo alle biciclette', isTrue: false, explanationAr: 'خطأ. ممنوع الدخول لجميع المركبات', explanationIt: 'Falso. Vieta l\'accesso a tutti i veicoli', difficulty: 'medium', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q9', lessonId: 'l3', sectionId: 's2', questionAr: 'إشارة حد السرعة 50 تعني أنه لا يمكن تجاوز 50 كم/س', questionIt: 'Il limite di velocità 50 significa che non si può superare 50 km/h', isTrue: true, explanationAr: 'صحيح. هذه الإشارة تحدد الحد الأقصى للسرعة', explanationIt: 'Vero. Indica il limite massimo di velocità', difficulty: 'easy', image: '', order: 3, createdAt: new Date().toISOString() },
    { id: 'q10', lessonId: 'l4', sectionId: 's3', questionAr: 'إشارات الإلزام دائرية زرقاء مع رموز بيضاء', questionIt: "I segnali d'obbligo sono circolari blu con simboli bianchi", isTrue: true, explanationAr: 'صحيح', explanationIt: 'Vero', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q11', lessonId: 'l4', sectionId: 's3', questionAr: 'إشارة الاتجاه الإجباري للأمام تسمح بالانعطاف', questionIt: 'Il segnale direzione obbligatoria dritto permette di svoltare', isTrue: false, explanationAr: 'خطأ. يجب المتابعة للأمام فقط', explanationIt: 'Falso. Si deve proseguire dritto', difficulty: 'easy', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q12', lessonId: 'l5', sectionId: 's4', questionAr: 'في تقاطع بدون إشارات الأولوية للقادم من اليمين', questionIt: 'In un incrocio senza segnali la precedenza è a chi viene da destra', isTrue: true, explanationAr: 'صحيح. القاعدة العامة هي الأولوية لليمين', explanationIt: 'Vero. La regola generale è precedenza a destra', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q13', lessonId: 'l5', sectionId: 's4', questionAr: 'عند إشارة STOP يمكنك المرور بدون توقف إذا لم تكن هناك مركبات', questionIt: 'Al segnale STOP puoi passare senza fermarti se non ci sono veicoli', isTrue: false, explanationAr: 'خطأ. يجب التوقف تماماً دائماً', explanationIt: 'Falso. Bisogna sempre fermarsi completamente', difficulty: 'medium', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q14', lessonId: 'l6', sectionId: 's5', questionAr: 'الحد الأقصى للسرعة داخل المدينة هو 50 كم/س', questionIt: 'Il limite di velocità nei centri abitati è 50 km/h', isTrue: true, explanationAr: 'صحيح. ما لم تكن هناك إشارة أخرى', explanationIt: 'Vero. Salvo diversa indicazione', difficulty: 'easy', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'q15', lessonId: 'l6', sectionId: 's5', questionAr: 'الحد الأقصى على الأوتوسترادا هو 150 كم/س', questionIt: 'Il limite in autostrada è 150 km/h', isTrue: false, explanationAr: 'خطأ. الحد هو 130 كم/س', explanationIt: 'Falso. Il limite è 130 km/h', difficulty: 'easy', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'q16', lessonId: 'l6', sectionId: 's5', questionAr: 'في حالة المطر ينخفض حد السرعة على الأوتوسترادا إلى 110 كم/س', questionIt: 'Con pioggia il limite in autostrada scende a 110 km/h', isTrue: true, explanationAr: 'صحيح', explanationIt: 'Vero', difficulty: 'medium', image: '', order: 3, createdAt: new Date().toISOString() },
  ];
  for (const q of questions) await db.put('questions', q);

  // Seed signs
  const signs: Sign[] = [
    { id: 'sg1', nameAr: 'خطر عام', nameIt: 'Pericolo generico', descriptionAr: 'إشارة تحذير عامة من خطر غير محدد', descriptionIt: 'Segnale di avvertimento generico', category: 'pericolo', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'sg2', nameAr: 'منعطف خطير', nameIt: 'Curva pericolosa', descriptionAr: 'تحذير من منعطف حاد', descriptionIt: 'Avverte di curva stretta', category: 'pericolo', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'sg3', nameAr: 'ممنوع الدخول', nameIt: 'Divieto di accesso', descriptionAr: 'ممنوع دخول جميع المركبات', descriptionIt: 'Vietato l\'accesso a tutti i veicoli', category: 'divieto', image: '', order: 1, createdAt: new Date().toISOString() },
    { id: 'sg4', nameAr: 'ممنوع التجاوز', nameIt: 'Divieto di sorpasso', descriptionAr: 'ممنوع تجاوز المركبات', descriptionIt: 'Vietato il sorpasso', category: 'divieto', image: '', order: 2, createdAt: new Date().toISOString() },
    { id: 'sg5', nameAr: 'اتجاه إجباري', nameIt: 'Direzione obbligatoria', descriptionAr: 'يجب المتابعة في الاتجاه المشار إليه', descriptionIt: 'Obbligo di seguire la direzione indicata', category: 'obbligo', image: '', order: 1, createdAt: new Date().toISOString() },
  ];
  for (const s of signs) await db.put('signs', s);

  // Seed dictionary sections & entries
  const dictSections: DictionarySection[] = [
    { id: 'ds1', nameAr: 'مصطلحات أساسية', nameIt: 'Termini base', icon: 'menu_book', order: 1, createdAt: new Date().toISOString() },
    { id: 'ds2', nameAr: 'أجزاء السيارة', nameIt: 'Parti del veicolo', icon: 'directions_car', order: 2, createdAt: new Date().toISOString() },
    { id: 'ds3', nameAr: 'أنواع الطرق', nameIt: 'Tipi di strade', icon: 'road', order: 3, createdAt: new Date().toISOString() },
  ];
  for (const ds of dictSections) await db.put('dictionarySections', ds);

  const dictEntries: DictionaryEntry[] = [
    { id: 'de1', sectionId: 'ds1', termIt: 'Patente', termAr: 'رخصة القيادة', definitionIt: 'Documento che abilita alla guida', definitionAr: 'وثيقة تخول حاملها قيادة المركبات', order: 1, createdAt: new Date().toISOString() },
    { id: 'de2', sectionId: 'ds1', termIt: 'Segnale', termAr: 'إشارة', definitionIt: 'Indicazione stradale visiva', definitionAr: 'علامة مرورية بصرية', order: 2, createdAt: new Date().toISOString() },
    { id: 'de3', sectionId: 'ds1', termIt: 'Precedenza', termAr: 'أولوية المرور', definitionIt: 'Diritto di passare prima', definitionAr: 'حق المرور أولاً', order: 3, createdAt: new Date().toISOString() },
    { id: 'de4', sectionId: 'ds1', termIt: 'Sorpasso', termAr: 'التجاوز', definitionIt: 'Superare un altro veicolo', definitionAr: 'تخطي مركبة أخرى', order: 4, createdAt: new Date().toISOString() },
    { id: 'de5', sectionId: 'ds2', termIt: 'Freno', termAr: 'فرامل', definitionIt: 'Dispositivo per rallentare o fermare', definitionAr: 'جهاز لإبطاء أو إيقاف المركبة', order: 1, createdAt: new Date().toISOString() },
    { id: 'de6', sectionId: 'ds2', termIt: 'Volante', termAr: 'مقود', definitionIt: 'Dispositivo per sterzare', definitionAr: 'جهاز لتوجيه المركبة', order: 2, createdAt: new Date().toISOString() },
    { id: 'de7', sectionId: 'ds2', termIt: 'Pneumatico', termAr: 'إطار', definitionIt: 'Rivestimento esterno della ruota', definitionAr: 'الغلاف الخارجي للعجلة', order: 3, createdAt: new Date().toISOString() },
    { id: 'de8', sectionId: 'ds3', termIt: 'Autostrada', termAr: 'طريق سريع', definitionIt: 'Strada riservata alla circolazione veloce', definitionAr: 'طريق مخصص للسير السريع', order: 1, createdAt: new Date().toISOString() },
    { id: 'de9', sectionId: 'ds3', termIt: 'Centro abitato', termAr: 'داخل المدينة', definitionIt: 'Zona urbanizzata con edifici', definitionAr: 'منطقة حضرية بها مباني', order: 2, createdAt: new Date().toISOString() },
    { id: 'de10', sectionId: 'ds3', termIt: 'Rotatoria', termAr: 'دوار', definitionIt: 'Intersezione a circolazione rotatoria', definitionAr: 'تقاطع بحركة دائرية', order: 3, createdAt: new Date().toISOString() },
  ];
  for (const de of dictEntries) await db.put('dictionaryEntries', de);

  await logAdmin(token, 'تهيئة البيانات', 'تم إنشاء البيانات الأولية');
  return ok(null);
}

// ============ HELPERS ============
async function logAdmin(token: string, action: string, details: string) {
  const user = await getAuthUser(token);
  if (!user) return;
  const db = await getDB();
  const log: AdminLog = { id: generateId(), adminId: user.id, action, details, createdAt: new Date().toISOString() };
  await db.put('adminLogs', log);
}
