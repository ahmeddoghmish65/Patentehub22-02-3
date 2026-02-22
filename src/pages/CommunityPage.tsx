import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { getDB } from '@/db/database';
import type { Comment, Post } from '@/db/database';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

function isReply(c: Comment): boolean { return c.content.startsWith('REPLY_TO:'); }
function getParentId(c: Comment): string | null {
  if (!isReply(c)) return null;
  const match = c.content.match(/^REPLY_TO:([^:]+):/);
  return match ? match[1] : null;
}
function getReplyContent(c: Comment): string {
  return c.content.replace(/^REPLY_TO:[^:]+:/, '');
}

export function CommunityPage() {
  const { posts, loadPosts, createPost, updatePost, deletePost, toggleLike, checkLike, getComments, createComment, deleteComment, createReport, user } = useAuthStore();
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [reportModal, setReportModal] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'post' | 'comment' | 'reply'; id: string } | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; userName: string } | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [commentLikeCounts, setCommentLikeCounts] = useState<Record<string, number>>({});
  const [postType, setPostType] = useState<'post' | 'quiz'>('post');
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizAnswer, setQuizAnswer] = useState<boolean>(true);
  const [quizVoted, setQuizVoted] = useState<Record<string, boolean>>({});
  const [quizSelected, setQuizSelected] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<string[]>([]);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [viewUserData, setViewUserData] = useState<{ name: string; avatar: string; bio: string; verified: boolean; postsCount: number; followersCount: number; followingCount: number; hideStats: boolean } | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailComments, setDetailComments] = useState<Comment[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<Record<string, boolean>>({});
  const [expandedTexts, setExpandedTexts] = useState<Record<string, boolean>>({});
  // Tab: 'discover' or 'following'
  const [activeTab, setActiveTab] = useState<'discover' | 'following'>('discover');

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    posts.forEach(async p => { const liked = await checkLike(p.id); setLikes(prev => ({ ...prev, [p.id]: liked })); });
  }, [posts, checkLike]);

  // Load following, quiz votes, comment likes, verified users
  useEffect(() => {
    if (user) {
      try {
        const sf = localStorage.getItem(`following_${user.id}`);
        if (sf) setFollowing(JSON.parse(sf));
      } catch { /* ignore */ }
      try {
        const sv = localStorage.getItem(`quizVotes_${user.id}`);
        if (sv) {
          const p = JSON.parse(sv);
          setQuizVoted(p.voted || {});
          setQuizSelected(p.selected || {});
        }
      } catch { /* ignore */ }
      try {
        const cl = localStorage.getItem(`commentLikes_${user.id}`);
        if (cl) setCommentLikes(JSON.parse(cl));
      } catch { /* ignore */ }
      try {
        const clc = localStorage.getItem(`commentLikeCounts_${user.id}`);
        if (clc) setCommentLikeCounts(JSON.parse(clc));
      } catch { /* ignore */ }
    }
    (async () => {
      const db = await getDB();
      const allUsers = await db.getAll('users');
      const vMap: Record<string, boolean> = {};
      for (const u of allUsers) { if (u.verified) vMap[u.id] = true; }
      setVerifiedUsers(vMap);
    })();
  }, [user]);

  // Save comment likes to localStorage whenever they change
  useEffect(() => {
    if (user && Object.keys(commentLikes).length > 0) {
      localStorage.setItem(`commentLikes_${user.id}`, JSON.stringify(commentLikes));
    }
  }, [commentLikes, user]);

  useEffect(() => {
    if (user && Object.keys(commentLikeCounts).length > 0) {
      localStorage.setItem(`commentLikeCounts_${user.id}`, JSON.stringify(commentLikeCounts));
    }
  }, [commentLikeCounts, user]);

  const isVerified = (userId: string) => verifiedUsers[userId] || false;

  const handlePost = async () => {
    if (postType === 'post' && !newPost.trim()) return;
    if (postType === 'quiz' && !quizQuestion.trim()) return;
    setPosting(true);
    if (postType === 'quiz') {
      const db = await getDB();
      const postId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
      const quizPost: Post = {
        id: postId, userId: user!.id, userName: user!.name, userAvatar: user!.avatar || '',
        content: newPost.trim() || '', image: '', type: 'quiz',
        quizQuestion: quizQuestion.trim(), quizAnswer: quizAnswer,
        quizStats: { trueCount: 0, falseCount: 0 },
        pinned: false,
        likesCount: 0, commentsCount: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await db.put('posts', quizPost);
      setQuizQuestion(''); setQuizAnswer(true); setNewPost(''); setPostType('post');
      await loadPosts();
    } else {
      await createPost(newPost, '');
      setNewPost('');
    }
    setPosting(false);
  };

  const handleLike = async (postId: string) => {
    const result = await toggleLike(postId);
    if (result) setLikes(prev => ({ ...prev, [postId]: result.liked }));
  };

  const toggleCommentLike = (commentId: string) => {
    setCommentLikes(prev => {
      const wasLiked = prev[commentId];
      const updated = { ...prev, [commentId]: !wasLiked };
      if (user) localStorage.setItem(`commentLikes_${user.id}`, JSON.stringify(updated));
      setCommentLikeCounts(prevCounts => ({
        ...prevCounts,
        [commentId]: Math.max(0, (prevCounts[commentId] || 0) + (wasLiked ? -1 : 1)),
      }));
      return updated;
    });
  };

  const openComments = async (postId: string) => {
    if (showComments === postId) { setShowComments(null); return; }
    const c = await getComments(postId);
    setComments(c); setShowComments(postId); setReplyingTo(null); setReplyContent('');
  };

  const handleComment = async (postId: string) => {
    if (!newComment.trim()) return;
    await createComment(postId, newComment);
    setNewComment('');
    const c = await getComments(postId); setComments(c);
    if (detailPostId === postId) setDetailComments(c);
    await loadPosts();
  };

  const handleReply = async (postId: string) => {
    if (!replyContent.trim() || !replyingTo) return;
    await createComment(postId, `REPLY_TO:${replyingTo.commentId}:${replyContent}`);
    setReplyContent(''); setReplyingTo(null);
    const c = await getComments(postId); setComments(c);
    if (detailPostId === postId) setDetailComments(c);
    await loadPosts();
  };

  const handleDeleteItem = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'post') {
      await deletePost(confirmDelete.id);
    } else {
      await deleteComment(confirmDelete.id);
      if (showComments) { const c = await getComments(showComments); setComments(c); }
      if (detailPostId) { const c = await getComments(detailPostId); setDetailComments(c); }
      await loadPosts();
    }
    setConfirmDelete(null);
  };

  const handleEdit = async (id: string) => { await updatePost(id, editContent); setEditingPost(null); };

  const handleReport = async () => {
    if (!reportModal || !reportReason.trim()) return;
    await createReport(reportModal.type, reportModal.id, reportReason);
    setReportModal(null); setReportReason('');
    setReportSuccess(true); setTimeout(() => setReportSuccess(false), 3000);
  };

  const handleQuizAnswer = async (postId: string, answer: boolean) => {
    if (quizVoted[postId]) return;
    const newVoted = { ...quizVoted, [postId]: true };
    const newSelected = { ...quizSelected, [postId]: answer };
    setQuizVoted(newVoted);
    setQuizSelected(newSelected);
    if (user) {
      localStorage.setItem(`quizVotes_${user.id}`, JSON.stringify({ voted: newVoted, selected: newSelected }));
    }
    const db = await getDB();
    const post = await db.get('posts', postId);
    if (post) {
      const stats = post.quizStats || { trueCount: 0, falseCount: 0 };
      if (answer) stats.trueCount++; else stats.falseCount++;
      post.quizStats = stats;
      await db.put('posts', post);
      await loadPosts();
    }
  };

  const togglePinPost = async (postId: string) => {
    const db = await getDB();
    const post = await db.get('posts', postId);
    if (post) { post.pinned = !post.pinned; await db.put('posts', post); await loadPosts(); }
  };

  const toggleFollow = (userId: string) => {
    if (!user) return;
    const wasFollowing = following.includes(userId);
    const newF = wasFollowing ? following.filter(id => id !== userId) : [...following, userId];
    setFollowing(newF);
    localStorage.setItem(`following_${user.id}`, JSON.stringify(newF));
    // Update viewUserData followers count in real-time
    if (viewUserId === userId && viewUserData) {
      setViewUserData(prev => prev ? {
        ...prev,
        followersCount: prev.followersCount + (wasFollowing ? -1 : 1),
      } : prev);
    }
  };

  const openUserProfile = useCallback(async (userId: string) => {
    if (userId === user?.id) return;
    const db = await getDB();
    const u = await db.get('users', userId);
    if (u) {
      const allUsers = await db.getAll('users');
      const realFollowers = allUsers.filter(x => {
        try {
          const f = localStorage.getItem(`following_${x.id}`);
          if (f) { const arr = JSON.parse(f); return Array.isArray(arr) && arr.includes(userId); }
        } catch { /* */ }
        return false;
      }).length;
      const userFollowing = (() => {
        try {
          const f = localStorage.getItem(`following_${userId}`);
          if (f) { const arr = JSON.parse(f); return Array.isArray(arr) ? arr.length : 0; }
        } catch { /* */ }
        return 0;
      })();
      setViewUserData({
        name: u.name, avatar: u.avatar || '', bio: u.bio || '',
        verified: u.verified || false,
        postsCount: posts.filter(p => p.userId === userId).length,
        followersCount: realFollowers,
        followingCount: userFollowing,
        hideStats: u.privacyHideStats || false,
      });
      setViewUserId(userId);
    }
  }, [user, posts]);

  const openPostDetail = async (postId: string) => {
    const c = await getComments(postId);
    setDetailComments(c); setDetailPostId(postId); setShowComments(postId); setComments(c);
  };

  const toggleExpandText = (postId: string) => {
    setExpandedTexts(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const rootComments = comments.filter(c => !isReply(c));
  const detailRootComments = detailComments.filter(c => !isReply(c));
  const getReplies = (commentId: string, cmts: Comment[]) => cmts.filter(c => getParentId(c) === commentId);
  const isAdminUser = user?.role === 'admin' || user?.role === 'manager';

  const sortedPosts = [...posts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Filter posts by tab
  const filteredPosts = activeTab === 'following'
    ? sortedPosts.filter(p => following.includes(p.userId) || p.userId === user?.id)
    : sortedPosts;

  const UserAvatar = ({ avatar, name, size = 'md', onClick }: { avatar?: string; name: string; size?: 'sm' | 'md' | 'lg'; onClick?: () => void }) => {
    const sizeClass = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-16 h-16' : 'w-10 h-10';
    const textSize = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xl' : 'text-sm';
    return (
      <div className={cn(sizeClass, 'rounded-full flex items-center justify-center shrink-0 overflow-hidden', onClick && 'cursor-pointer')}
        style={{ background: avatar ? undefined : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        onClick={onClick}>
        {avatar ? (
          <img src={avatar} className={cn(sizeClass, 'rounded-full object-cover')} alt="" />
        ) : (
          <span className={cn(textSize, 'font-bold text-white')}>{name.charAt(0)}</span>
        )}
      </div>
    );
  };

  const UserName = ({ userId, name, className, onClick }: { userId: string; name: string; className?: string; onClick?: () => void }) => (
    <span className="inline-flex items-center gap-1">
      <button className={cn('font-semibold hover:text-primary-600', className)} onClick={onClick}>{name}</button>
      {isVerified(userId) && <VerifiedBadge size="xs" tooltip />}
    </span>
  );

  // Render text with "show more" for long posts
  const renderPostText = (post: Post) => {
    const text = post.content;
    if (!text) return null;
    const isLong = text.length > 180 || text.split('\n').length > 3;
    const isExpanded = expandedTexts[post.id];

    if (!isLong) {
      return <p className="text-surface-700 text-sm leading-relaxed whitespace-pre-wrap mb-3">{text}</p>;
    }

    if (isExpanded) {
      return (
        <div className="mb-3">
          <p className="text-surface-700 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
          <button className="text-primary-500 text-xs font-medium mt-1 hover:text-primary-700" onClick={() => toggleExpandText(post.id)}>
            عرض أقل
          </button>
        </div>
      );
    }

    const truncated = text.length > 180 ? text.slice(0, 180) + '...' : text.split('\n').slice(0, 3).join('\n') + '...';
    return (
      <div className="mb-3">
        <p className="text-surface-700 text-sm leading-relaxed whitespace-pre-wrap">{truncated}</p>
        <button className="text-primary-500 text-xs font-medium mt-1 hover:text-primary-700" onClick={() => toggleExpandText(post.id)}>
          عرض المزيد
        </button>
      </div>
    );
  };

  const renderComment = (c: Comment, postId: string, cmts: Comment[], isDetail: boolean) => {
    const replies = getReplies(c.id, cmts);
    const visibleReplies = isDetail ? replies : replies.slice(0, 3);
    const hasMoreReplies = !isDetail && replies.length > 3;

    return (
      <div key={c.id} className="space-y-2">
        <div className="flex items-start gap-2">
          <UserAvatar avatar={c.userAvatar} name={c.userName} size="sm" onClick={() => openUserProfile(c.userId)} />
          <div className="flex-1 bg-white rounded-xl px-3 py-2">
            <div className="flex items-center justify-between">
              <UserName userId={c.userId} name={c.userName} className="text-xs text-surface-800" onClick={() => openUserProfile(c.userId)} />
              <span className="text-[10px] text-surface-400">{new Date(c.createdAt).toLocaleDateString('ar')}</span>
            </div>
            <p className="text-sm text-surface-600 mt-0.5">{c.content}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <button className={cn('flex items-center gap-0.5 text-[11px]', commentLikes[c.id] ? 'text-red-500' : 'text-surface-400 hover:text-red-400')}
                onClick={() => toggleCommentLike(c.id)}>
                <Icon name="favorite" size={13} filled={commentLikes[c.id]} />
                {(commentLikeCounts[c.id] || 0) > 0 && <span>{commentLikeCounts[c.id]}</span>}
              </button>
              <button className="text-[11px] text-surface-400 hover:text-primary-500 flex items-center gap-0.5"
                onClick={() => setReplyingTo({ commentId: c.id, userName: c.userName })}>
                <Icon name="reply" size={13} /> رد
                {replies.length > 0 && <span className="text-[10px] bg-primary-50 text-primary-500 px-1 rounded-full">{replies.length}</span>}
              </button>
              <button className="text-[11px] text-surface-400 hover:text-orange-500" onClick={() => setReportModal({ type: 'comment', id: c.id })}>
                <Icon name="flag" size={12} />
              </button>
              {(c.userId === user?.id || isAdminUser) && (
                <button className="text-[11px] text-surface-400 hover:text-danger-500"
                  onClick={() => setConfirmDelete({ type: 'comment', id: c.id })}>
                  <Icon name="delete" size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {visibleReplies.length > 0 && (
          <div className="mr-8 space-y-2 border-r-2 border-primary-100 pr-3">
            {visibleReplies.map(r => (
              <div key={r.id} className="flex items-start gap-2">
                <UserAvatar avatar={r.userAvatar} name={r.userName} size="sm" onClick={() => openUserProfile(r.userId)} />
                <div className="flex-1 bg-white rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1">
                    <UserName userId={r.userId} name={r.userName} className="text-xs text-surface-800" onClick={() => openUserProfile(r.userId)} />
                    <Icon name="arrow_back" size={10} className="text-surface-300" />
                    <span className="text-[10px] text-primary-500">{c.userName}</span>
                    <span className="text-[10px] text-surface-400 mr-auto">{new Date(r.createdAt).toLocaleDateString('ar')}</span>
                  </div>
                  <p className="text-sm text-surface-600 mt-0.5">{getReplyContent(r)}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button className={cn('flex items-center gap-0.5 text-[11px]', commentLikes[r.id] ? 'text-red-500' : 'text-surface-400 hover:text-red-400')}
                      onClick={() => toggleCommentLike(r.id)}>
                      <Icon name="favorite" size={13} filled={commentLikes[r.id]} />
                      {(commentLikeCounts[r.id] || 0) > 0 && <span>{commentLikeCounts[r.id]}</span>}
                    </button>
                    <button className="text-[11px] text-surface-400 hover:text-orange-500" onClick={() => setReportModal({ type: 'comment', id: r.id })}>
                      <Icon name="flag" size={12} />
                    </button>
                    {(r.userId === user?.id || isAdminUser) && (
                      <button className="text-[11px] text-surface-400 hover:text-danger-500"
                        onClick={() => setConfirmDelete({ type: 'reply', id: r.id })}>
                        <Icon name="delete" size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {hasMoreReplies && (
              <button className="text-xs text-primary-500 font-medium mr-8 hover:text-primary-700"
                onClick={() => openPostDetail(postId)}>
                عرض كل الردود ({replies.length})
              </button>
            )}
          </div>
        )}

        {replyingTo?.commentId === c.id && (
          <div className="mr-8 flex gap-2 items-center">
            <div className="flex-1 relative">
              <input className="w-full border border-primary-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 pr-16"
                placeholder={`رد على ${replyingTo.userName}...`} value={replyContent}
                onChange={e => setReplyContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleReply(isDetail ? detailPostId! : postId); }}
                autoFocus />
              <button className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-surface-400 hover:text-surface-600 px-2"
                onClick={() => { setReplyingTo(null); setReplyContent(''); }}>إلغاء</button>
            </div>
            <Button size="sm" onClick={() => handleReply(isDetail ? detailPostId! : postId)} disabled={!replyContent.trim()}>
              <Icon name="send" size={14} />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderPost = (post: Post, showAllComments: boolean = false) => {
    const isQuiz = post.type === 'quiz';
    const stats = post.quizStats || { trueCount: 0, falseCount: 0 };
    const totalAns = stats.trueCount + stats.falseCount;
    const truePct = totalAns > 0 ? Math.round((stats.trueCount / totalAns) * 100) : 50;
    const falsePct = totalAns > 0 ? Math.round((stats.falseCount / totalAns) * 100) : 50;
    const currentCmts = showAllComments ? detailRootComments : rootComments;
    const currentAllCmts = showAllComments ? detailComments : comments;
    const activePost = showAllComments ? detailPostId : showComments;
    const previewCmts = showAllComments ? currentCmts : currentCmts.slice(0, 3);
    const hasMoreCmts = !showAllComments && currentCmts.length > 3;
    const hasVoted = quizVoted[post.id] || false;

    return (
      <div className={cn('bg-white rounded-2xl border overflow-hidden', post.pinned ? 'border-amber-200 ring-1 ring-amber-100' : 'border-surface-100')}>
        {post.pinned && (
          <div className="bg-amber-50 px-4 py-1.5 flex items-center gap-1.5 border-b border-amber-100">
            <Icon name="push_pin" size={14} className="text-amber-500" filled />
            <span className="text-xs font-semibold text-amber-600">منشور مثبت</span>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <UserAvatar avatar={post.userAvatar} name={post.userName} size="md" onClick={() => openUserProfile(post.userId)} />
              <div>
                <div className="flex items-center gap-1">
                  <UserName userId={post.userId} name={post.userName} className="text-sm text-surface-900" onClick={() => openUserProfile(post.userId)} />
                  {isQuiz && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">سؤال</span>}
                </div>
                <p className="text-xs text-surface-400">{new Date(post.createdAt).toLocaleDateString('ar')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isAdminUser && (
                <button className={cn('p-1.5 rounded-lg hover:bg-surface-100', post.pinned ? 'text-amber-500' : 'text-surface-400')}
                  onClick={() => togglePinPost(post.id)} title={post.pinned ? 'إلغاء التثبيت' : 'تثبيت'}>
                  <Icon name="push_pin" size={18} filled={post.pinned} />
                </button>
              )}
              {(post.userId === user?.id || isAdminUser) && (
                <>
                  {post.userId === user?.id && !isQuiz && (
                    <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400" onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}>
                      <Icon name="edit" size={18} />
                    </button>
                  )}
                  <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400" onClick={() => setConfirmDelete({ type: 'post', id: post.id })}>
                    <Icon name="delete" size={18} />
                  </button>
                </>
              )}
              <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400" onClick={() => setReportModal({ type: 'post', id: post.id })}>
                <Icon name="flag" size={18} />
              </button>
            </div>
          </div>

          {editingPost === post.id ? (
            <div className="space-y-2">
              <textarea className="w-full border border-surface-200 rounded-xl p-3 text-sm resize-none" rows={3} value={editContent} onChange={e => setEditContent(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setEditingPost(null)}>إلغاء</Button>
                <Button size="sm" onClick={() => handleEdit(post.id)}>حفظ</Button>
              </div>
            </div>
          ) : (
            <>{renderPostText(post)}</>
          )}

          {isQuiz && post.quizQuestion && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 mt-2">
              <p className="text-sm font-semibold text-purple-900 mb-3">{post.quizQuestion}</p>
              {hasVoted ? (
                <div className="space-y-2">
                  <div className={cn('flex items-center justify-between p-2.5 rounded-lg border', post.quizAnswer === true ? 'bg-success-50 border-success-200' : quizSelected[post.id] === true ? 'bg-danger-50 border-danger-200' : 'bg-white border-surface-200')}>
                    <span className="text-sm font-medium">صحيح (Vero)</span>
                    <div className="flex items-center gap-2">
                      {post.quizAnswer === true && <Icon name="check_circle" size={16} className="text-success-500" filled />}
                      <div className="w-20 bg-surface-200 rounded-full h-1.5"><div className="bg-primary-500 rounded-full h-1.5" style={{ width: `${truePct}%` }} /></div>
                      <span className="text-xs text-surface-600 w-8 text-left">{truePct}%</span>
                    </div>
                  </div>
                  <div className={cn('flex items-center justify-between p-2.5 rounded-lg border', post.quizAnswer === false ? 'bg-success-50 border-success-200' : quizSelected[post.id] === false ? 'bg-danger-50 border-danger-200' : 'bg-white border-surface-200')}>
                    <span className="text-sm font-medium">خطأ (Falso)</span>
                    <div className="flex items-center gap-2">
                      {post.quizAnswer === false && <Icon name="check_circle" size={16} className="text-success-500" filled />}
                      <div className="w-20 bg-surface-200 rounded-full h-1.5"><div className="bg-primary-500 rounded-full h-1.5" style={{ width: `${falsePct}%` }} /></div>
                      <span className="text-xs text-surface-600 w-8 text-left">{falsePct}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-surface-400 text-center mt-1">{totalAns} شخص أجاب</p>
                  {quizSelected[post.id] !== post.quizAnswer && (
                    <div className="bg-danger-50 rounded-lg p-2 border border-danger-100 mt-2">
                      <p className="text-xs text-danger-600 flex items-center gap-1"><Icon name="info" size={14} /> إجابتك خاطئة — الصحيح: {post.quizAnswer ? 'صحيح' : 'خطأ'}</p>
                    </div>
                  )}
                  {quizSelected[post.id] === post.quizAnswer && (
                    <div className="bg-success-50 rounded-lg p-2 border border-success-100 mt-2">
                      <p className="text-xs text-success-600 flex items-center gap-1"><Icon name="check_circle" size={14} /> إجابة صحيحة!</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button className="p-3 rounded-xl border-2 border-success-200 hover:bg-success-50 text-success-700 font-medium text-sm" onClick={() => handleQuizAnswer(post.id, true)}>صحيح (Vero)</button>
                  <button className="p-3 rounded-xl border-2 border-danger-200 hover:bg-danger-50 text-danger-700 font-medium text-sm" onClick={() => handleQuizAnswer(post.id, false)}>خطأ (Falso)</button>
                </div>
              )}
            </div>
          )}

          {post.image && <img src={post.image} alt="" className="mt-3 rounded-xl w-full" />}
        </div>

        <div className="border-t border-surface-100 px-5 py-3 flex items-center gap-4">
          <button className={cn('flex items-center gap-1 text-sm', likes[post.id] ? 'text-red-500' : 'text-surface-400 hover:text-red-400')} onClick={() => handleLike(post.id)}>
            <Icon name="favorite" size={20} filled={likes[post.id]} />{post.likesCount}
          </button>
          <button className="flex items-center gap-1 text-sm text-surface-400 hover:text-primary-500" onClick={() => openComments(post.id)}>
            <Icon name="chat_bubble" size={20} />{post.commentsCount}
          </button>
          {!showAllComments && post.commentsCount > 3 && (
            <button className="text-xs text-primary-500 font-medium hover:text-primary-700 mr-auto" onClick={() => openPostDetail(post.id)}>
              عرض كل التعليقات
            </button>
          )}
        </div>

        {activePost === post.id && (
          <div className="border-t border-surface-100 p-4 bg-surface-50 space-y-3">
            {previewCmts.map(c => renderComment(c, post.id, currentAllCmts, showAllComments))}
            {hasMoreCmts && (
              <button className="w-full text-center text-sm text-primary-500 font-medium py-2 hover:text-primary-700" onClick={() => openPostDetail(post.id)}>
                عرض كل التعليقات ({currentCmts.length})
              </button>
            )}
            <div className="flex gap-2 items-center">
              <UserAvatar avatar={user?.avatar} name={user?.name || '?'} size="sm" />
              <input className="flex-1 border border-surface-200 rounded-lg px-3 py-2 text-sm focus:border-primary-500" placeholder="اكتب تعليقاً..." value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleComment(post.id); }} />
              <Button size="sm" onClick={() => handleComment(post.id)} disabled={!newComment.trim()}>
                <Icon name="send" size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Post detail view
  if (detailPostId) {
    const post = posts.find(p => p.id === detailPostId);
    if (!post) return null;
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => { setDetailPostId(null); setDetailComments([]); }} className="flex items-center gap-2 text-surface-500 hover:text-primary-600 mb-4">
          <Icon name="arrow_forward" size={20} /><span className="text-sm">العودة</span>
        </button>
        {renderPost(post, true)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900 mb-2">المجتمع</h1>
        <p className="text-surface-500 text-sm">شارك تجربتك مع الآخرين</p>
      </div>

      {reportSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-success-500 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <Icon name="check_circle" size={20} filled />
          <span className="text-sm font-medium">تم إرسال البلاغ بنجاح</span>
        </div>
      )}

      {/* Tabs: Discover / Following */}
      <div className="flex gap-2 mb-5 bg-surface-100 rounded-xl p-1">
        <button
          className={cn('flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2',
            activeTab === 'discover' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700')}
          onClick={() => setActiveTab('discover')}
        >
          <Icon name="explore" size={18} /> اكتشف
        </button>
        <button
          className={cn('flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2',
            activeTab === 'following' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700')}
          onClick={() => setActiveTab('following')}
        >
          <Icon name="people" size={18} /> المتابَعين
          {following.length > 0 && <span className="bg-primary-100 text-primary-600 text-[10px] px-1.5 py-0.5 rounded-full">{following.length}</span>}
        </button>
      </div>

      {/* New Post */}
      <div className="bg-white rounded-2xl p-5 border border-surface-100 mb-6">
        <div className="flex items-start gap-3">
          <UserAvatar avatar={user?.avatar} name={user?.name || '?'} />
          <div className="flex-1">
            <div className="flex gap-2 mb-3">
              <button className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', postType === 'post' ? 'bg-primary-500 text-white' : 'bg-surface-100 text-surface-600')} onClick={() => setPostType('post')}>
                <Icon name="edit_note" size={14} className="ml-1 inline" /> منشور
              </button>
              <button className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', postType === 'quiz' ? 'bg-purple-500 text-white' : 'bg-surface-100 text-surface-600')} onClick={() => setPostType('quiz')}>
                <Icon name="quiz" size={14} className="ml-1 inline" /> سؤال
              </button>
            </div>
            {postType === 'quiz' ? (
              <div className="space-y-3">
                <textarea className="w-full border border-surface-200 rounded-xl p-3 text-sm resize-none focus:border-purple-500" rows={2} placeholder="اكتب السؤال هنا..." value={quizQuestion} onChange={e => setQuizQuestion(e.target.value)} />
                <div>
                  <label className="text-xs text-surface-600 font-medium mb-1.5 block">الإجابة الصحيحة:</label>
                  <div className="flex gap-2">
                    <button className={cn('flex-1 py-2 rounded-lg text-sm font-medium border-2', quizAnswer ? 'border-success-500 bg-success-50 text-success-700' : 'border-surface-200 text-surface-500')} onClick={() => setQuizAnswer(true)}>صحيح</button>
                    <button className={cn('flex-1 py-2 rounded-lg text-sm font-medium border-2', !quizAnswer ? 'border-danger-500 bg-danger-50 text-danger-700' : 'border-surface-200 text-surface-500')} onClick={() => setQuizAnswer(false)}>خطأ</button>
                  </div>
                </div>
                <textarea className="w-full border border-surface-200 rounded-xl p-3 text-sm resize-none" rows={1} placeholder="تعليق إضافي (اختياري)..." value={newPost} onChange={e => setNewPost(e.target.value)} />
              </div>
            ) : (
              <textarea className="w-full border border-surface-200 rounded-xl p-3 text-sm resize-none focus:border-primary-500" rows={3} placeholder="شارك شيئاً مع المجتمع..." value={newPost} onChange={e => setNewPost(e.target.value)} />
            )}
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={handlePost} loading={posting} disabled={postType === 'quiz' ? !quizQuestion.trim() : !newPost.trim()}
                className={postType === 'quiz' ? '!bg-purple-500 hover:!bg-purple-600' : ''}>نشر</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-surface-100">
          <Icon name={activeTab === 'following' ? 'people' : 'forum'} size={48} className="text-surface-300 mx-auto mb-4" />
          <p className="text-surface-500">
            {activeTab === 'following' ? 'لا توجد منشورات من الأشخاص الذين تتابعهم' : 'لا توجد منشورات بعد. كن أول من يشارك!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map(post => <div key={post.id}>{renderPost(post)}</div>)}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <Icon name="warning" size={40} className="text-warning-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-surface-900 text-center mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-surface-500 text-center mb-6">
              {confirmDelete.type === 'post' ? 'هل أنت متأكد من حذف هذا المنشور؟' : confirmDelete.type === 'reply' ? 'هل أنت متأكد من حذف هذا الرد؟' : 'هل أنت متأكد من حذف هذا التعليق؟'}
            </p>
            <div className="flex gap-3">
              <Button fullWidth variant="ghost" onClick={() => setConfirmDelete(null)}>إلغاء</Button>
              <Button fullWidth variant="danger" onClick={handleDeleteItem}>حذف</Button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setReportModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Icon name="flag" size={22} className="text-warning-500" />
              <h3 className="text-lg font-bold text-surface-900">إبلاغ</h3>
            </div>
            <textarea className="w-full border border-surface-200 rounded-xl p-3 text-sm resize-none mb-4" rows={3} placeholder="سبب البلاغ..." value={reportReason} onChange={e => setReportReason(e.target.value)} />
            <div className="flex gap-3">
              <Button fullWidth variant="ghost" onClick={() => setReportModal(null)}>إلغاء</Button>
              <Button fullWidth variant="danger" onClick={handleReport} disabled={!reportReason.trim()}>إرسال البلاغ</Button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {viewUserId && viewUserData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setViewUserId(null); setViewUserData(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <UserAvatar avatar={viewUserData.avatar} name={viewUserData.name} size="lg" />
              <div className="flex items-center justify-center gap-1 mt-3">
                <h3 className="text-lg font-bold text-surface-900">{viewUserData.name}</h3>
                {viewUserData.verified && <VerifiedBadge size="sm" tooltip />}
              </div>
              {viewUserData.bio && <p className="text-sm text-surface-500 mt-1">{viewUserData.bio}</p>}
            </div>

            {viewUserData.hideStats ? (
              <div className="bg-surface-50 rounded-xl p-4 text-center mb-4">
                <Icon name="lock" size={24} className="text-surface-300 mx-auto mb-2" />
                <p className="text-sm text-surface-500">هذا المستخدم أخفى إحصائياته</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{viewUserData.postsCount}</p>
                  <p className="text-[10px] text-surface-500">منشور</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{posts.filter(p => p.userId === viewUserId && p.type === 'quiz').length}</p>
                  <p className="text-[10px] text-surface-500">سؤال</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{viewUserData.followersCount}</p>
                  <p className="text-[10px] text-surface-500">متابِع</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-surface-900">{viewUserData.followingCount}</p>
                  <p className="text-[10px] text-surface-500">يتابِع</p>
                </div>
              </div>
            )}

            <Button fullWidth onClick={() => toggleFollow(viewUserId!)} variant={following.includes(viewUserId!) ? 'secondary' : 'primary'}>
              {following.includes(viewUserId!) ? 'إلغاء المتابعة' : 'متابعة'}
            </Button>

            {/* User's posts */}
            <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
              <p className="text-xs font-semibold text-surface-600">منشوراته وأسئلته:</p>
              {posts.filter(p => p.userId === viewUserId).slice(0, 10).map(p => (
                <div key={p.id} className="bg-surface-50 rounded-lg p-2 cursor-pointer hover:bg-surface-100" onClick={() => { setViewUserId(null); setViewUserData(null); openPostDetail(p.id); }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    {p.type === 'quiz' && <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">سؤال</span>}
                    <p className="text-[10px] text-surface-400">{new Date(p.createdAt).toLocaleDateString('ar')}</p>
                  </div>
                  <p className="text-xs text-surface-700 line-clamp-2">{p.type === 'quiz' ? p.quizQuestion : p.content}</p>
                </div>
              ))}
              {posts.filter(p => p.userId === viewUserId).length === 0 && (
                <p className="text-xs text-surface-400 text-center py-2">لا توجد منشورات</p>
              )}
            </div>

            <Button fullWidth variant="ghost" onClick={() => { setViewUserId(null); setViewUserData(null); }} className="mt-3">إغلاق</Button>
          </div>
        </div>
      )}
    </div>
  );
}
