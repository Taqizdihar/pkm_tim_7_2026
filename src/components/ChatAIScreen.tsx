import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { Camera, Check, ChevronRight, Copy, History, ImagePlus, Info, Leaf, LoaderCircle, Plus, Send, Trash2, X } from 'lucide-react';
import type { ChatConversation, ChatMessage, PetVariety } from '../types/index.ts';
import { createChatId } from '../utils/chatStorage.ts';
import { playPop } from '../utils/audioEffects.ts';
import { SPECIES } from '../data/species.ts';
import { Dialog } from './ui/Dialog.tsx';
import {memberApi,uploadDataImage} from '../api/memberApi.ts';
import {AnswerText} from './consultation/AnswerText.tsx';
import '../styles/consultation.css';

interface ChatAIScreenProps {
  conversationId: string | null;
  conversation?: ChatConversation;
  onConversationChange: (conversation: ChatConversation) => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  openPhotoOnMount?: boolean;
  onPhotoPromptOpened?: () => void;
  cultivationSpecies?: PetVariety;
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
type TurnPayload = {content:string;client_request_id:string;intent: 'identify'|'condition'|'cause'|'grow'|'care';species?:string;media_id?:string;external_consent?:boolean};
interface Capabilities {externalEnabled:boolean;imageAnalysis:boolean;connectionVerified:boolean;localFallback:boolean}
const INTENTS=[{value:'identify',label:'Identifikasi tanaman atau hewan'},{value:'condition',label:'Periksa kondisi budidaya'},{value:'cause',label:'Cari penyebab masalah'},{value:'grow',label:'Pelajari cara budidaya'},{value:'care',label:'Perawatan harian'}] as const;

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
      if(photo.naturalWidth>4096||photo.naturalHeight>4096||photo.naturalWidth*photo.naturalHeight>16000000){fail('Foto maksimal 4096 × 4096 piksel. Pilih foto yang lebih kecil.');return;}
      const scale = Math.min(1, 1600 / Math.max(photo.naturalWidth, photo.naturalHeight));
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
      }, 'image/jpeg', 0.88);
    };
    photo.onerror = () => fail('Format foto ini belum dapat dibuka. Gunakan JPG, PNG, atau WebP.');
    photo.src = sourceUrl;
  });
}

