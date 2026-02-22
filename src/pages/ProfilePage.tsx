import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { verifyPassword, hashPassword, getDB } from '@/db/database';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

interface ProfilePageProps {
  onNavigate: (page: string) => void;
}

const ITALIAN_PROVINCES = [
  'Agrigento','Alessandria','Ancona','Aosta','Arezzo','Ascoli Piceno','Asti','Avellino','Bari','Barletta-Andria-Trani',
  'Belluno','Benevento','Bergamo','Biella','Bologna','Bolzano','Brescia','Brindisi','Cagliari','Caltanissetta',
  'Campobasso','Caserta','Catania','Catanzaro','Chieti','Como','Cosenza','Cremona','Crotone','Cuneo',
  'Enna','Fermo','Ferrara','Firenze','Foggia','Forlì-Cesena','Frosinone','Genova','Gorizia','Grosseto',
  'Imperia','Isernia','La Spezia','L\'Aquila','Latina','Lecce','Lecco','Livorno','Lodi','Lucca',
  'Macerata','Mantova','Massa-Carrara','Matera','Messina','Milano','Modena','Monza e Brianza','Napoli','Novara',
  'Nuoro','Oristano','Padova','Palermo','Parma','Pavia','Perugia','Pesaro e Urbino','Pescara','Piacenza',
  'Pisa','Pistoia','Pordenone','Potenza','Prato','Ragusa','Ravenna','Reggio Calabria','Reggio Emilia','Rieti',
  'Rimini','Roma','Rovigo','Salerno','Sassari','Savona','Siena','Siracusa','Sondrio','Sud Sardegna',
  'Taranto','Teramo','Terni','Torino','Trapani','Trento','Treviso','Trieste','Udine','Varese',
  'Venezia','Verbano-Cusio-Ossola','Vercelli','Verona','Vibo Valentia','Vicenza','Viterbo'
];

