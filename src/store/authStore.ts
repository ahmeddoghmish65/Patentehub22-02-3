import { create } from 'zustand';
import * as api from '@/db/api';
import type { User, QuizResult, UserMistake, Section, Lesson, Question, Sign, DictionarySection, DictionaryEntry, Post, Comment, Notification, Report, AdminLog } from '@/db/database';

const TOKEN_KEY = 'ph_token';

interface AppState {
  // Auth
  user: Omit<User, 'password'> | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Data
  sections: Section[];
  lessons: Lesson[];
  questions: Question[];
  signs: Sign[];
  dictSections: DictionarySection[];
  dictEntries: DictionaryEntry[];
  posts: Post[];
  quizHistory: QuizResult[];
  mistakes: UserMistake[];
  notifications: Notification[];

  // Admin
  adminUsers: Omit<User, 'password'>[];
  adminReports: Report[];
  adminLogs: AdminLog[];
  adminStats: { totalUsers: number; totalPosts: number; totalQuestions: number; totalSections: number; totalLessons: number; totalSigns: number; totalReports: number; activeToday: number } | null;

  // Auth actions
  register: (email: string, password: string, name: string, username?: string) => Promise<boolean>;
  checkUsername: (username: string) => Promise<{ available: boolean; suggestions: string[] }>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  resetPassword: (email: string, newPassword: string) => Promise<boolean>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<void>;
  updateSettings: (settings: Partial<User['settings']>) => Promise<void>;
  updateProgress: (p: Partial<User['progress']>) => Promise<void>;

  // Data actions
  loadSections: () => Promise<void>;
  loadLessons: (sectionId?: string) => Promise<void>;
  loadQuestions: (lessonId?: string, sectionId?: string) => Promise<void>;
  loadSigns: (category?: string) => Promise<void>;
  loadDictSections: () => Promise<void>;
  loadDictEntries: (sectionId?: string) => Promise<void>;
  loadPosts: () => Promise<void>;
  loadQuizHistory: () => Promise<void>;
  loadMistakes: () => Promise<void>;
  loadNotifications: () => Promise<void>;

  // Quiz
  saveQuizResult: (result: Omit<QuizResult, 'id' | 'userId' | 'createdAt'>) => Promise<void>;

  // Community
  createPost: (content: string, image: string) => Promise<boolean>;
  updatePost: (id: string, content: string) => Promise<boolean>;
  deletePost: (id: string) => Promise<boolean>;
  toggleLike: (postId: string) => Promise<{ liked: boolean; count: number } | null>;
  checkLike: (postId: string) => Promise<boolean>;
  getComments: (postId: string) => Promise<Comment[]>;
  createComment: (postId: string, content: string) => Promise<boolean>;
  deleteComment: (id: string) => Promise<boolean>;
  createReport: (type: 'post' | 'comment' | 'user', targetId: string, reason: string) => Promise<boolean>;

  // Admin
  loadAdminUsers: () => Promise<void>;
  loadAdminReports: () => Promise<void>;
  loadAdminLogs: () => Promise<void>;
  loadAdminStats: () => Promise<void>;
  banUser: (userId: string, banned: boolean) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  seedData: () => Promise<boolean>;

