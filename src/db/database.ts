import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'patente_hub_v3';
const DB_VERSION = 1;

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  avatar: string;
  bio: string;
  role: 'user' | 'admin' | 'manager';
  permissions: string[];
  isBanned: boolean;
  verified: boolean;
  following: string[];
  // Profile completion fields
  profileComplete: boolean;
  birthDate: string;
  country: string;
  province: string;
  gender: string;
  phone: string;
  phoneCode: string;
  italianLevel: string;
  privacyHideStats: boolean;
  createdAt: string;
  lastLogin: string;
  progress: UserProgress;
  settings: UserSettings;
}

export interface UserProgress {
  totalQuizzes: number;
  correctAnswers: number;
  wrongAnswers: number;
  completedLessons: string[];
  completedTopics: string[];
  currentStreak: number;
  bestStreak: number;
  lastStudyDate: string;
  level: number;
  xp: number;
  badges: string[];
  examReadiness: number;
}

export interface UserSettings {
  language: 'ar' | 'it' | 'both';
  theme: 'light' | 'dark';
  notifications: boolean;
  soundEffects: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

export interface Section {
  id: string;
  nameAr: string;
  nameIt: string;
  descriptionAr: string;
  descriptionIt: string;
  image: string;
  icon: string;
  color: string;
  order: number;
  createdAt: string;
  /** 'active' | 'archived' | 'deleted' */
  status?: 'active' | 'archived' | 'deleted';
  /** ISO string — only set when status='deleted' */
  deletedAt?: string;
}

export interface Lesson {
  id: string;
  sectionId: string;
  titleAr: string;
  titleIt: string;
  contentAr: string;
  contentIt: string;
  image: string;
  order: number;
  createdAt: string;
  status?: 'active' | 'archived' | 'deleted';
  deletedAt?: string;
}

export interface Question {
  id: string;
  lessonId: string;
  sectionId: string;
  questionAr: string;
  questionIt: string;
  isTrue: boolean;
  explanationAr: string;
  explanationIt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  image: string;
  order: number;
  createdAt: string;
  status?: 'active' | 'archived' | 'deleted';
  deletedAt?: string;
}

export interface Sign {
  id: string;
  nameAr: string;
  nameIt: string;
  descriptionAr: string;
  descriptionIt: string;
  category: string;
  image: string;
  order: number;
  createdAt: string;
  status?: 'active' | 'archived' | 'deleted';
  deletedAt?: string;
}

export interface DictionarySection {
  id: string;
  nameAr: string;
  nameIt: string;
  icon: string;
  order: number;
  createdAt: string;
}

export interface DictionaryEntry {
  id: string;
  sectionId: string;
  termIt: string;
  termAr: string;
  definitionIt: string;
  definitionAr: string;
  order: number;
  createdAt: string;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  image: string;
  type: 'post' | 'quiz';
  quizQuestion: string;
  quizAnswer: boolean;
  quizStats: { trueCount: number; falseCount: number };
  pinned: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
}

export interface Like {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
}

export interface Report {
  id: string;
  type: 'post' | 'comment' | 'user';
  targetId: string;
  userId: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: string;
}

export interface QuizResult {
  id: string;
  userId: string;
  topicId: string;
  lessonId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  timeSpent: number;
  answers: { questionId: string; userAnswer: boolean; correct: boolean }[];
  createdAt: string;
}

export interface UserMistake {
  id: string;
  userId: string;
  questionId: string;
  questionAr: string;
  questionIt: string;
  correctAnswer: boolean;
  userAnswer: boolean;
  count: number;
  lastMistakeAt: string;
}

export interface TrainingSession {
  id: string;
  userId: string;
  type: 'questions' | 'signs' | 'dictionary';
  score: number;
  total: number;
  timeSpent: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  createdAt: string;
}

export interface AdminLog {
  id: string;
  adminId: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface AuthToken {
  token: string;
  refreshToken: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

let dbInstance: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const stores = [
        { name: 'users', keyPath: 'id', indexes: [{ name: 'email', keyPath: 'email', unique: true }] },
        { name: 'sections', keyPath: 'id', indexes: [{ name: 'order', keyPath: 'order', unique: false }] },
        { name: 'lessons', keyPath: 'id', indexes: [{ name: 'sectionId', keyPath: 'sectionId', unique: false }] },
        { name: 'questions', keyPath: 'id', indexes: [{ name: 'lessonId', keyPath: 'lessonId', unique: false }, { name: 'sectionId', keyPath: 'sectionId', unique: false }] },
        { name: 'signs', keyPath: 'id', indexes: [{ name: 'category', keyPath: 'category', unique: false }] },
        { name: 'dictionarySections', keyPath: 'id', indexes: [] },
        { name: 'dictionaryEntries', keyPath: 'id', indexes: [{ name: 'sectionId', keyPath: 'sectionId', unique: false }] },
        { name: 'posts', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'comments', keyPath: 'id', indexes: [{ name: 'postId', keyPath: 'postId', unique: false }] },
        { name: 'likes', keyPath: 'id', indexes: [{ name: 'postId', keyPath: 'postId', unique: false }, { name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'reports', keyPath: 'id', indexes: [{ name: 'status', keyPath: 'status', unique: false }] },
        { name: 'quizResults', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'userMistakes', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'trainingSessions', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'notifications', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
        { name: 'adminLogs', keyPath: 'id', indexes: [] },
        { name: 'authTokens', keyPath: 'token', indexes: [{ name: 'userId', keyPath: 'userId', unique: false }] },
      ];
      for (const s of stores) {
        if (!db.objectStoreNames.contains(s.name)) {
          const store = db.createObjectStore(s.name, { keyPath: s.keyPath });
          for (const idx of s.indexes) {
            store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
          }
        }
      }
    },
  });
  return dbInstance;
}

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'patente_hub_salt_2024_production');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}