const COUNTRY_CODES = [
  { code: '+39', country: '🇮🇹 إيطاليا' }, { code: '+966', country: '🇸🇦 السعودية' },
  { code: '+20', country: '🇪🇬 مصر' }, { code: '+962', country: '🇯🇴 الأردن' },
  { code: '+961', country: '🇱🇧 لبنان' }, { code: '+964', country: '🇮🇶 العراق' },
  { code: '+963', country: '🇸🇾 سوريا' }, { code: '+970', country: '🇵🇸 فلسطين' },
  { code: '+212', country: '🇲🇦 المغرب' }, { code: '+213', country: '🇩🇿 الجزائر' },
  { code: '+216', country: '🇹🇳 تونس' }, { code: '+218', country: '🇱🇾 ليبيا' },
  { code: '+971', country: '🇦🇪 الإمارات' }, { code: '+974', country: '🇶🇦 قطر' },
  { code: '+968', country: '🇴🇲 عمان' }, { code: '+973', country: '🇧🇭 البحرين' },
  { code: '+965', country: '🇰🇼 الكويت' }, { code: '+967', country: '🇾🇪 اليمن' },
  { code: '+249', country: '🇸🇩 السودان' }, { code: '+90', country: '🇹🇷 تركيا' },
  { code: '+49', country: '🇩🇪 ألمانيا' }, { code: '+33', country: '🇫🇷 فرنسا' },
  { code: '+44', country: '🇬🇧 بريطانيا' }, { code: '+34', country: '🇪🇸 إسبانيا' },
  { code: '+1', country: '🇺🇸 أمريكا' },
];

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, logout, updateSettings, updateProfile, mistakes, loadMistakes } = useAuthStore();
  
  const [showEditPage, setShowEditPage] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '', lastName: '', username: '', bio: '',
    email: '', phone: '', phoneCode: '+39',
    gender: '', birthDate: '', province: '', italianLevel: '',
    privacyHideStats: false,
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    birthDate: '', country: 'Italia', province: '', gender: '',
    phoneCode: '+39', phone: '', italianLevel: '',
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadMistakes(); }, [loadMistakes]);

  if (!user) return null;

  const { progress, settings } = user;
  const totalAnswers = progress.correctAnswers + progress.wrongAnswers;
  const accuracy = totalAnswers > 0 ? Math.round((progress.correctAnswers / totalAnswers) * 100) : 0;
  const isAdmin = user.role === 'admin' || user.role === 'manager';
  const storedBio = user.bio || localStorage.getItem(`bio_${user.id}`) || '';

  const handleLogout = async () => { await logout(); onNavigate('landing'); };

  const handleAvatarChange = () => { fileRef.current?.click(); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 5 ميجابايت'); return; }
    const reader = new FileReader();
    reader.onload = () => { updateProfile({ avatar: reader.result as string }); };
    reader.readAsDataURL(file);
  };
  const handleDeleteAvatar = () => { updateProfile({ avatar: '' }); };

  const openEditPage = () => {
    const nameParts = user.name.split(' ');
    setEditForm({
      firstName: user.firstName || nameParts[0] || '',
      lastName: user.lastName || nameParts.slice(1).join(' ') || '',
      username: user.username || '',
      bio: storedBio,
      email: user.email,
      phone: user.phone || '',
      phoneCode: user.phoneCode || '+39',
      gender: user.gender || '',
      birthDate: user.birthDate || '',
      province: user.province || '',
      italianLevel: user.italianLevel || '',
      privacyHideStats: user.privacyHideStats || false,
    });
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setPasswordMsg(''); setSaveMsg('');
    setShowEditPage(true);
  };

  const handleSaveEdit = async () => {
    setSaveMsg('');
    const db = await getDB();
    const u = await db.get('users', user.id);
    if (!u) return;
    u.firstName = editForm.firstName;
    u.lastName = editForm.lastName;
    u.name = `${editForm.firstName} ${editForm.lastName}`.trim();
    u.username = editForm.username;
    u.bio = editForm.bio;
    u.phone = editForm.phone;
    u.phoneCode = editForm.phoneCode;
    u.gender = editForm.gender;
    u.birthDate = editForm.birthDate;
    u.province = editForm.province;
    u.italianLevel = editForm.italianLevel;
    u.privacyHideStats = editForm.privacyHideStats;
    if (editForm.email !== user.email) u.email = editForm.email;
    localStorage.setItem(`bio_${user.id}`, editForm.bio);
    await db.put('users', u);
    setSaveMsg('✓ تم حفظ التعديلات بنجاح');
    setTimeout(() => { setSaveMsg(''); setShowEditPage(false); window.location.reload(); }, 1500);
  };

  const handleChangePassword = async () => {
    setPasswordMsg('');
    if (!currentPassword) { setPasswordMsg('يرجى إدخال كلمة المرور الحالية'); return; }
    if (!newPassword || newPassword.length < 6) { setPasswordMsg('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg('كلمة المرور الجديدة وتأكيدها غير متطابقين'); return; }
    const db = await getDB();
    const fullUser = await db.get('users', user.id);
    if (!fullUser) { setPasswordMsg('حدث خطأ'); return; }
    const isValid = await verifyPassword(currentPassword, fullUser.password);
    if (!isValid) { setPasswordMsg('كلمة المرور الحالية غير صحيحة'); return; }
    fullUser.password = await hashPassword(newPassword);
    await db.put('users', fullUser);
    setPasswordMsg('✓ تم تغيير كلمة المرور بنجاح');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  };

  const onEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('حجم الصورة يجب أن يكون أقل من 5 ميجابايت'); return; }
    const reader = new FileReader();
    reader.onload = () => { updateProfile({ avatar: reader.result as string }); };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    const { birthDate, province, gender, phoneCode, phone, italianLevel } = profileForm;
    if (!birthDate || !province || !gender || !phone || !italianLevel) {
      alert('يرجى ملء جميع الحقول المطلوبة'); return;
    }
    const db = await getDB();
    const u = await db.get('users', user.id);
    if (u) {
      u.birthDate = birthDate; u.country = 'Italia'; u.province = province;
      u.gender = gender; u.phoneCode = phoneCode; u.phone = phone;
      u.italianLevel = italianLevel; u.profileComplete = true;
      await db.put('users', u);
    }
    setShowCompleteProfile(false);
    window.location.reload();
  };

  const languageOptions = [
    { value: 'ar' as const, label: 'العربية فقط', icon: '🇸🇦' },
    { value: 'it' as const, label: 'الإيطالية فقط', icon: '🇮🇹' },
    { value: 'both' as const, label: 'العربية + الإيطالية', icon: '🌐' },
  ];

  const allBadges = [
    { id: 'newcomer', name: 'عضو جديد', icon: 'waving_hand', color: 'bg-blue-500' },
    { id: 'quiz_master', name: 'خبير الاختبارات', icon: 'quiz', color: 'bg-purple-500' },
    { id: 'perfect_score', name: 'علامة كاملة', icon: 'star', color: 'bg-yellow-500' },
    { id: 'week_streak', name: 'أسبوع متواصل', icon: 'local_fire_department', color: 'bg-orange-500' },
    { id: 'level_5', name: 'المستوى 5', icon: 'military_tech', color: 'bg-green-500' },
  ];

  // ==================== EDIT PAGE (not overlay - inline page) ====================
  if (showEditPage) {
    return (
      <div className="max-w-lg mx-auto space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setShowEditPage(false)} className="flex items-center gap-2 text-surface-500 hover:text-primary-600">
            <Icon name="arrow_forward" size={22} />
            <span className="text-sm font-medium">رجوع</span>
          </button>
          <h2 className="text-lg font-bold text-surface-900">تعديل الحساب</h2>
          <div className="w-16" />
        </div>

        {/* Avatar */}
        <div className="text-center">
          <input type="file" ref={editFileRef} className="hidden" accept="image/*" onChange={onEditFileChange} />
          <div className="relative inline-block">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-24 h-24 rounded-2xl object-cover shadow-lg" />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-3xl font-bold text-white">{user.name.charAt(0)}</span>
              </div>
            )}
            <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-primary-600"
              onClick={() => editFileRef.current?.click()}>
              <Icon name="camera_alt" size={16} />
            </button>
            {user.avatar && (
              <button className="absolute -top-2 -left-2 w-7 h-7 bg-danger-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-danger-600 border-2 border-white"
                onClick={handleDeleteAvatar}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <p className="text-xs text-surface-400 mt-3">اضغط على الكاميرا لتغيير الصورة</p>
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-2xl p-5 border border-surface-100">
          <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
            <Icon name="person" size={18} className="text-primary-500" /> المعلومات الشخصية
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-surface-500 mb-1 block">الاسم الأول</label>
                <input className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-surface-500 mb-1 block">اسم العائلة</label>
                <input className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">اسم المستخدم</label>
              <input className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm" dir="ltr" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">نبذة عني</label>
              <textarea className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm resize-none" rows={2} value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} maxLength={150} placeholder="اكتب نبذة عنك..." />
              <span className="text-[10px] text-surface-400">{editForm.bio.length}/150</span>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">تاريخ الميلاد</label>
              <input type="date" className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.birthDate} onChange={e => setEditForm(f => ({ ...f, birthDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">الجنس</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: 'male', label: 'ذكر ♂️' }, { value: 'female', label: 'أنثى ♀️' }].map(g => (
                  <button key={g.value} className={cn('py-2.5 rounded-xl border-2 text-sm font-medium', editForm.gender === g.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-200 text-surface-600')}
                    onClick={() => setEditForm(f => ({ ...f, gender: g.value }))}>{g.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl p-5 border border-surface-100">
          <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
            <Icon name="contact_mail" size={18} className="text-primary-500" /> معلومات الاتصال
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-surface-500 mb-1 block">البريد الإلكتروني</label>
              <input type="email" dir="ltr" className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm text-left" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">رقم الهاتف</label>
              <div className="flex gap-2">
                <select className="w-28 border border-surface-200 rounded-xl px-2 py-2.5 text-sm shrink-0" value={editForm.phoneCode} onChange={e => setEditForm(f => ({ ...f, phoneCode: e.target.value }))}>
                  {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.country.split(' ')[0]} {c.code}</option>)}
                </select>
                <input type="tel" dir="ltr" className="flex-1 border border-surface-200 rounded-xl px-3 py-2.5 text-sm text-left" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="1234567890" />
              </div>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">المحافظة (Provincia)</label>
              <select className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.province} onChange={e => setEditForm(f => ({ ...f, province: e.target.value }))}>
                <option value="">اختر المحافظة</option>
                {ITALIAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">مستوى الإيطالية</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: 'weak', label: 'ضعيف' }, { value: 'good', label: 'جيد' }, { value: 'very_good', label: 'جيد جداً' }, { value: 'native', label: 'أنا إيطالي' }].map(l => (
                  <button key={l.value} className={cn('py-2 rounded-xl border-2 text-xs font-medium', editForm.italianLevel === l.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-200 text-surface-600')}
                    onClick={() => setEditForm(f => ({ ...f, italianLevel: l.value }))}>{l.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-white rounded-2xl p-5 border border-surface-100">
          <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
            <Icon name="lock" size={18} className="text-primary-500" /> الخصوصية
          </h3>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-surface-700">إخفاء إحصائياتي</p>
              <p className="text-xs text-surface-400">لن يتمكن الآخرون من رؤية إحصائياتك</p>
            </div>
            <button
              className={cn('w-12 h-6 rounded-full transition-colors relative', editForm.privacyHideStats ? 'bg-primary-500' : 'bg-surface-200')}
              onClick={() => setEditForm(f => ({ ...f, privacyHideStats: !f.privacyHideStats }))}
            >
              <div className={cn('w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-all', editForm.privacyHideStats ? 'left-0.5' : 'left-6')} />
            </button>
          </label>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl p-5 border border-surface-100">
          <h3 className="text-sm font-bold text-surface-800 mb-4 flex items-center gap-2">
            <Icon name="security" size={18} className="text-primary-500" /> تغيير كلمة المرور
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-surface-500 mb-1 block">كلمة المرور الحالية</label>
              <input type="password" dir="ltr" className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm text-left" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">كلمة المرور الجديدة</label>
              <input type="password" dir="ltr" className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm text-left" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 أحرف على الأقل" />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">تأكيد كلمة المرور الجديدة</label>
              <input type="password" dir="ltr" className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm text-left" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            {confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-danger-500">❌ كلمة المرور غير متطابقة</p>}
            {passwordMsg && <p className={cn('text-xs', passwordMsg.includes('✓') ? 'text-success-600' : 'text-danger-500')}>{passwordMsg}</p>}
            <Button size="sm" onClick={handleChangePassword} disabled={!currentPassword || !newPassword}>تغيير كلمة المرور</Button>
          </div>
        </div>

        {/* Save */}
        {saveMsg && (
          <div className={cn('rounded-xl p-3 text-center text-sm font-medium', saveMsg.includes('✓') ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600')}>
            {saveMsg}
          </div>
        )}
        <Button fullWidth size="lg" onClick={handleSaveEdit}>
          <Icon name="save" size={20} className="ml-2" /> حفظ جميع التعديلات
        </Button>
      </div>
    );
  }

  // ==================== MAIN PROFILE PAGE ====================
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-6 border border-surface-100">
        <div className="flex items-start gap-4 mb-5">
          <div className="relative group">
            <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={onFileChange} />
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-20 h-20 rounded-2xl object-cover shadow-lg cursor-pointer" onClick={handleAvatarChange} />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg cursor-pointer" onClick={handleAvatarChange}>
                <span className="text-2xl font-bold text-white">{user.name.charAt(0)}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={handleAvatarChange}>
              <Icon name="camera_alt" size={22} className="text-white" />
            </div>
            {user.avatar && (
              <button className="absolute -top-1 -left-1 w-6 h-6 bg-danger-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm hover:bg-danger-600"
                onClick={handleDeleteAvatar} title="حذف الصورة">
                <Icon name="close" size={14} className="text-white" />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-xl font-bold text-surface-900">{user.name}</h1>
              {user.verified && <VerifiedBadge size="md" tooltip />}
            </div>
            <p className="text-sm text-surface-500 mb-1">@{user.username || 'user'} · {user.email}</p>
            {storedBio && <p className="text-sm text-surface-600 mt-1">{storedBio}</p>}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">المستوى {progress.level}</span>
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">{progress.xp} XP</span>
              {!user.profileComplete && (
                <button className="text-xs bg-warning-50 text-warning-600 px-2 py-0.5 rounded-full font-medium animate-pulse" onClick={() => setShowCompleteProfile(true)}>
                  ⚠️ أكمل بياناتك
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'اختبارات', value: String(progress.totalQuizzes), icon: 'quiz', color: 'text-blue-500' },
            { label: 'الدقة', value: `${accuracy}%`, icon: 'check_circle', color: 'text-green-500' },
            { label: 'السلسلة', value: `${progress.currentStreak}`, icon: 'local_fire_department', color: 'text-orange-500' },
            { label: 'الجاهزية', value: `${progress.examReadiness}%`, icon: 'verified', color: 'text-purple-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-surface-50 rounded-xl p-2.5 text-center">
              <Icon name={stat.icon} size={18} className={cn(stat.color, 'mb-0.5')} filled />
              <p className="text-base font-bold text-surface-900">{stat.value}</p>
              <p className="text-[10px] text-surface-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Account Button */}
      <button
        className="w-full bg-white rounded-xl p-4 border border-surface-100 flex items-center gap-3 hover:border-primary-200 hover:shadow-md transition-all group"
        onClick={openEditPage}
      >
        <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center group-hover:bg-primary-100 transition-colors">
          <Icon name="manage_accounts" size={22} className="text-primary-500" />
        </div>
        <div className="flex-1 text-right">
          <h3 className="font-bold text-surface-900">تعديل بيانات الحساب</h3>
          <p className="text-xs text-surface-400">الاسم، الصورة، البريد، كلمة المرور، الخصوصية...</p>
        </div>
        <Icon name="chevron_left" size={22} className="text-surface-300 group-hover:text-primary-500 transition-colors" />
      </button>

      {/* Admin Panel Button */}
      {isAdmin && (
        <button className="w-full bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-4 flex items-center gap-3 text-white shadow-lg shadow-primary-200 hover:shadow-xl transition-all" onClick={() => onNavigate('admin')}>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Icon name="admin_panel_settings" size={24} filled /></div>
          <div className="flex-1 text-right"><h3 className="font-bold">لوحة التحكم</h3><p className="text-xs text-primary-200">إدارة المحتوى والمستخدمين</p></div>
          <Icon name="chevron_left" size={22} />
        </button>
      )}

      {/* Language */}
      <div className="bg-white rounded-xl p-5 border border-surface-100">
        <h2 className="font-bold text-surface-900 mb-2 flex items-center gap-2"><Icon name="translate" size={20} className="text-primary-500" /> لغة عرض المحتوى</h2>
        <p className="text-xs text-surface-400 mb-4">تؤثر فقط على عرض المحتوى في الدروس والأسئلة والإشارات والقاموس</p>
        <div className="grid grid-cols-3 gap-2">
          {languageOptions.map(opt => (
            <button key={opt.value} className={cn('flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all', settings.language === opt.value ? 'border-primary-500 bg-primary-50' : 'border-surface-100 hover:border-surface-200')} onClick={() => updateSettings({ language: opt.value })}>
              <span className="text-xl">{opt.icon}</span>
              <span className={cn('text-xs font-medium', settings.language === opt.value ? 'text-primary-700' : 'text-surface-600')}>{opt.label}</span>
              {settings.language === opt.value && <Icon name="check_circle" size={16} className="text-primary-500" filled />}
            </button>
          ))}
        </div>
      </div>

      {/* Exam Readiness */}
      <div className="bg-white rounded-xl p-5 border border-surface-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-surface-900 flex items-center gap-2"><Icon name="verified" size={20} className="text-primary-500" filled /> جاهزية الامتحان</h2>
          <span className={cn('text-xl font-bold', progress.examReadiness >= 70 ? 'text-success-500' : progress.examReadiness >= 40 ? 'text-warning-500' : 'text-danger-500')}>{progress.examReadiness}%</span>
        </div>
        <div className="w-full bg-surface-100 rounded-full h-3 mb-2">
          <div className={cn('rounded-full h-3 transition-all duration-700', progress.examReadiness >= 70 ? 'bg-success-500' : progress.examReadiness >= 40 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${progress.examReadiness}%` }} />
        </div>
        <p className="text-xs text-surface-500">{progress.examReadiness >= 70 ? '🎉 أنت جاهز للامتحان!' : progress.examReadiness >= 40 ? '📚 تقدم جيد، واصل الدراسة' : '🚀 ابدأ بحل الاختبارات'}</p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl p-5 border border-surface-100">
        <h2 className="font-bold text-surface-900 mb-4 flex items-center gap-2"><Icon name="trending_up" size={20} className="text-primary-500" /> التقدم</h2>
        <div className="grid grid-cols-3 gap-3 pt-3">
          <div className="text-center"><p className="text-sm font-bold text-success-600">{progress.correctAnswers}</p><p className="text-xs text-surface-400">صحيحة</p></div>
          <div className="text-center"><p className="text-sm font-bold text-danger-600">{progress.wrongAnswers}</p><p className="text-xs text-surface-400">خاطئة</p></div>
          <div className="text-center"><p className="text-sm font-bold text-primary-600">{totalAnswers}</p><p className="text-xs text-surface-400">إجمالي</p></div>
        </div>
      </div>

      {/* Badges */}
      <div className="bg-white rounded-xl p-5 border border-surface-100">
        <h2 className="font-bold text-surface-900 mb-4 flex items-center gap-2"><Icon name="emoji_events" size={20} className="text-orange-500" /> الإنجازات ({progress.badges.length}/{allBadges.length})</h2>
        <div className="grid grid-cols-5 gap-2">
          {allBadges.map(badge => {
            const isEarned = progress.badges.includes(badge.id);
            return (
              <div key={badge.id} className={cn('rounded-xl p-2 text-center', isEarned ? 'opacity-100' : 'opacity-30')}>
                <div className={cn('w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-1', isEarned ? badge.color : 'bg-surface-200')}>
                  <Icon name={badge.icon} size={20} className={isEarned ? 'text-white' : 'text-surface-400'} filled />
                </div>
                <p className="text-[10px] font-semibold text-surface-700 leading-tight">{badge.name}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mistakes */}
      {mistakes.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-100 overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center gap-2">
            <Icon name="error_outline" size={20} className="text-danger-500" />
            <h2 className="font-bold text-surface-900">أخطائي ({mistakes.length})</h2>
          </div>
          <div className="divide-y divide-surface-50 max-h-60 overflow-y-auto">
            {mistakes.slice(0, 5).map(m => (
              <div key={m.id} className="p-3 flex items-start gap-3">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', m.count >= 3 ? 'bg-danger-50' : 'bg-warning-50')}>
                  <span className="text-xs font-bold" style={{ color: m.count >= 3 ? '#ef4444' : '#f59e0b' }}>{m.count}×</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-surface-800">{m.questionAr}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-danger-500">إجابتك: {m.userAnswer ? 'صحيح' : 'خطأ'}</span>
                    <span className="text-success-500">الصحيح: {m.correctAnswer ? 'صحيح' : 'خطأ'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Info */}
      <div className="bg-white rounded-xl p-5 border border-surface-100">
        <h2 className="font-bold text-surface-900 mb-3 flex items-center gap-2"><Icon name="info" size={20} className="text-surface-400" /> معلومات الحساب</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1"><span className="text-surface-500">تاريخ التسجيل</span><span className="text-surface-700">{new Date(user.createdAt).toLocaleDateString('ar')}</span></div>
          <div className="flex justify-between py-1"><span className="text-surface-500">آخر دخول</span><span className="text-surface-700">{new Date(user.lastLogin).toLocaleDateString('ar')}</span></div>
          <div className="flex justify-between py-1"><span className="text-surface-500">نوع الحساب</span><span className="text-primary-600 font-medium">{user.role === 'admin' ? 'مسؤول' : user.role === 'manager' ? 'مدير' : 'مستخدم'}</span></div>
        </div>
        {!user.profileComplete && (
          <button className="mt-3 w-full bg-warning-50 text-warning-700 rounded-lg py-2.5 text-sm font-medium border border-warning-200 hover:bg-warning-100" onClick={() => setShowCompleteProfile(true)}>
            ⚠️ أكمل بياناتك الشخصية
          </button>
        )}
      </div>

      {/* Logout */}
      <Button variant="danger" fullWidth onClick={handleLogout} icon={<Icon name="logout" size={20} />}>تسجيل الخروج</Button>

      {/* Profile Completion Modal */}
      {showCompleteProfile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto bg-primary-50 rounded-2xl flex items-center justify-center mb-3">
                <Icon name="person_add" size={32} className="text-primary-500" filled />
              </div>
              <h3 className="text-lg font-bold text-surface-900">أكمل بياناتك الشخصية</h3>
              <p className="text-sm text-surface-500 mt-1">لاستمرار استخدام جميع ميزات التطبيق</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">تاريخ الميلاد *</label>
                <input type="date" className="w-full border border-surface-200 rounded-xl p-3 text-sm" value={profileForm.birthDate} onChange={e => setProfileForm(p => ({ ...p, birthDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">الدولة *</label>
                <select className="w-full border border-surface-200 rounded-xl p-3 text-sm bg-surface-50" disabled>
                  <option>🇮🇹 Italia (إيطاليا)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">المحافظة *</label>
                <select className="w-full border border-surface-200 rounded-xl p-3 text-sm" value={profileForm.province} onChange={e => setProfileForm(p => ({ ...p, province: e.target.value }))}>
                  <option value="">اختر المحافظة</option>
                  {ITALIAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">الجنس *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'male', label: 'ذكر ♂️' }, { value: 'female', label: 'أنثى ♀️' }].map(g => (
                    <button key={g.value} className={cn('p-3 rounded-xl border-2 text-sm font-medium', profileForm.gender === g.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-200 text-surface-600')} onClick={() => setProfileForm(p => ({ ...p, gender: g.value }))}>{g.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">رقم الهاتف *</label>
                <div className="flex gap-2">
                  <select className="w-28 border border-surface-200 rounded-xl p-3 text-sm shrink-0" value={profileForm.phoneCode} onChange={e => setProfileForm(p => ({ ...p, phoneCode: e.target.value }))}>
                    {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.country.split(' ')[0]} {c.code}</option>)}
                  </select>
                  <input type="tel" dir="ltr" className="flex-1 border border-surface-200 rounded-xl p-3 text-sm text-left" placeholder="1234567890" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">مستوى الإيطالية *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'weak', label: 'ضعيف' }, { value: 'good', label: 'جيد' }, { value: 'very_good', label: 'جيد جداً' }, { value: 'native', label: 'أنا إيطالي' }].map(l => (
                    <button key={l.value} className={cn('p-2.5 rounded-xl border-2 text-xs font-medium', profileForm.italianLevel === l.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-200 text-surface-600')} onClick={() => setProfileForm(p => ({ ...p, italianLevel: l.value }))}>{l.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button fullWidth variant="ghost" onClick={() => setShowCompleteProfile(false)}>لاحقاً</Button>
              <Button fullWidth onClick={handleSaveProfile}>حفظ البيانات</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
