import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { sendZaloReply, sendZaloProductCard } from '../../utils/zaloOA';

const QUICK_REPLY_CATEGORIES = [
  { id: 'greeting', label: 'Chào hỏi' },
  { id: 'price', label: 'Giá cả' },
  { id: 'shipping', label: 'Giao hàng' },
  { id: 'warranty', label: 'Bảo hành' },
  { id: 'closing', label: 'Kết thúc' },
];

const ALL_TAGS = ['VIP', 'Mới', 'Khiếu nại', 'Tư vấn', 'Đơn hàng'];

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

export default function ZaloChatWindow({
  conversation,
  currentUser,
  tenant,
  allUsers,
  onBack,
  onConversationUpdated,
}) {
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyCategory, setQuickReplyCategory] = useState('greeting');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!conversation?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('zalo_chat_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (!error) setMessages(data || []);
    } catch (err) {
      console.error('Error loading zalo messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversation?.id]);

  // Load notes
  const loadNotes = useCallback(async () => {
    if (!conversation?.id) return;
    const { data } = await supabase
      .from('zalo_internal_notes')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    setNotes(data || []);
  }, [conversation?.id]);

  // Load quick replies
  const loadQuickReplies = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('zalo_quick_replies')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order');
    setQuickReplies(data || []);
  }, [tenant?.id]);

  // Load customer info
  const loadCustomerInfo = useCallback(async () => {
    if (!conversation?.customer_id) {
      setCustomerInfo(null);
      return;
    }
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('id', conversation.customer_id)
      .single();
    setCustomerInfo(data);
  }, [conversation?.customer_id]);

  useEffect(() => {
    loadMessages();
    loadNotes();
    loadQuickReplies();
    loadCustomerInfo();
  }, [loadMessages, loadNotes, loadQuickReplies, loadCustomerInfo]);

  // Realtime messages
  useEffect(() => {
    if (!conversation?.id) return;
    const channel = supabase
      .channel(`zalo-chat-${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'zalo_chat_messages',
        filter: `conversation_id=eq.${conversation.id}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark as read when opening
  useEffect(() => {
    if (!conversation?.id || !conversation.unread_count) return;
    supabase
      .from('zalo_conversations')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', conversation.id)
      .then();
  }, [conversation?.id, conversation?.unread_count]);

  // Send message qua Zalo API
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !conversation?.id) return;

    setInputText('');

    try {
      await sendZaloReply(
        tenant.id,
        conversation.zalo_user_id,
        conversation.id,
        text,
        currentUser,
        'text',
      );
      onConversationUpdated?.();
    } catch (err) {
      console.error('Lỗi gửi tin Zalo:', err);
      // Fallback: lưu DB nếu API lỗi
      await supabase.from('zalo_chat_messages').insert([{
        tenant_id: tenant.id,
        conversation_id: conversation.id,
        direction: 'outbound',
        sender_type: 'staff',
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        message_type: 'text',
        content: text,
        status: 'failed',
      }]);
      onConversationUpdated?.();
    }

    inputRef.current?.focus();
  };

  // Send product card qua Zalo API
  const handleSendProductCard = async (product) => {
    try {
      await sendZaloProductCard(
        tenant.id,
        conversation.zalo_user_id,
        conversation.id,
        product,
        currentUser,
      );
      onConversationUpdated?.();
    } catch (err) {
      console.error('Lỗi gửi sản phẩm:', err);
      // Fallback: lưu DB
      const cardContent = JSON.stringify({
        type: 'product_card',
        product_id: product.id,
        name: product.name,
        price: product.price || product.selling_price,
        image: product.image_url || product.images?.[0],
      });
      await supabase.from('zalo_chat_messages').insert([{
        tenant_id: tenant.id,
        conversation_id: conversation.id,
        direction: 'outbound',
        sender_type: 'staff',
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        message_type: 'product_card',
        content: cardContent,
        status: 'failed',
      }]);
    }
    setShowProductPicker(false);
    setProductSearch('');
  };

  // Search products
  const searchProducts = async (query) => {
    setProductSearch(query);
    if (query.length < 2) { setProducts([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, price, selling_price, image_url, images, sku')
      .eq('tenant_id', tenant.id)
      .ilike('name', `%${query}%`)
      .limit(10);
    setProducts(data || []);
  };

  // Add internal note
  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setNoteText('');

    await supabase.from('zalo_internal_notes').insert([{
      tenant_id: tenant.id,
      conversation_id: conversation.id,
      user_id: currentUser.id,
      user_name: currentUser.name,
      content: text,
    }]);

    loadNotes();
    setShowNoteInput(false);
  };

  // Assign conversation
  const handleAssign = async (userId) => {
    const user = userId ? (allUsers || []).find(u => u.id === userId) : null;
    await supabase.from('zalo_conversations').update({
      assigned_to: userId || null,
      assigned_name: user?.name || null,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    onConversationUpdated?.();
    setShowAssignMenu(false);
  };

  // Toggle tag
  const handleToggleTag = async (tag) => {
    const currentTags = conversation.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    await supabase.from('zalo_conversations').update({
      tags: newTags,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    onConversationUpdated?.();
    setShowTagMenu(false);
  };

  // Update status
  const handleStatusChange = async (status) => {
    await supabase.from('zalo_conversations').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);
    onConversationUpdated?.();
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = '';
    messages.forEach(msg => {
      const date = formatDate(msg.created_at);
      if (date !== lastDate) {
        groups.push({ type: 'date', date });
        lastDate = date;
      }
      groups.push({ type: 'message', data: msg });
    });
    return groups;
  }, [messages]);

  // Filtered quick replies
  const filteredQR = useMemo(() =>
    quickReplies.filter(qr => qr.category === quickReplyCategory),
    [quickReplies, quickReplyCategory]
  );

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <div className="text-6xl mb-4">📱</div>
        <h3 className="text-lg font-medium text-gray-500">Chọn hội thoại Zalo</h3>
        <p className="text-sm mt-1">để bắt đầu trả lời khách hàng</p>
      </div>
    );
  }

  // Render a product card message
  const renderProductCard = (content) => {
    try {
      const card = JSON.parse(content);
      return (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden max-w-[220px]">
          {card.image && (
            <img src={card.image} alt={card.name} className="w-full h-32 object-cover" />
          )}
          <div className="p-2">
            <p className="font-medium text-sm text-gray-800 line-clamp-2">{card.name}</p>
            {card.price && (
              <p className="text-red-500 font-bold text-sm mt-1">{formatMoney(card.price)}</p>
            )}
          </div>
        </div>
      );
    } catch {
      return <p className="text-sm">{content}</p>;
    }
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-white">
          {/* Back button (mobile) */}
          <button onClick={onBack} className="md:hidden p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Avatar */}
          {conversation.zalo_user_avatar ? (
            <img src={conversation.zalo_user_avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
              {(conversation.zalo_user_name || 'K')[0].toUpperCase()}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-gray-800 truncate">
              {conversation.zalo_user_name || 'Khách hàng'}
            </h4>
            <p className="text-xs text-gray-400">
              {conversation.customer_phone || 'Zalo OA'}
              {conversation.status === 'waiting' && <span className="ml-2 text-orange-500">Chờ trả lời</span>}
              {conversation.status === 'resolved' && <span className="ml-2 text-green-500">Đã xử lý</span>}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Assign */}
            <div className="relative">
              <button
                onClick={() => { setShowAssignMenu(!showAssignMenu); setShowTagMenu(false); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Phân công"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              {showAssignMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 w-48 py-1 max-h-60 overflow-y-auto">
                  <button onClick={() => handleAssign(null)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-500">
                    Bỏ phân công
                  </button>
                  {(allUsers || []).map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleAssign(u.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${conversation.assigned_to === u.id ? 'bg-blue-50 text-blue-600' : ''}`}
                    >
                      {u.name} {conversation.assigned_to === u.id && '✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="relative">
              <button
                onClick={() => { setShowTagMenu(!showTagMenu); setShowAssignMenu(false); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Gắn thẻ"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </button>
              {showTagMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 w-40 py-1">
                  {ALL_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleToggleTag(tag)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between"
                    >
                      {tag}
                      {(conversation.tags || []).includes(tag) && <span className="text-blue-500">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status */}
            {conversation.status !== 'resolved' ? (
              <button
                onClick={() => handleStatusChange('resolved')}
                className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Đánh dấu đã xử lý"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => handleStatusChange('active')}
                className="p-1.5 hover:bg-yellow-50 rounded text-yellow-600" title="Mở lại"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Customer info toggle */}
            <button
              onClick={() => setShowInfoPanel(!showInfoPanel)}
              className={`p-1.5 hover:bg-gray-100 rounded ${showInfoPanel ? 'text-blue-500 bg-blue-50' : 'text-gray-500'}`}
              title="Thông tin KH"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-1">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Đang tải...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">Chưa có tin nhắn</div>
          ) : (
            groupedMessages.map((item, idx) => {
              if (item.type === 'date') {
                return (
                  <div key={`date-${idx}`} className="flex justify-center my-3">
                    <span className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full">
                      {item.date}
                    </span>
                  </div>
                );
              }

              const msg = item.data;
              const isStaff = msg.sender_type === 'staff';

              return (
                <div key={msg.id} className={`flex ${isStaff ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`max-w-[75%] ${isStaff ? 'order-2' : ''}`}>
                    {/* Sender name for staff (group context) */}
                    {isStaff && msg.sender_name && msg.sender_id !== currentUser?.id && (
                      <p className="text-[10px] text-gray-400 text-right mb-0.5">{msg.sender_name}</p>
                    )}

                    <div className={`rounded-2xl px-3 py-2 ${
                      isStaff
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-white text-gray-800 border rounded-bl-md shadow-sm'
                    }`}>
                      {msg.message_type === 'product_card' ? (
                        renderProductCard(msg.content)
                      ) : msg.message_type === 'image' ? (
                        <img src={msg.content} alt="" className="max-w-[200px] rounded" />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                    </div>

                    <p className={`text-[10px] text-gray-400 mt-0.5 ${isStaff ? 'text-right' : 'text-left'}`}>
                      {formatTime(msg.created_at)}
                      {isStaff && msg.status === 'seen' && <span className="ml-1 text-blue-400">Đã xem</span>}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {/* Internal notes inline */}
          {notes.length > 0 && (
            <div className="border-t border-dashed border-yellow-300 mt-4 pt-3">
              <p className="text-xs text-yellow-600 font-medium mb-2">Ghi chú nội bộ:</p>
              {notes.map(note => (
                <div key={note.id} className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-1.5 text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="font-medium text-yellow-700">{note.user_name}</span>
                    <span className="text-yellow-500">{formatTime(note.created_at)}</span>
                  </div>
                  <p className="text-yellow-800">{note.content}</p>
                </div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick replies panel */}
        {showQuickReplies && (
          <div className="border-t bg-white p-2 max-h-40 overflow-y-auto">
            <div className="flex gap-1 mb-2 overflow-x-auto">
              {QUICK_REPLY_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setQuickReplyCategory(cat.id)}
                  className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                    quickReplyCategory === cat.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {filteredQR.map(qr => (
                <button
                  key={qr.id}
                  onClick={() => { setInputText(qr.content); setShowQuickReplies(false); inputRef.current?.focus(); }}
                  className="w-full text-left px-2 py-1.5 text-xs bg-gray-50 hover:bg-blue-50 rounded border hover:border-blue-200 transition-colors"
                >
                  <span className="font-medium text-gray-700">{qr.title}</span>
                  <p className="text-gray-500 truncate mt-0.5">{qr.content}</p>
                </button>
              ))}
              {filteredQR.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Chưa có trả lời nhanh cho mục này</p>
              )}
            </div>
          </div>
        )}

        {/* Product picker panel */}
        {showProductPicker && (
          <div className="border-t bg-white p-2 max-h-48 overflow-y-auto">
            <div className="relative mb-2">
              <input
                type="text"
                value={productSearch}
                onChange={e => searchProducts(e.target.value)}
                placeholder="Tìm sản phẩm..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
              <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {products.length > 0 ? (
              <div className="space-y-1">
                {products.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSendProductCard(p)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 rounded border text-left"
                  >
                    {(p.image_url || p.images?.[0]) ? (
                      <img src={p.image_url || p.images?.[0]} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">SP</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{p.name}</p>
                      <p className="text-xs text-red-500">{formatMoney(p.price || p.selling_price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : productSearch.length >= 2 ? (
              <p className="text-xs text-gray-400 text-center py-2">Không tìm thấy sản phẩm</p>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">Nhập tên sản phẩm để tìm</p>
            )}
          </div>
        )}

        {/* Note input */}
        {showNoteInput && (
          <div className="border-t bg-yellow-50 p-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Ghi chú nội bộ (KH không thấy)..."
                className="flex-1 px-3 py-1.5 text-xs border border-yellow-300 rounded-lg focus:ring-1 focus:ring-yellow-400 bg-white"
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                autoFocus
              />
              <button onClick={handleAddNote} className="px-3 py-1.5 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600">
                Lưu
              </button>
              <button onClick={() => { setShowNoteInput(false); setNoteText(''); }} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t bg-white p-2">
          {/* Tool buttons */}
          <div className="flex items-center gap-1 mb-1.5">
            <button
              onClick={() => { setShowQuickReplies(!showQuickReplies); setShowProductPicker(false); setShowNoteInput(false); }}
              className={`p-1.5 rounded text-xs ${showQuickReplies ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Trả lời nhanh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
            <button
              onClick={() => { setShowProductPicker(!showProductPicker); setShowQuickReplies(false); setShowNoteInput(false); }}
              className={`p-1.5 rounded text-xs ${showProductPicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Gửi sản phẩm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </button>
            <button
              onClick={() => { setShowNoteInput(!showNoteInput); setShowQuickReplies(false); setShowProductPicker(false); }}
              className={`p-1.5 rounded text-xs ${showNoteInput ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Ghi chú nội bộ"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>

          {/* Text input */}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Nhập tin nhắn..."
              rows={1}
              className="flex-1 px-3 py-2 text-sm border rounded-xl focus:ring-1 focus:ring-blue-400 focus:border-blue-400 resize-none"
              style={{ maxHeight: '80px' }}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="self-end px-3 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Customer info panel (right sidebar) */}
      {showInfoPanel && (
        <div className="hidden md:flex flex-col w-64 border-l bg-white overflow-y-auto">
          <div className="p-3 border-b">
            <h4 className="font-semibold text-sm text-gray-700">Thông tin khách hàng</h4>
          </div>

          <div className="p-3 space-y-3">
            {/* Avatar + name */}
            <div className="text-center">
              {conversation.zalo_user_avatar ? (
                <img src={conversation.zalo_user_avatar} alt="" className="w-16 h-16 rounded-full mx-auto mb-2 object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-100 mx-auto mb-2 flex items-center justify-center text-blue-600 font-bold text-xl">
                  {(conversation.zalo_user_name || 'K')[0].toUpperCase()}
                </div>
              )}
              <p className="font-medium text-gray-800">{conversation.zalo_user_name || 'Khách hàng'}</p>
              {conversation.customer_phone && (
                <p className="text-xs text-gray-500">{conversation.customer_phone}</p>
              )}
            </div>

            {/* Matched customer info */}
            {customerInfo ? (
              <div className="bg-green-50 rounded-lg p-2 text-xs space-y-1">
                <p className="font-medium text-green-700">Khách hàng đã liên kết</p>
                <p><span className="text-gray-500">Tên:</span> {customerInfo.name}</p>
                {customerInfo.phone && <p><span className="text-gray-500">SĐT:</span> {customerInfo.phone}</p>}
                {customerInfo.email && <p><span className="text-gray-500">Email:</span> {customerInfo.email}</p>}
                {customerInfo.address && <p><span className="text-gray-500">Địa chỉ:</span> {customerInfo.address}</p>}
                {customerInfo.total_orders != null && (
                  <p><span className="text-gray-500">Đơn hàng:</span> {customerInfo.total_orders}</p>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-500 text-center">
                Chưa liên kết khách hàng
              </div>
            )}

            {/* Tags */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Gắn thẻ:</p>
              <div className="flex flex-wrap gap-1">
                {(conversation.tags || []).length > 0 ? (
                  (conversation.tags || []).map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">Chưa gắn thẻ</span>
                )}
              </div>
            </div>

            {/* Assigned */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Phụ trách:</p>
              <p className="text-xs text-gray-700">
                {conversation.assigned_name || <span className="text-gray-400">Chưa phân công</span>}
              </p>
            </div>

            {/* Conversation status */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Trạng thái:</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                conversation.status === 'waiting' ? 'bg-orange-100 text-orange-600' :
                conversation.status === 'active' ? 'bg-blue-100 text-blue-600' :
                'bg-green-100 text-green-600'
              }`}>
                {conversation.status === 'waiting' ? 'Chờ trả lời' :
                 conversation.status === 'active' ? 'Đang xử lý' : 'Đã xử lý'}
              </span>
            </div>

            {/* Notes count */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Ghi chú nội bộ:</p>
              <p className="text-xs text-gray-700">{notes.length} ghi chú</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