export function ChatAIScreen({ conversationId, conversation, onConversationChange, onOpenHistory, onNewChat, openPhotoOnMount = false, onPhotoPromptOpened,cultivationSpecies }: ChatAIScreenProps) {
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
  const [photoIntent, setPhotoIntent] = useState<TurnPayload['intent']>('condition');
  const [photoDescription, setPhotoDescription] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [requestError, setRequestError] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [capabilities,setCapabilities]=useState<Capabilities|null>(null);
  const [stage,setStage]=useState('');
  const [preview,setPreview]=useState<string|null>(null);
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
  const savedKey=useRef(/^\d+$/.test(thread.id)?thread.id:'');
  const contextSpecies=useRef(openPhotoOnMount?cultivationSpecies:undefined);
  const pending=useRef<TurnPayload|null>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserMessages = thread.messages.some((message) => message.sender === 'user');
  useEffect(()=>{
    let active=true;
    void memberApi<Capabilities>('/member/chat/capabilities').then(value=>{if(active)setCapabilities(value);}).catch(()=>{});
    const unfinished=thread.messages.find(m=>m.request&&m.request.state!=='completed');
    if(unfinished?.request){const {state:_state,...request}=unfinished.request;pending.current={...request,content:unfinished.text};setRequestError('Pertanyaan tersimpan, tetapi jawaban belum selesai. Coba lagi untuk melanjutkan.');}
    return()=>{active=false;};
  },[]);

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
    savedKey.current=/^\d+$/.test(incomingId)?incomingId:'';
    pending.current=null;
    setMoreMessages((conversation?.messages.length||0)>=100);
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
    if (!text || isSending || sendingRef.current || pending.current) return;
    const payload:TurnPayload={content:text,client_request_id:crypto.randomUUID(),intent:'condition'};
    await submitTurn(payload);
  }

  async function submitTurn(payload:TurnPayload,photo?:PhotoDraft) {
    if(isSending||sendingRef.current)return;
    const activeThreadId = threadIdRef.current;
    const version = requestVersion.current;
    sendingRef.current = true;
    pending.current=payload;
    setRequestError('');
    setIsSending(true);
    playPop();
    try {
      if(photo&&!payload.media_id){setStage('Mengunggah foto...');const media=await uploadDataImage(photo.url,'/member/chat/media');payload.media_id=media.id;}
      if(!savedKey.current)savedKey.current=(await memberApi('/member/chat/conversations','POST',{title:(payload.content||'Konsultasi foto').slice(0,160),client_request_id:payload.client_request_id})).id;
      setStage(payload.media_id&&capabilities?.imageAnalysis?'Meminta analisis foto AI...':'Tanya Tani sedang menyiapkan jawaban...');
      const saved = await memberApi(`/member/chat/conversations/${savedKey.current}/messages`,'POST',payload);
      if (!mountedRef.current || version !== requestVersion.current || activeThreadId !== threadIdRef.current) return;
      setThread({id:saved.id,messages:saved.messages,hasChanges:false});
      setMoreMessages(saved.messages.length>=100);
      pending.current=null;setInput('');setPhotoDraft(null);setPhotoError('');
      onConversationChange(saved);
    } catch(error) {
      if (mountedRef.current && version === requestVersion.current) {
        setRequestError((error as Error).message||'Koneksi sedang bermasalah. Silakan coba lagi.');
        if(savedKey.current)void memberApi<ChatConversation>(`/member/chat/conversations/${savedKey.current}`).then(saved=>{
          if(mountedRef.current&&version===requestVersion.current)setThread({id:saved.id,messages:saved.messages,hasChanges:false});
        }).catch(()=>{});
      }
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
      setPhotoSpecies(contextSpecies.current||'');
      setPhotoIntent('condition');
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
    if (!photoDraft || sendingRef.current || pending.current)return;
    const label=INTENTS.find(i=>i.value===photoIntent)!.label;
    await submitTurn({content:photoDescription.trim()||label,client_request_id:crypto.randomUUID(),intent:photoIntent,
      ...(photoSpecies?{species:photoSpecies}:{})},photoDraft);
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
          <button type="button" onClick={onOpenHistory} aria-label="Riwayat" title="Riwayat konsultasi"><History size={20} /><span>Riwayat</span></button>
          <button type="button" onClick={onNewChat} aria-label="Percakapan baru"><Plus size={20} /><span>Baru</span></button>
        </div>
      </header>

      <main className="consultation-main">
        <aside className="consultation-mode-note"><Info size={16} /><p>{capabilities?.externalEnabled?'Asisten AI pertanian · demo':capabilities?.localFallback===false?'Konsultasi sedang tidak tersedia':'Panduan lokal'}{capabilities?.externalEnabled&&!capabilities.connectionVerified?' · koneksi belum diuji':''}</p></aside>

        {!hasUserMessages && !photoDraft && !isProcessingPhoto && <div className="consultation-start">
          <div className="consultation-intro"><div><h2>Ada yang bisa dibantu?</h2><p>Tanyakan cara merawat tanaman atau ternak Anda.</p></div><img src="/assets/generated/kangkung.webp" alt="" width="94" height="108" /></div>
          <div className="consultation-entry-actions">
            <button type="button" onClick={() => setShowAttachDialog(true)}><span><Camera size={25} /></span><div><strong>Foto kondisi</strong><small>Kamera atau galeri</small></div><ChevronRight size={20} /></button>
          </div>
          <div className="consultation-topics"><h2>Pilih topik</h2><div>{TOPICS.map((topic) => <button type="button" key={topic.label} disabled={isSending} onClick={() => void sendMessage(topic.prompt)}>{topic.label}<ChevronRight size={15} /></button>)}</div></div>
        </div>}

        <div className="consultation-messages" aria-live="polite" aria-relevant="additions">
          {moreMessages&&<button className="sc-button sc-button-light" disabled={isSending} onClick={async()=>{setIsSending(true);try{const older=await memberApi(`/member/chat/conversations/${thread.id}?offset=${thread.messages.length}`);if(mountedRef.current){setMoreMessages(older.messages.length===100);setThread(prev=>({...prev,messages:[...older.messages,...prev.messages]}));}}catch(e){if(mountedRef.current)setRequestError((e as Error).message);}finally{if(mountedRef.current)setIsSending(false);}}}>Muat pesan sebelumnya</button>}
          {thread.messages.map((message) => <article key={message.id} className={`consultation-message consultation-message--${message.sender}`} aria-label={message.sender === 'user' ? 'Pesan Anda' : 'Jawaban Dewi Sri'}>
            <div className="consultation-message-meta"><strong>{message.sender === 'user' ? 'Anda' : 'Dewi Sri'}</strong><span>{message.timestamp}</span></div>
            <div className="consultation-bubble">
              {message.photoUrl && <button type="button" className="consultation-photo-preview" onClick={()=>setPreview(message.photoUrl!)} aria-label="Perbesar foto konsultasi"><img className="consultation-message-photo" src={message.photoUrl} alt={message.photoName || 'Foto yang dilampirkan'} width="320" height="240" /></button>}
              {message.sender==='assistant'?<AnswerText text={message.text}/>:<p>{message.text}</p>}
              {message.sender==='assistant'&&<div className="consultation-attribution"><span>{message.providerMetadata?.provider==='local'?'Panduan lokal':message.providerMetadata?.imageAnalyzed?'Dianalisis menggunakan AI':message.providerMetadata?'Jawaban AI':'Jawaban tersimpan'}</span>{message.providerMetadata?.fallbackUsed&&message.providerMetadata.provider==='local'&&<p>Jawaban menggunakan panduan lokal karena layanan AI sedang tidak tersedia.</p>}{message.providerMetadata?.model&&<details><summary>Info jawaban</summary><p>{message.providerMetadata.provider} · {message.providerMetadata.model}</p></details>}</div>}
              {message.sender === 'assistant' && <button type="button" className="consultation-copy" onClick={() => void copyMessage(message.text)}><Copy size={16} /> Salin jawaban</button>}
            </div>
          </article>)}
        </div>

        {isProcessingPhoto && <div className="consultation-processing" role="status"><LoaderCircle size={23} /><span>Menyiapkan foto di perangkat ini...</span></div>}
        {photoError && <p className="consultation-error" role="alert">{photoError}</p>}
        {requestError && <div className="consultation-error" role="alert"><p>{requestError}</p><button type="button" disabled={isSending} onClick={() => {if(pending.current)void submitTurn(pending.current,photoDraft||undefined);}}>Coba lagi</button></div>}

        {photoDraft && <form className="consultation-photo-form" onSubmit={submitPhotoGuide}>
          <div className="consultation-photo-form-heading"><div><span className="consultation-step-label">FOTO KONDISI</span><h2>Lengkapi keterangan foto</h2></div><button type="button" className="consultation-photo-remove" disabled={isSending||Boolean(pending.current)} onClick={() => { setPhotoDraft(null); setPhotoError(''); }} aria-label="Hapus foto"><Trash2 size={20} /></button></div>
          <img className="consultation-draft-photo" src={photoDraft.url} alt="Foto yang akan dilampirkan" width="320" height="200" />
          <button type="button" className="consultation-change-photo" disabled={isSending||Boolean(pending.current)} onClick={() => setShowAttachDialog(true)}><ImagePlus size={18} /> Ganti foto</button>
          <label htmlFor="photo-species">Jenis tanaman atau hewan</label>
          <select id="photo-species" ref={speciesRef} value={photoSpecies} disabled={isSending||Boolean(pending.current)} onChange={(event) => {setPhotoSpecies(event.target.value as PetVariety|'');setPhotoError('');}}>
            <option value="">Belum tahu jenisnya</option>
            <optgroup label="Tanaman">{SPECIES.tunas.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
            <optgroup label="Ikan">{SPECIES.koki.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
            <optgroup label="Ayam">{SPECIES.kuning.filter(s => s.available !== false).map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</optgroup>
          </select>
          <label htmlFor="photo-intent">Apa yang ingin diketahui?</label><select id="photo-intent" value={photoIntent} disabled={isSending||Boolean(pending.current)} onChange={e=>setPhotoIntent(e.target.value as TurnPayload['intent'])}>{INTENTS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <label htmlFor="photo-description">Ceritakan kondisinya <span>(opsional)</span></label>
          <textarea id="photo-description" value={photoDescription} disabled={isSending||Boolean(pending.current)} onChange={(event) => setPhotoDescription(event.target.value)} maxLength={700} rows={3} placeholder="Misalnya: daun mulai kuning sejak kemarin." />
          {capabilities&&!capabilities.imageAnalysis&&<p className="consultation-photo-note"><Info size={16}/>Analisis foto AI sedang tidak tersedia. Panduan lokal memakai keterangan Anda, bukan isi gambar.</p>}
          <button className="consultation-photo-submit" type="submit" disabled={isSending||Boolean(pending.current)}><Leaf size={19} aria-hidden="true" />{capabilities?.imageAnalysis?'Analisis foto':'Kirim foto'}</button>
        </form>}

        {isSending && <div className="consultation-processing" role="status"><LoaderCircle size={21} /><span>{stage||'Menyiapkan jawaban...'}</span></div>}
        {hasUserMessages && !photoDraft && <p className="consultation-storage-note">Percakapan dan foto tersimpan privat pada akun Anda.</p>}
        <div ref={messagesEndRef} className="consultation-scroll-end" />
      </main>

      {!photoDraft && <form ref={composerRef} className="consultation-composer" onSubmit={submitQuestion} style={keyboardOffset ? { bottom: `${keyboardOffset + 12}px` } : undefined}>
        <label htmlFor="consultation-question">Tulis pertanyaan</label>
        <div className="consultation-composer-row">
          <button type="button" className="consultation-composer-photo" disabled={isProcessingPhoto||isSending||Boolean(pending.current)} onClick={() => setShowAttachDialog(true)} aria-label="Lampirkan foto" title="Lampirkan foto"><Camera size={22} /><span>Foto</span></button>
          <textarea id="consultation-question" ref={inputRef} value={input} readOnly={isSending||Boolean(pending.current)} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKey} maxLength={4000} rows={1} placeholder="Tanyakan sesuatu..." />
          <button type="submit" className="consultation-send" disabled={!input.trim() || isSending||Boolean(pending.current)} aria-label="Kirim pertanyaan" title="Kirim pertanyaan"><Send size={21} /><span>Kirim</span></button>
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
      {preview&&<Dialog onClose={()=>setPreview(null)} labelledBy="consultation-preview-title" className="consultation-dialog"><div className="consultation-dialog-heading"><h2 id="consultation-preview-title">Foto konsultasi</h2><button type="button" onClick={()=>setPreview(null)} aria-label="Tutup foto"><X size={22}/></button></div><img className="consultation-expanded-photo" src={preview} alt="Foto konsultasi yang diperbesar"/></Dialog>}
    </section>
  );
}
