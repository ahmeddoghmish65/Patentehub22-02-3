import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';

interface Props { onNavigate: (page: string, data?: Record<string, string>) => void; }

export function SignsPage({ onNavigate }: Props) {
  const { signs, loadSigns, user } = useAuthStore();
  const lang = user?.settings.language || 'both';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedSign, setSelectedSign] = useState<string | null>(null);
  void onNavigate;

  useEffect(() => { loadSigns(); }, [loadSigns]);

  // Only show active signs
  const activeSigns = signs.filter(s => !s.status || s.status === 'active');

  const categories = [...new Set(activeSigns.map(s => s.category))];
  const filtered = activeSigns.filter(s => {
    if (filter !== 'all' && s.category !== filter) return false;
    if (search && !s.nameAr.includes(search) && !s.nameIt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const catLabels: Record<string, { label: string; color: string; icon: string }> = {
    pericolo: { label: 'إشارات الخطر', color: '#ef4444', icon: 'warning' },
    divieto: { label: 'إشارات المنع', color: '#dc2626', icon: 'block' },
    obbligo: { label: 'إشارات الإلزام', color: '#2563eb', icon: 'arrow_circle_up' },
    indicazione: { label: 'إشارات الإرشاد', color: '#16a34a', icon: 'info' },
    precedenza: { label: 'أولوية المرور', color: '#f59e0b', icon: 'swap_vert' },
  };

  const selectedSignData = activeSigns.find(s => s.id === selectedSign);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900 mb-1">الإشارات المرورية</h1>
        <p className="text-surface-500 text-sm">تعلم إشارات المرور الإيطالية — {activeSigns.length} إشارة</p>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl p-4 border border-surface-100 mb-6 space-y-3">
        <div className="relative">
          <Icon name="search" size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-surface-200 text-sm focus:border-primary-500 transition-colors"
            placeholder="بحث عن إشارة بالعربية أو الإيطالية..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            className={cn('shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
              filter === 'all' ? 'bg-primary-500 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            )}
            onClick={() => setFilter('all')}
          >
            الكل ({activeSigns.length})
          </button>
          {categories.map(c => {
            const info = catLabels[c] || { label: c, color: '#64748b', icon: 'label' };
            const count = activeSigns.filter(s => s.category === c).length;
            return (
              <button
                key={c}
                className={cn('shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                  filter === c ? 'text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                )}
                style={filter === c ? { backgroundColor: info.color } : {}}
                onClick={() => setFilter(c)}
              >
                <Icon name={info.icon} size={14} />
                {info.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Results count */}
      {search && (
        <p className="text-sm text-surface-500 mb-4">
          {filtered.length > 0 ? `تم العثور على ${filtered.length} إشارة` : 'لا توجد نتائج'}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-surface-100">
          <Icon name="traffic" size={48} className="text-surface-300 mx-auto mb-4" />
          <p className="text-surface-500 mb-2">لا توجد إشارات</p>
          <p className="text-xs text-surface-400">سيتم إضافة الإشارات من لوحة التحكم</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(sign => {
            const catInfo = catLabels[sign.category] || { label: sign.category, color: '#64748b', icon: 'label' };
            return (
              <button
                key={sign.id}
                className="bg-white rounded-xl border border-surface-100 hover:border-primary-200 hover:shadow-lg transition-all text-center group overflow-hidden"
                onClick={() => setSelectedSign(sign.id)}
              >
                {/* Image area */}
                <div className="w-full aspect-square bg-surface-50 flex items-center justify-center p-4 relative">
                  {sign.image ? (
                    <img src={sign.image} alt={sign.nameAr} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: catInfo.color + '12' }}>
                      <Icon name="traffic" size={40} style={{ color: catInfo.color }} />
                    </div>
                  )}
                  {/* Category badge */}
                  <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: catInfo.color }}>
                    {catInfo.label}
                  </span>
                </div>

                {/* Info */}
                <div className="p-3 border-t border-surface-50">
                  {(lang === 'ar' || lang === 'both') && (
                    <h3 className="font-bold text-surface-900 text-sm mb-0.5 group-hover:text-primary-600 transition-colors line-clamp-1">{sign.nameAr}</h3>
                  )}
                  {(lang === 'it' || lang === 'both') && (
                    <p className="text-sm text-primary-500 line-clamp-1">{sign.nameIt}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sign Detail Modal */}
      {selectedSignData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedSign(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Image */}
            <div className="w-full aspect-square bg-surface-50 flex items-center justify-center p-8 relative">
              {selectedSignData.image ? (
                <img src={selectedSignData.image} alt={selectedSignData.nameAr} className="w-full h-full object-contain" />
              ) : (
                <div className="w-40 h-40 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: (catLabels[selectedSignData.category]?.color || '#64748b') + '12' }}>
                  <Icon name="traffic" size={80} style={{ color: catLabels[selectedSignData.category]?.color || '#64748b' }} />
                </div>
              )}
              <button className="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg"
                onClick={() => setSelectedSign(null)}>
                <Icon name="close" size={22} className="text-surface-600" />
              </button>
              <span className="absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full text-white"
                style={{ backgroundColor: catLabels[selectedSignData.category]?.color || '#64748b' }}>
                {catLabels[selectedSignData.category]?.label || selectedSignData.category}
              </span>
            </div>

            {/* Details */}
            <div className="p-6">
              {(lang === 'ar' || lang === 'both') && (
                <h2 className="text-xl font-bold text-surface-900 mb-1">{selectedSignData.nameAr}</h2>
              )}
              {(lang === 'it' || lang === 'both') && (
                <p className="text-xl text-primary-500 font-medium mb-4">{selectedSignData.nameIt}</p>
              )}

              <div className="bg-surface-50 rounded-xl p-4 space-y-3">
                {(lang === 'ar' || lang === 'both') && (
                  <div>
                    <p className="text-xs font-semibold text-surface-500 mb-1">🇸🇦 الوصف بالعربية</p>
                    <p className="text-sm text-surface-700 leading-relaxed">{selectedSignData.descriptionAr}</p>
                  </div>
                )}
                {(lang === 'it' || lang === 'both') && selectedSignData.descriptionIt && (
                  <div>
                    <p className="text-xs font-semibold text-surface-500 mb-1">🇮🇹 Descrizione</p>
                    <p className="text-sm text-surface-700 leading-relaxed" dir="ltr">{selectedSignData.descriptionIt}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