  // Admin CRUD
  createSection: (data: Omit<Section, 'id' | 'createdAt'>) => Promise<boolean>;
  updateSection: (id: string, data: Partial<Section>) => Promise<boolean>;
  deleteSection: (id: string) => Promise<boolean>;
  archiveSection: (id: string, archive: boolean) => Promise<boolean>;
  restoreSection: (id: string) => Promise<boolean>;
  permanentDeleteSection: (id: string) => Promise<boolean>;
  createLesson: (data: Omit<Lesson, 'id' | 'createdAt'>) => Promise<boolean>;
  updateLesson: (id: string, data: Partial<Lesson>) => Promise<boolean>;
  deleteLesson: (id: string) => Promise<boolean>;
  archiveLesson: (id: string, archive: boolean) => Promise<boolean>;
  restoreLesson: (id: string) => Promise<boolean>;
  permanentDeleteLesson: (id: string) => Promise<boolean>;
  createQuestion: (data: Omit<Question, 'id' | 'createdAt'>) => Promise<boolean>;
  updateQuestion: (id: string, data: Partial<Question>) => Promise<boolean>;
  deleteQuestion: (id: string) => Promise<boolean>;
  archiveQuestion: (id: string, archive: boolean) => Promise<boolean>;
  restoreQuestion: (id: string) => Promise<boolean>;
  permanentDeleteQuestion: (id: string) => Promise<boolean>;
  createSign: (data: Omit<Sign, 'id' | 'createdAt'>) => Promise<boolean>;
  updateSign: (id: string, data: Partial<Sign>) => Promise<boolean>;
  deleteSign: (id: string) => Promise<boolean>;
  archiveSign: (id: string, archive: boolean) => Promise<boolean>;
  restoreSign: (id: string) => Promise<boolean>;
  permanentDeleteSign: (id: string) => Promise<boolean>;
  createDictSection: (data: Omit<DictionarySection, 'id' | 'createdAt'>) => Promise<boolean>;
  updateDictSection: (id: string, data: Partial<DictionarySection>) => Promise<boolean>;
  deleteDictSection: (id: string) => Promise<boolean>;
  createDictEntry: (data: Omit<DictionaryEntry, 'id' | 'createdAt'>) => Promise<boolean>;
  updateDictEntry: (id: string, data: Partial<DictionaryEntry>) => Promise<boolean>;
  deleteDictEntry: (id: string) => Promise<boolean>;

  // Import/Export
  exportData: (storeName: string) => Promise<unknown[]>;
  importData: (storeName: string, data: unknown[]) => Promise<number>;

  // Admin posts/comments
  adminDeletePost: (id: string) => Promise<boolean>;
  adminDeleteComment: (id: string) => Promise<boolean>;
  updateReport: (id: string, status: 'reviewed' | 'dismissed') => Promise<boolean>;
}

