import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { Camera, Check, ChevronRight, Copy, History, ImagePlus, Info, Leaf, LoaderCircle, MessageCircle, Plus, Send, Trash2, X } from 'lucide-react';
import type { ChatConversation, ChatMessage, PetVariety } from '../types/index.ts';
import { createChatId } from '../utils/chatStorage.ts';
import { playPop } from '../utils/audioEffects.ts';
import { SPECIES } from '../data/species.ts';
import { getPhotoGuidance, getSpeciesType } from '../features/consultation/localGuide.ts';
import type { PhotoIntent } from '../features/consultation/localGuide.ts';
import { Dialog } from './ui/Dialog.tsx';
import {memberApi,uploadDataImage} from '../api/memberApi.ts';
import '../styles/consultation.css';

interface ChatAIScreenProps {
  conversationId: string | null;
  conversation?: ChatConversation;
  onConversationChange: (conversation: ChatConversation) => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  openPhotoOnMount?: boolean;
  onPhotoPromptOpened?: () => void;
}

interface ThreadState {
  id: string;
  messages: ChatMessage[];
  hasChanges: boolean;
}

interface PhotoDraft {
  url: string;
  name: string;
}

const TOPICS = [
  { label: 'Daun menguning', prompt: 'Daun kangkung menguning. Apa yang perlu diperiksa?' },
  { label: 'Cara budidaya', prompt: 'Bagaimana cara budidaya kangkung?' },
  { label: 'Siram tanaman', prompt: 'Bagaimana jadwal menyiram tanaman dalam pot?' },
  { label: 'Pupuk tanaman', prompt: 'Apa yang perlu diperiksa sebelum memberi pupuk tanaman?' },
  { label: 'Hama tanaman', prompt: 'Bagaimana memeriksa hama pada tanaman?' },
  { label: 'Kolam ikan', prompt: 'Bagaimana menjaga kualitas air kolam ikan?' },
  { label: 'Ayam petelur', prompt: 'Bagaimana merawat ayam petelur dan kandangnya?' },
];

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const photo = new Image();
    let settled = false;
    const release = () => URL.revokeObjectURL(sourceUrl);
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      release();
      reject(new Error(message));
    };
    photo.onload = () => {
      if (!photo.naturalWidth || !photo.naturalHeight) {
        fail('Foto tidak memiliki ukuran yang dapat dibaca. Pilih foto lain.');
        return;
      }
      const scale = Math.min(1, 720 / Math.max(photo.naturalWidth, photo.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        fail('Foto tidak dapat diproses di perangkat ini.');
        return;
      }
      context.fillStyle = '#fff8f5';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      release();
      canvas.toBlob((blob) => {
        if (!blob) {
          fail('Foto tidak dapat diproses. Coba pilih foto lain.');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (settled) return;
          if (typeof reader.result !== 'string') {
            fail('Foto tidak dapat dibaca.');
            return;
          }
          settled = true;
          resolve(reader.result);
        };
        reader.onerror = () => fail('Foto tidak dapat dibaca. Coba lagi.');
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.72);
    };
    photo.onerror = () => fail('Format foto ini belum dapat dibuka. Gunakan JPG, PNG, atau WebP.');
    photo.src = sourceUrl;
  });
}

