import { useAuthStore } from '@/store/authStore';
import { topics, getQuestionsForTopic } from '@/data/questions';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';

interface TopicsPageProps {
  onNavigate: (page: string, data?: Record<string, string>) => void;
}

export function TopicsPage({ onNavigate }: TopicsPageProps) {
  const { user } = useAuthStore();
  const completedTopics = user?.progress.completedTopics || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900 mb-2">المواضيع الدراسية</h1>
        <p className="text-surface-500">اختر موضوعاً وابدأ بالتدرب على الأسئلة</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <div className="w-3 h-3 rounded-full bg-success-500" />
            مكتمل ({completedTopics.length})
          </div>
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <div className="w-3 h-3 rounded-full bg-surface-300" />
            غير مكتمل ({topics.length - completedTopics.length})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics.map((topic, index) => {
          const isCompleted = completedTopics.includes(topic.id);
          const questionCount = getQuestionsForTopic(topic.id).length;

          return (
            <button
              key={topic.id}
              className={cn(
                'bg-white rounded-2xl p-6 border-2 text-right transition-all duration-300 group hover:shadow-lg',
                isCompleted ? 'border-success-200 hover:border-success-300' : 'border-surface-100 hover:border-primary-200'
              )}
              onClick={() => onNavigate('quiz', { topicId: topic.id })}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: topic.color + '15' }}
                >
                  <Icon name={topic.icon} size={28} style={{ color: topic.color }} filled />
                </div>
                {isCompleted && (
                  <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center">
                    <Icon name="check_circle" size={20} className="text-success-500" filled />
                  </div>
                )}
              </div>

              <h3 className="text-lg font-bold text-surface-900 mb-1 group-hover:text-primary-600 transition-colors">
                {topic.nameAr}
              </h3>
              <p className="text-sm text-primary-500 font-medium mb-2">{topic.nameIt}</p>
              <p className="text-xs text-surface-400 mb-4 line-clamp-2">{topic.descriptionAr}</p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-400 flex items-center gap-1">
                  <Icon name="quiz" size={14} />
                  {questionCount} سؤال
                </span>
                <span className="text-xs text-primary-500 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                  ابدأ الاختبار
                  <Icon name="arrow_back" size={14} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