export const useAuthStore = create<AppState>((set, get) => ({
  user: null, token: null, isLoading: true, error: null,
  sections: [], lessons: [], questions: [], signs: [],
  dictSections: [], dictEntries: [], posts: [],
  quizHistory: [], mistakes: [], notifications: [],
  adminUsers: [], adminReports: [], adminLogs: [], adminStats: null,

  // ============ AUTH ============
  checkUsername: async (username) => {
    const r = await api.apiCheckUsername(username);
    return r.data || { available: false, suggestions: [] };
  },

  register: async (email, password, name, username) => {
    set({ isLoading: true, error: null });
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const r = await api.apiRegister(email, password, name, { firstName, lastName, username });
    if (r.success && r.data) {
      sessionStorage.setItem(TOKEN_KEY, r.data.token);
      set({ user: r.data.user, token: r.data.token, isLoading: false });
      return true;
    }
    set({ error: r.error, isLoading: false }); return false;
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    const r = await api.apiLogin(email, password);
    if (r.success && r.data) {
      sessionStorage.setItem(TOKEN_KEY, r.data.token);
      set({ user: r.data.user, token: r.data.token, isLoading: false });
      return true;
    }
    set({ error: r.error, isLoading: false }); return false;
  },

  logout: async () => {
    const { token } = get();
    if (token) await api.apiLogout(token);
    sessionStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { set({ isLoading: false }); return; }
    const r = await api.apiGetUser(token);
    if (r.success && r.data) set({ user: r.data, token, isLoading: false });
    else { sessionStorage.removeItem(TOKEN_KEY); set({ isLoading: false }); }
  },

  clearError: () => set({ error: null }),

  resetPassword: async (email, newPassword) => {
    const r = await api.apiResetPassword(email, newPassword);
    if (!r.success) set({ error: r.error });
    return r.success;
  },

  updateProfile: async (data) => {
    const { token } = get(); if (!token) return;
    const r = await api.apiUpdateProfile(token, data);
    if (r.success && r.data) set({ user: r.data });
  },

  updateSettings: async (settings) => {
    const { token } = get(); if (!token) return;
    const r = await api.apiUpdateSettings(token, settings);
    if (r.success && r.data) set(s => ({ user: s.user ? { ...s.user, settings: r.data! } : null }));
  },

  updateProgress: async (p) => {
    const { token } = get(); if (!token) return;
    const r = await api.apiUpdateProgress(token, p);
    if (r.success && r.data) set(s => ({ user: s.user ? { ...s.user, progress: r.data! } : null }));
  },

  // ============ DATA LOADING ============
  loadSections: async () => { const r = await api.apiGetSections(); if (r.success && r.data) set({ sections: r.data }); },
  loadLessons: async (sId) => { const r = await api.apiGetLessons(sId); if (r.success && r.data) set({ lessons: r.data }); },
  loadQuestions: async (lId, sId) => { const r = await api.apiGetQuestions(lId, sId); if (r.success && r.data) set({ questions: r.data }); },
  loadSigns: async (cat) => { const r = await api.apiGetSigns(cat); if (r.success && r.data) set({ signs: r.data }); },
  loadDictSections: async () => { const r = await api.apiGetDictSections(); if (r.success && r.data) set({ dictSections: r.data }); },
  loadDictEntries: async (sId) => { const r = await api.apiGetDictEntries(sId); if (r.success && r.data) set({ dictEntries: r.data }); },
  loadPosts: async () => { const r = await api.apiGetPosts(); if (r.success && r.data) set({ posts: r.data }); },
  loadQuizHistory: async () => { const { token } = get(); if (!token) return; const r = await api.apiGetQuizHistory(token); if (r.success && r.data) set({ quizHistory: r.data }); },
  loadMistakes: async () => { const { token } = get(); if (!token) return; const r = await api.apiGetUserMistakes(token); if (r.success && r.data) set({ mistakes: r.data }); },
  loadNotifications: async () => { const { token } = get(); if (!token) return; const r = await api.apiGetNotifications(token); if (r.success && r.data) set({ notifications: r.data }); },

  // ============ QUIZ ============
  saveQuizResult: async (result) => {
    const { token } = get(); if (!token) return;
    await api.apiSaveQuizResult(token, result);
    const ur = await api.apiGetUser(token);
    if (ur.success && ur.data) set({ user: ur.data });
  },

  // ============ COMMUNITY ============
  createPost: async (content, image) => { const { token } = get(); if (!token) return false; const r = await api.apiCreatePost(token, content, image); if (r.success) await get().loadPosts(); return r.success; },
  updatePost: async (id, content) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdatePost(token, id, content); if (r.success) await get().loadPosts(); return r.success; },
  deletePost: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeletePost(token, id); if (r.success) await get().loadPosts(); return r.success; },
  toggleLike: async (postId) => { const { token } = get(); if (!token) return null; const r = await api.apiToggleLike(token, postId); if (r.success && r.data) { await get().loadPosts(); return r.data; } return null; },
  checkLike: async (postId) => { const { token } = get(); if (!token) return false; const r = await api.apiCheckLike(token, postId); return r.data || false; },
  getComments: async (postId) => { const r = await api.apiGetComments(postId); return r.data || []; },
  createComment: async (postId, content) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateComment(token, postId, content); if (r.success) await get().loadPosts(); return r.success; },
  deleteComment: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteComment(token, id); if (r.success) await get().loadPosts(); return r.success; },
  createReport: async (type, targetId, reason) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateReport(token, type, targetId, reason); return r.success; },

  // ============ ADMIN ============
  loadAdminUsers: async () => { const { token } = get(); if (!token) return; const r = await api.apiAdminGetUsers(token); if (r.success && r.data) set({ adminUsers: r.data }); },
  loadAdminReports: async () => { const { token } = get(); if (!token) return; const r = await api.apiAdminGetReports(token); if (r.success && r.data) set({ adminReports: r.data }); },
  loadAdminLogs: async () => { const { token } = get(); if (!token) return; const r = await api.apiAdminGetLogs(token); if (r.success && r.data) set({ adminLogs: r.data }); },
  loadAdminStats: async () => { const { token } = get(); if (!token) return; const r = await api.apiAdminGetStats(token); if (r.success && r.data) set({ adminStats: r.data }); },
  banUser: async (userId, banned) => { const { token } = get(); if (!token) return false; const r = await api.apiAdminBanUser(token, userId, banned); if (r.success) await get().loadAdminUsers(); return r.success; },
  deleteUser: async (userId) => { const { token } = get(); if (!token) return false; const r = await api.apiAdminDeleteUser(token, userId); if (r.success) await get().loadAdminUsers(); return r.success; },
  seedData: async () => { const { token } = get(); if (!token) return false; const r = await api.apiSeedData(token); return r.success; },

  // ============ ADMIN CRUD ============
  createSection: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateSection(token, data); if (r.success) await get().loadSections(); return r.success; },
  updateSection: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateSection(token, id, data); if (r.success) await get().loadSections(); return r.success; },
  deleteSection: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteSection(token, id); if (r.success) await get().loadSections(); return r.success; },
  archiveSection: async (id, archive) => { const { token } = get(); if (!token) return false; const r = await api.apiArchiveSection(token, id, archive); if (r.success) await get().loadSections(); return r.success; },
  restoreSection: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiRestoreSection(token, id); if (r.success) await get().loadSections(); return r.success; },
  permanentDeleteSection: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiPermanentDeleteSection(token, id); if (r.success) await get().loadSections(); return r.success; },

  createLesson: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateLesson(token, data); if (r.success) await get().loadLessons(); return r.success; },
  updateLesson: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateLesson(token, id, data); if (r.success) await get().loadLessons(); return r.success; },
  deleteLesson: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteLesson(token, id); if (r.success) await get().loadLessons(); return r.success; },
  archiveLesson: async (id, archive) => { const { token } = get(); if (!token) return false; const r = await api.apiArchiveLesson(token, id, archive); if (r.success) await get().loadLessons(); return r.success; },
  restoreLesson: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiRestoreLesson(token, id); if (r.success) await get().loadLessons(); return r.success; },
  permanentDeleteLesson: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiPermanentDeleteLesson(token, id); if (r.success) await get().loadLessons(); return r.success; },

  createQuestion: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateQuestion(token, data); if (r.success) await get().loadQuestions(); return r.success; },
  updateQuestion: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateQuestion(token, id, data); if (r.success) await get().loadQuestions(); return r.success; },
  deleteQuestion: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteQuestion(token, id); if (r.success) await get().loadQuestions(); return r.success; },
  archiveQuestion: async (id, archive) => { const { token } = get(); if (!token) return false; const r = await api.apiArchiveQuestion(token, id, archive); if (r.success) await get().loadQuestions(); return r.success; },
  restoreQuestion: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiRestoreQuestion(token, id); if (r.success) await get().loadQuestions(); return r.success; },
  permanentDeleteQuestion: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiPermanentDeleteQuestion(token, id); if (r.success) await get().loadQuestions(); return r.success; },

  createSign: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateSign(token, data); if (r.success) await get().loadSigns(); return r.success; },
  updateSign: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateSign(token, id, data); if (r.success) await get().loadSigns(); return r.success; },
  deleteSign: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteSign(token, id); if (r.success) await get().loadSigns(); return r.success; },
  archiveSign: async (id, archive) => { const { token } = get(); if (!token) return false; const r = await api.apiArchiveSign(token, id, archive); if (r.success) await get().loadSigns(); return r.success; },
  restoreSign: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiRestoreSign(token, id); if (r.success) await get().loadSigns(); return r.success; },
  permanentDeleteSign: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiPermanentDeleteSign(token, id); if (r.success) await get().loadSigns(); return r.success; },

  createDictSection: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateDictSection(token, data); if (r.success) await get().loadDictSections(); return r.success; },
  updateDictSection: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateDictSection(token, id, data); if (r.success) await get().loadDictSections(); return r.success; },
  deleteDictSection: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteDictSection(token, id); if (r.success) await get().loadDictSections(); return r.success; },

  createDictEntry: async (data) => { const { token } = get(); if (!token) return false; const r = await api.apiCreateDictEntry(token, data); if (r.success) await get().loadDictEntries(); return r.success; },
  updateDictEntry: async (id, data) => { const { token } = get(); if (!token) return false; const r = await api.apiUpdateDictEntry(token, id, data); if (r.success) await get().loadDictEntries(); return r.success; },
  deleteDictEntry: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteDictEntry(token, id); if (r.success) await get().loadDictEntries(); return r.success; },

  exportData: async (storeName) => { const { token } = get(); if (!token) return []; const r = await api.apiExportData(token, storeName); return (r.data || []) as unknown[]; },
  importData: async (storeName, data) => { const { token } = get(); if (!token) return 0; const r = await api.apiImportData(token, storeName, data); return (r.data || 0) as number; },

  adminDeletePost: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeletePost(token, id); if (r.success) await get().loadPosts(); return r.success; },
  adminDeleteComment: async (id) => { const { token } = get(); if (!token) return false; const r = await api.apiDeleteComment(token, id); return r.success; },
  updateReport: async (id, status) => { const { token } = get(); if (!token) return false; const r = await api.apiAdminUpdateReport(token, id, status); if (r.success) await get().loadAdminReports(); return r.success; },
}));