export function ChatAIScreen({ conversationId, conversation, onConversationChange, onOpenHistory, onNewChat, openPhotoOnMount = false, onPhotoPromptOpened }: ChatAIScreenProps) {
  const [thread, setThread] = useState<ThreadState>(() => ({
    id: conversationId || conversation?.id || createChatId(),
    messages: conversation?.messages?.length ? [...conversation.messages] : [],
    hasChanges: false,
  }));
  const [input, setInput] = useState('');
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft | null>(null);
  const [photoSpecies, setPhotoSpecies] = useState<PetVariety | ''>('');
  const [photoIntent, setPhotoIntent] = useState<PhotoIntent>('yellow');
  const [photoDescription, setPhotoDescription] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [requestError, setRequestError] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const speciesRef = useRef<HTMLSelectElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraPickerRef = useRef<HTMLInputElement>(null);
  const galleryPickerRef = useRef<HTMLInputElement>(null);
  const threadIdRef = useRef(thread.id);
  const [moreMessages,setMoreMessages]=useState((conversation?.messages.length||0)>=100);
  const requestVersion = useRef(0);
  const photoVersion = useRef(0);
  const lastQuestion = useRef('');
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserMessages = thread.messages.some((message) => message.sender === 'user');
  const selectedIsPlant = Boolean(photoSpecies && getSpeciesType(photoSpecies) === 'tunas');

  useLayoutEffect(() => {
    screenRef.current?.style.setProperty('--consultation-keyboard-offset', `${keyboardOffset}px`);
  }, [keyboardOffset]);

  useLayoutEffect(() => {
    const composer = composerRef.current, screen = screenRef.current!;
    if (!composer) { screen.style.setProperty('--consultation-composer-height', '0px'); return; }
    const update = () => screen.style.setProperty('--consultation-composer-height', `${Math.ceil(composer.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(update);
    observer.observe(composer);
    update();
    return () => observer.disconnect();
  }, [Boolean(photoDraft)]);

  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    const update = () => {
      field.style.height = 'auto';
      const style = getComputedStyle(field);
      field.style.height = `${field.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
    };
    update();
    // Viewport and font changes can wrap an unchanged draft onto additional lines.
    let previousWidth = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== previousWidth) { previousWidth = width; update(); }
    });
    observer.observe(field);
    let previousFontSize = getComputedStyle(field).fontSize;
    const fontObserver = new MutationObserver(() => {
      const fontSize = getComputedStyle(field).fontSize;
      if (fontSize !== previousFontSize) { previousFontSize = fontSize; update(); }
    });
    fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    document.fonts.addEventListener('loadingdone', update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect(); fontObserver.disconnect();
      document.fonts.removeEventListener('loadingdone', update);
      window.removeEventListener('resize', update);
    };
  }, [input, Boolean(photoDraft)]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersion.current += 1;
      photoVersion.current += 1;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    const incomingId = conversationId || conversation?.id;
    if (!incomingId || incomingId === threadIdRef.current) return;
    threadIdRef.current = incomingId;
    requestVersion.current += 1;
    photoVersion.current += 1;
    sendingRef.current = false;
    setThread({ id: incomingId, messages: conversation?.id === incomingId ? [...conversation.messages] : [], hasChanges: false });
    setInput('');
    setIsSending(false);
    setIsProcessingPhoto(false);
    setPhotoDraft(null);
    setPhotoError('');
    setRequestError('');
    setShowAttachDialog(false);
  }, [conversationId, conversation]);


  useEffect(() => {
    if (!openPhotoOnMount) return;
    setShowAttachDialog(true);
    onPhotoPromptOpened?.();
  }, [openPhotoOnMount, onPhotoPromptOpened]);

  useEffect(() => {
    if (!thread.messages.length && !photoDraft && !isProcessingPhoto) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'end' });
  }, [thread.messages.length, photoDraft, isProcessingPhoto, keyboardOffset]);

  useEffect(() => {
    if (photoDraft) speciesRef.current?.focus({ preventScroll: true });
  }, [photoDraft]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const isComposerFocused = document.activeElement === inputRef.current;
      const hiddenHeight = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardOffset(isComposerFocused && hiddenHeight > 120 ? hiddenHeight : 0);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  async function sendMessage(question = input) {
    const text = question.trim();
    if (!text || sendingRef.current) return;
    const activeThreadId = threadIdRef.current;
    const version = requestVersion.current;
    sendingRef.current = true;
    lastQuestion.current = text;
    setRequestError('');
    setIsSending(true);
    setInput('');
    playPop();
    try {
      const key = /^\d+$/.test(thread.id) ? thread.id : (await memberApi('/member/chat/conversations','POST',{title:text.slice(0,160)})).id;
      const saved = await memberApi(`/member/chat/conversations/${key}/messages`,'POST',{content:text});
      if (!mountedRef.current || version !== requestVersion.current || activeThreadId !== threadIdRef.current) return;
      setThread({id:saved.id,messages:saved.messages,hasChanges:false});
      onConversationChange(saved);
    } catch {
      if (mountedRef.current && version === requestVersion.current) setRequestError('Panduan belum dapat ditampilkan. Coba kirim lagi.');
    } finally {
      if (mountedRef.current && version === requestVersion.current) {
        sendingRef.current = false;
        setIsSending(false);
      }
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleInputKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setShowAttachDialog(false);
    setPhotoError('');
    if ((!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) || (file.type && !file.type.startsWith('image/'))) {
      setPhotoError('Pilih berkas gambar, seperti JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError('Foto terlalu besar. Pilih foto dengan ukuran maksimal 12 MB.');
      return;
    }
    const version = ++photoVersion.current;
    const activeThreadVersion = requestVersion.current;
    setIsProcessingPhoto(true);
    try {
      const url = await compressPhoto(file);
      if (!mountedRef.current || version !== photoVersion.current || activeThreadVersion !== requestVersion.current) return;
      setPhotoDraft({ url, name: file.name || 'Foto kebun' });
      setPhotoSpecies('');
      setPhotoIntent('yellow');
      setPhotoDescription('');
    } catch (error) {
      if (mountedRef.current && version === photoVersion.current && activeThreadVersion === requestVersion.current) setPhotoError(error instanceof Error ? error.message : 'Foto tidak dapat dibuka. Coba foto lain.');
    } finally {
      if (mountedRef.current && version === photoVersion.current && activeThreadVersion === requestVersion.current) setIsProcessingPhoto(false);
    }
  }

  function openPhotoPicker(mode: 'camera' | 'gallery') {
    setShowAttachDialog(false);
    if (mode === 'camera') cameraPickerRef.current?.click();
    else galleryPickerRef.current?.click();
  }

  async function submitPhotoGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photoDraft || !photoSpecies) {
      setPhotoError('Pilih jenis tanaman atau hewan terlebih dahulu.');
      speciesRef.current?.focus();
      return;
    }
    if(sendingRef.current)return;
    sendingRef.current=true;setIsSending(true);setPhotoError('');
    const version=requestVersion.current;
    try {
      const result=getPhotoGuidance(photoSpecies,photoIntent,photoDescription);
      const media=await uploadDataImage(photoDraft.url,'/member/chat/media');
      const key=/^\d+$/.test(thread.id)?thread.id:(await memberApi('/member/chat/conversations','POST',{title:result.question.slice(0,160)})).id;
      const saved=await memberApi(`/member/chat/conversations/${key}/messages`,'POST',{content:result.question,media_id:media.id,species:photoSpecies});
      if(!mountedRef.current||version!==requestVersion.current)return;
      setThread({id:saved.id,messages:saved.messages,hasChanges:false});onConversationChange(saved);setPhotoDraft(null);playPop();
    } catch(e) {if(mountedRef.current&&version===requestVersion.current)setPhotoError((e as Error).message);}
    finally {if(mountedRef.current&&version===requestVersion.current){sendingRef.current=false;setIsSending(false);}}
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Jawaban berhasil disalin.');
    } catch {
      setFeedback('Teks belum bisa disalin di browser ini.');
    }
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(''), 2200);
  }

  return (
    <section ref={screenRef} className="consultation-screen" aria-label="Tanya Tani">
      <header className="consultation-header">
        <div className="consultation-heading"><span className="consultation-mark"><Leaf size={24} /></span><div><h1>Tanya Tani</h1><p>Panduan tanaman & ternak</p></div></div>
        <div className="consultation-header-actions">
          <button type="button" onClick={onOpenHistory}><History size={19} /><span>Riwayat</span></button>
          <button type="button" onClick={onNewChat} aria-label="Percakapan baru"><Plus size={20} /><span>Baru</span></button>
        </div>
      </header>

      <main className="consultation-main">
        <aside className="consultation-mode-note"><Info size={17} /><p>Panduan lokal. Foto belum dibaca otomatis.</p></aside>

        {!hasUserMessages && !photoDraft && !isProcessingPhoto && <div className="consultation-start">
          <div className="consultation-intro"><div><h2>Ada yang ingin dirawat?</h2><p>Ceritakan kondisinya atau lampirkan foto.</p></div><img src="/assets/generated/kangkung.webp" alt="" width="94" height="108" /></div>
          <div className="consultation-entry-actions">
            <button type="button" onClick={() => setShowAttachDialog(true)}><span><Camera size={25} /></span><div><strong>Foto kondisi</strong><small>Kamera atau galeri</small></div><ChevronRight size={20} /></button>
            <button type="button" onClick={() => inputRef.current?.focus()}><span><MessageCircle size={25} /></span><div><strong>Tulis pertanyaan</strong><small>Ceritakan yang terlihat</small></div><ChevronRight size={20} /></button>
          </div>
          <div className="consultation-topics"><h2>Pilih topik</h2><div>{TOPICS.map((topic) => <button type="button" key={topic.label} disabled={isSending} onClick={() => void sendMessage(topic.prompt)}>{topic.label}<ChevronRight size={15} /></button>)}</div></div>
        </div>}

        <div className="consultation-messages" aria-live="polite" aria-relevant="additions">
          {moreMessages&&<button className="sc-button sc-button-light" disabled={isSending} onClick={async()=>{setIsSending(true);try{const older=await memberApi(`/member/chat/conversations/${thread.id}?offset=${thread.messages.length}`);if(mountedRef.current){setMoreMessages(older.messages.length===100);setThread(prev=>({...prev,messages:[...older.messages,...prev.messages]}));}}catch(e){if(mountedRef.current)setRequestError((e as Error).message);}finally{if(mountedRef.current)setIsSending(false);}}}>Muat pesan sebelumnya</button>}
          {thread.messages.map((message) => <article key={message.id} className={`consultation-message consultation-message--${message.sender}`} aria-label={message.sender === 'user' ? 'Pesan Anda' : 'Jawaban Dewi Sri'}>
            <div className="consultation-message-meta"><strong>{message.sender === 'user' ? 'Anda' : 'Dewi Sri'}</strong><span>{message.timestamp}</span></div>
            <div className="consultation-bubble">
              {message.photoUrl && <img className="consultation-message-photo" src={message.photoUrl} alt={message.photoName || 'Foto yang dilampirkan'} width="320" height="240" />}
              <p>{message.text}</p>
              {message.sender === 'assistant' && <button type="button" className="consultation-copy" onClick={() => void copyMessage(message.text)}><Copy size={16} /> Salin jawaban</button>}
            </div>
          </article>)}
        </div>

        {isProcessingPhoto && <div className="consultation-processing" role="status"><LoaderCircle size={23} /><span>Menyiapkan foto di perangkat ini...</span></div>}
        {photoError && <p className="consultation-error" role="alert">{photoError}</p>}
        {requestError && <div className="consultation-error" role="alert"><p>{requestError}</p><button type="button" onClick={() => { setInput(lastQuestion.current); setRequestError(''); inputRef.current?.focus(); }}>Tulis ulang pertanyaan</button></div>}

        {photoDraft && <form className="consultation-photo-form" onSubmit={submitPhotoGuide}>
          <div className="consultation-photo-form-heading"><div><span className="consultation-step-label">FOTO KONDISI</span><h2>Lengkapi keterangan foto</h2></div><button type="button" className="consultation-photo-remove" onClick={() => { setPhotoDraft(null); setPhotoError(''); }} aria-label="Hapus foto"><Trash2 size={20} /></button></div>
          <img className="consultation-draft-photo" src={photoDraft.url} alt="Foto yang akan dilampirkan" width="320" height="200" />
          <button type="button" className="consultation-change-photo" onClick={() => setShowAttachDialog(true)}><ImagePlus size={18} /> Ganti foto</button>
          <label htmlFor="photo-species">Jenis tanaman atau hewan</label>
          <select id="photo-species" ref={speciesRef} value={photoSpecies} onChange={(event) => { const value = event.target.value as PetVariety | ''; setPhotoSpecies(value); setPhotoIntent(value && getSpeciesType(value) === 'tunas' ? 'yellow' : 'care'); setPhotoError(''); }} required>
            <option value="">Pilih jenis</option>
            <optgroup label="Tanaman">{SPECIES.tunas.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
            <optgroup label="Ikan">{SPECIES.koki.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
            <optgroup label="Ayam">{SPECIES.kuning.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
          </select>
          {selectedIsPlant && <fieldset className="consultation-photo-needs"><legend>Apa yang ingin diketahui?</legend>{([{ value: 'yellow', label: 'Daun menguning' }, { value: 'grow', label: 'Cara budidaya' }, { value: 'care', label: 'Perawatan harian' }] as const).map((option) => <label key={option.value}><input type="radio" name="photo-intent" value={option.value} checked={photoIntent === option.value} onChange={() => setPhotoIntent(option.value)} /><span>{option.label}</span></label>)}</fieldset>}
          <label htmlFor="photo-description">Ceritakan kondisinya <span>(opsional)</span></label>
          <textarea id="photo-description" value={photoDescription} onChange={(event) => setPhotoDescription(event.target.value)} maxLength={700} rows={3} placeholder="Misalnya: daun mulai kuning sejak kemarin." />
          <p className="consultation-photo-note"><Info size={16} /> Panduan disusun dari jenis dan keterangan yang dipilih, bukan hasil analisis gambar.</p>
          <button className="consultation-photo-submit" type="submit"><Leaf size={19} aria-hidden="true" /> Lihat panduan lokal</button>
        </form>}

        {isSending && <div className="consultation-processing" role="status"><LoaderCircle size={21} /><span>Menyiapkan panduan...</span></div>}
        {hasUserMessages && !photoDraft && <p className="consultation-storage-note">Percakapan dan foto tersimpan privat pada akun Anda.</p>}
        <div ref={messagesEndRef} className="consultation-scroll-end" />
      </main>

      {!photoDraft && <form ref={composerRef} className="consultation-composer" onSubmit={submitQuestion} style={keyboardOffset ? { bottom: `${keyboardOffset + 12}px` } : undefined}>
        <label htmlFor="consultation-question">Tulis pertanyaan</label>
        <div className="consultation-composer-row">
          <button type="button" className="consultation-composer-photo" disabled={isProcessingPhoto} onClick={() => setShowAttachDialog(true)} aria-label="Lampirkan foto"><Camera size={22} /><span>Foto</span></button>
          <textarea id="consultation-question" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKey} maxLength={2000} rows={1} placeholder="Contoh: daun kuning" />
          <button type="submit" className="consultation-send" disabled={!input.trim() || isSending} aria-label="Kirim pertanyaan"><Send size={20} /><span>Kirim</span></button>
        </div>
      </form>}

      <input ref={cameraPickerRef} type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} className="consultation-file-input" tabIndex={-1} aria-label="Ambil foto dengan kamera" />
      <input ref={galleryPickerRef} type="file" accept="image/*" onChange={(event) => void handlePhoto(event)} className="consultation-file-input" tabIndex={-1} aria-label="Pilih foto dari galeri" />

      {showAttachDialog && <Dialog onClose={() => setShowAttachDialog(false)} labelledBy="consultation-photo-title" className="consultation-dialog">
        <div className="consultation-dialog-heading"><div><span className="consultation-step-label">FOTO KONDISI</span><h2 id="consultation-photo-title">Tambahkan foto</h2></div><button type="button" onClick={() => setShowAttachDialog(false)} aria-label="Tutup pilihan foto"><X size={22} /></button></div>
        <p>Pilih foto tanaman, ikan, atau ayam yang ingin dirawat.</p>
        <div className="consultation-photo-options"><button type="button" onClick={() => openPhotoPicker('camera')}><Camera size={26} /><span><strong>Ambil foto</strong><small>Buka kamera ponsel</small></span><ChevronRight size={20} /></button><button type="button" onClick={() => openPhotoPicker('gallery')}><ImagePlus size={26} /><span><strong>Pilih dari galeri</strong><small>Gunakan foto yang sudah ada</small></span><ChevronRight size={20} /></button></div>
        <p className="consultation-dialog-note">Maksimal 12 MB. Foto diproses di perangkat ini.</p>
      </Dialog>}
      {feedback && <div className="consultation-feedback" role="status"><Check size={18} />{feedback}</div>}
    </section>
  );
}
