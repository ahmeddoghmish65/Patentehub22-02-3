import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

interface Props {
  lessonId: string;
  onNavigate: (page: string, data?: Record<string, string>) => void;
}

export function LessonDetailPage({ lessonId, onNavigate }: Props) {
  const { lessons, questions, sections, loadLessons, loadQuestions, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'content' | 'questions'>('content');

  const lang = user?.settings.language || 'both';

  useEffect(() => { loadLessons(); loadQuestions(lessonId); }, [loadLessons, loadQuestions, lessonId]);

  const lesson = lessons.find(l => l.id === lessonId);
  const section = lesson ? sections.find(s => s.id === lesson.sectionId) : null;
  const lessonQuestions = questions.filter(q => q.lessonId === lessonId);
  const sectionLessons = lesson ? lessons.filter(l => l.sectionId === lesson.sectionId).sort((a, b) => a.order - b.order) : [];
  const isCompleted = user?.progress.completedLessons.includes(lessonId);

  if (!lesson) return (
    <div className="text-center py-20">
      <Icon name="error" size={48} className="text-surface-300 mx-auto mb-4" />
      <p className="text-surface-500">الدرس غير موجود</p>
      <Button className="mt-4" onClick={() => onNavigate('lessons')}>العودة للدروس</Button>
    </div>
  );

  return (
    <div>
      <button onClick={() => onNavigate('lessons')} className="flex items-center gap-2 text-surface-500 hover:text-primary-600 mb-6">
        <Icon name="arrow_forward" size={20} />
        <span className="text-sm">العودة للدروس</span>
      </button>

      <div className="bg-white rounded-2xl p-6 border border-surface-100 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: (section?.color || '#3b82f6') + '15' }}>
            <Icon name={section?.icon || 'school'} size={28} style={{ color: section?.color || '#3b82f6' }} filled />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-surface-900">{lesson.titleAr}</h1>
            <p className="text-sm text-primary-500">{lesson.titleIt}</p>
            {isCompleted && <span className="inline-flex items-center gap-1 mt-2 text-xs bg-success-50 text-success-600 px-2 py-1 rounded-full"><Icon name="check" size={14} /> مكتمل</span>}
          </div>
        </div>

        {sectionLessons.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {sectionLessons.map(l => (
              <button key={l.id}
                className={cn('shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all', l.id === lessonId ? 'bg-primary-500 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}
                onClick={() => onNavigate('lesson-detail', { lessonId: l.id, sectionId: l.sectionId })}
              >
                {l.titleAr}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs - Modern gradient design */}
      <div className="bg-white rounded-2xl p-1.5 border border-surface-100 mb-6 flex gap-1">
        <button className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all', 
          activeTab === 'content' ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-200' : 'text-surface-500 hover:bg-surface-50')} 
          onClick={() => setActiveTab('content')}>
          <Icon name="article" size={20} filled={activeTab === 'content'} /> الشرح
        </button>
        <button className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all', 
          activeTab === 'questions' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200' : 'text-surface-500 hover:bg-surface-50')} 
          onClick={() => setActiveTab('questions')}>
          <Icon name="quiz" size={20} filled={activeTab === 'questions'} /> الأسئلة <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-xs">{lessonQuestions.length}</span>
        </button>
      </div>

      {activeTab === 'content' ? (
        <div className="bg-white rounded-2xl p-6 border border-surface-100 space-y-6">
          {lesson.image && <img src={lesson.image} alt="" className="w-full rounded-xl" />}
          
          {(lang === 'it' || lang === 'both') && (
            <div>
              <h3 className="text-sm font-semibold text-primary-600 mb-2 flex items-center gap-1">🇮🇹 Italiano</h3>
              <p className="text-base text-surface-700 leading-relaxed whitespace-pre-wrap" dir="ltr">{lesson.contentIt}</p>
            </div>
          )}

          {lang === 'both' && <hr className="border-surface-100" />}

          {(lang === 'ar' || lang === 'both') && (
            <div>
              <h3 className="text-sm font-semibold text-primary-600 mb-2 flex items-center gap-1">🇸🇦 الشرح بالعربية</h3>
              <p className="text-base text-surface-700 leading-relaxed whitespace-pre-wrap">{lesson.contentAr}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {lessonQuestions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-surface-100">
              <Icon name="quiz" size={40} className="text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500">لا توجد أسئلة لهذا الدرس بعد</p>
            </div>
          ) : (
            <>
              {lessonQuestions.map((q, i) => (
                <div key={q.id} className="bg-white rounded-xl p-4 border border-surface-100">
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-xs font-bold text-surface-500 shrink-0">{i + 1}</span>
                    <div>
                      {(lang === 'ar' || lang === 'both') && (
                        <p className="text-sm font-medium text-surface-800">{q.questionAr}</p>
                      )}
                      {(lang === 'it' || lang === 'both') && (
                        <p className={cn("text-sm text-surface-500", lang === 'both' && 'mt-1')} dir="ltr">{q.questionIt}</p>
                      )}
                      <span className={cn('inline-block mt-2 text-xs px-2 py-0.5 rounded-full', q.isTrue ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600')}>
                        {q.isTrue ? '✓ صحيح / Vero' : '✗ خطأ / Falso'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Quiz button at the bottom */}
              <div className="pt-4">
                <Button fullWidth size="lg" onClick={() => onNavigate('quiz', { lessonId, sectionId: lesson.sectionId })} icon={<Icon name="play_arrow" size={22} />}>
                  ابدأ اختبار الدرس ({lessonQuestions.length} أسئلة)
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
