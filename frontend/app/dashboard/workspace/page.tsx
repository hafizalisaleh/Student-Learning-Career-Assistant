'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

const PDFViewer = dynamic(() => import('@/components/pdf/pdf-viewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-[var(--bg-secondary)]">
            <div className="text-[var(--text-muted)]">Loading PDF Viewer...</div>
        </div>
    )
});

import BlockEditor from '@/components/editor/block-editor';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FileText, Send, Sparkles, User, Bot, ArrowLeft, Save, Check, BookOpen, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CitedMarkdown, SourceCard } from '@/components/ui/cited-markdown';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: any[];
}

type NoteSaveStatus = 'saved' | 'saving' | 'unsaved' | 'idle';

function WorkspaceContent() {
    const searchParams = useSearchParams();
    const documentId = searchParams.get('id');
    const [docUrl, setDocUrl] = useState<string | null>(null);
    const [docTitle, setDocTitle] = useState<string>('');

    const [selectedText, setSelectedText] = useState<{ text: string; page: number } | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [rightPane, setRightPane] = useState<'notes' | 'ai'>('ai');
    const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());

    // Notes save state
    const [noteContent, setNoteContent] = useState<string>('');
    const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>('idle');
    const [studyNoteId, setStudyNoteId] = useState<string | null>(null);
    const isCreatingRef = useRef(false);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Load document and saved notes from DB
    useEffect(() => {
        if (documentId) {
            api.getDocument(documentId).then(doc => {
                const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/documents/${documentId}/file`;
                setDocUrl(url);
                setDocTitle(doc.title || '');
            }).catch(err => console.error("Error loading document:", err));

            // Load existing study note from DB
            api.getNotesByDocument(documentId).then(notes => {
                const studyNote = (notes || []).find((n: any) => n.note_type === 'study');
                if (studyNote) {
                    setNoteContent(studyNote.content);
                    setStudyNoteId(studyNote.id);
                    setNoteSaveStatus('saved');
                } else {
                    // Fallback: migrate from localStorage if exists
                    const saved = localStorage.getItem(`workspace-notes-${documentId}`);
                    if (saved) {
                        setNoteContent(saved);
                        setNoteSaveStatus('unsaved');
                    }
                }
            }).catch(err => {
                console.warn('Could not load study notes:', err);
            });
        }
    }, [documentId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Cleanup timer
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    const handleTextSelect = (text: string, page: number) => {
        setSelectedText({ text, page });
        setRightPane('ai');
    };

    // Auto-save notes to DB with debounce
    const handleNoteChange = useCallback((json: string) => {
        setNoteContent(json);
        setNoteSaveStatus('unsaved');

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(async () => {
            if (!documentId || isCreatingRef.current) return;
            setNoteSaveStatus('saving');
            try {
                if (studyNoteId) {
                    await api.updateNote(studyNoteId, { content: json, content_format: 'blocknote' });
                } else {
                    isCreatingRef.current = true;
                    const newNote = await api.createStudyNote({
                        title: `Study Notes: ${docTitle || 'Untitled'}`,
                        document_id: documentId,
                        content: json,
                    });
                    setStudyNoteId(newNote.id);
                    isCreatingRef.current = false;
                    // Clean up old localStorage
                    localStorage.removeItem(`workspace-notes-${documentId}`);
                }
                setNoteSaveStatus('saved');
            } catch (err) {
                console.error('Save failed:', err);
                isCreatingRef.current = false;
                setNoteSaveStatus('unsaved');
            }
        }, 1500);
    }, [documentId, studyNoteId, docTitle]);

    const handleManualSave = async () => {
        if (!documentId || !noteContent) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setNoteSaveStatus('saving');
        try {
            if (studyNoteId) {
                await api.updateNote(studyNoteId, { content: noteContent, content_format: 'blocknote' });
            } else {
                const newNote = await api.createStudyNote({
                    title: `Study Notes: ${docTitle || 'Untitled'}`,
                    document_id: documentId,
                    content: noteContent,
                });
                setStudyNoteId(newNote.id);
            }
            setNoteSaveStatus('saved');
        } catch (err) {
            console.error('Manual save failed:', err);
            setNoteSaveStatus('unsaved');
        }
    };

    const toggleSourceExpand = (idx: number) => {
        setExpandedSources(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const copyMessage = (content: string) => {
        navigator.clipboard.writeText(content);
    };

    const handleSendQuery = async () => {
        if (!chatInput.trim() && !selectedText) return;

        const userMessage = chatInput.trim();
        const fullQuery = selectedText
            ? `Regarding the text from Page ${selectedText.page}: "${selectedText.text}"\n\nQuestion: ${userMessage || "Summarize or explain this."}`
            : userMessage;

        const newMessages: Message[] = [...messages, { role: 'user', content: fullQuery }];
        setMessages(newMessages);
        setChatInput('');
        setIsLoading(true);

        try {
            const response = await api.ragQuery(fullQuery, documentId || undefined);

            if (response.answer) {
                setMessages([...newMessages, {
                    role: 'assistant',
                    content: response.answer,
                    sources: response.sources
                }]);
            } else if (response.success) {
                setMessages([...newMessages, {
                    role: 'assistant',
                    content: "I processed your request but didn't generate a text response."
                }]);
            } else {
                setMessages([...newMessages, {
                    role: 'assistant',
                    content: response.error || "Sorry, I encountered an error processing that request."
                }]);
            }
        } catch (error) {
            console.error("RAG Error:", error);
            setMessages([...newMessages, {
                role: 'assistant',
                content: "I'm having trouble connecting to the AI service. Please check your internet connection and try again."
            }]);
        } finally {
            setIsLoading(false);
            setSelectedText(null);
        }
    };

    if (!documentId) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <p className="text-[var(--text-secondary)]">Please select a document from the dashboard to open the workspace.</p>
                <Link href="/dashboard/documents">
                    <Button variant="primary">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Documents
                    </Button>
                </Link>
            </div>
        );
    }

    if (!docUrl) {
        return (
            <div className="flex items-center justify-center h-screen">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    const saveStatusLabel = () => {
        if (noteSaveStatus === 'idle') return null;
        const map = {
            saved: { text: 'Saved', icon: <Check className="h-3 w-3" />, cls: 'text-[var(--success)]' },
            saving: { text: 'Saving...', icon: <LoadingSpinner size="sm" />, cls: 'text-[var(--text-tertiary)]' },
            unsaved: { text: 'Unsaved', icon: null, cls: 'text-[var(--warning)]' },
        };
        const s = map[noteSaveStatus as keyof typeof map];
        if (!s) return null;
        return (
            <span className={cn('flex items-center gap-1 text-[10px]', s.cls)}>
                {s.icon} {s.text}
            </span>
        );
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-primary)]">
            <PanelGroup orientation="horizontal">

                {/* LEFT: PDF VIEWER */}
                <Panel defaultSize={50} minSize={30} className="border-r border-[var(--card-border)]">
                    <PDFViewer
                        url={docUrl}
                        onTextSelect={handleTextSelect}
                    />
                </Panel>

                <PanelResizeHandle className="w-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--primary)]/30 transition-all cursor-col-resize active:bg-[var(--primary)]/50" />

                {/* RIGHT: AI & NOTES */}
                <Panel defaultSize={50} minSize={30}>
                    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
                        {/* Tabs */}
                        <div className="flex items-center gap-1 p-2 bg-[var(--bg-secondary)] border-b border-[var(--card-border)]">
                            <button
                                onClick={() => setRightPane('ai')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    rightPane === 'ai' ? "bg-[var(--card-bg)] shadow-sm text-[var(--primary)] ring-1 ring-[var(--card-border)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <Sparkles className="w-4 h-4" />
                                AI Assistant
                            </button>
                            <button
                                onClick={() => setRightPane('notes')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    rightPane === 'notes' ? "bg-[var(--card-bg)] shadow-sm text-[var(--primary)] ring-1 ring-[var(--card-border)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <FileText className="w-4 h-4" />
                                Study Notes
                            </button>
                        </div>

                        {/* Pane Content */}
                        <div className="flex-1 overflow-hidden relative">
                            {rightPane === 'notes' ? (
                                <div className="h-full flex flex-col">
                                    {/* Notes header with save */}
                                    <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--card-border)] bg-[var(--bg-secondary)]">
                                        <div>
                                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                                Research Notes
                                            </h2>
                                            <p className="text-[10px] text-[var(--text-muted)]">
                                                {docTitle ? `For: ${docTitle}` : 'Study Workspace'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {saveStatusLabel()}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleManualSave}
                                                disabled={noteSaveStatus === 'saved' || noteSaveStatus === 'idle'}
                                            >
                                                <Save className="h-3.5 w-3.5 mr-1" />
                                                Save
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
                                        <BlockEditor
                                            initialContent={noteContent || undefined}
                                            onChange={handleNoteChange}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full bg-[var(--bg-secondary)]/30">
                                    {/* Chat History */}
                                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                                        {messages.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-sm mx-auto">
                                                <div className="w-14 h-14 bg-[var(--primary-light)] rounded-2xl flex items-center justify-center text-[var(--primary)]">
                                                    <Sparkles className="w-7 h-7" />
                                                </div>
                                                <h3 className="font-semibold text-[var(--text-primary)]">Your AI Study Partner</h3>
                                                <p className="text-sm text-[var(--text-tertiary)]">Highlight text in the PDF to ask questions, or type below.</p>
                                            </div>
                                        )}

                                        {messages.map((msg, i) => (
                                            <div key={i} className={cn(
                                                "flex gap-3 max-w-[92%] group",
                                                msg.role === 'user' ? "ml-auto" : ""
                                            )}>
                                                {msg.role === 'assistant' && (
                                                    <div className="w-7 h-7 rounded-lg bg-[var(--primary)] flex items-center justify-center shrink-0 mt-1">
                                                        <Bot className="w-4 h-4 text-white" />
                                                    </div>
                                                )}
                                                <div className={cn(
                                                    "rounded-2xl px-4 py-3 relative",
                                                    msg.role === 'user'
                                                        ? "bg-[var(--primary)] text-white"
                                                        : "bg-[var(--card-bg)] border border-[var(--card-border)]"
                                                )}>
                                                    {msg.role === 'assistant' ? (
                                                        <CitedMarkdown
                                                            content={msg.content}
                                                            sources={msg.sources || []}
                                                            messageId={`ws-${i}`}
                                                            onCitationClick={(idx) => {
                                                                setExpandedSources(prev => new Set(prev).add(i * 100 + idx));
                                                                setTimeout(() => {
                                                                    const el = document.getElementById(`source-ws-${i}-${idx}`);
                                                                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                }, 100);
                                                            }}
                                                        />
                                                    ) : (
                                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                                    )}

                                                    {/* Copy button */}
                                                    <button
                                                        onClick={() => copyMessage(msg.content)}
                                                        className={cn(
                                                            'absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                                                            msg.role === 'user' ? 'hover:bg-white/20 text-white/60' : 'hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                                                        )}
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </button>

                                                    {/* Source citations */}
                                                    {msg.sources && msg.sources.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-[var(--card-border)]">
                                                            <div className="mt-1.5 space-y-1">
                                                                {msg.sources.map((src: any, idx: number) => (
                                                                    <SourceCard key={idx} source={src} index={idx} messageId={`ws-${i}`} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {msg.role === 'user' && (
                                                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] border border-[var(--card-border)] flex items-center justify-center shrink-0 mt-1">
                                                        <User className="w-4 h-4 text-[var(--text-tertiary)]" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {isLoading && (
                                            <div className="flex gap-3">
                                                <div className="w-7 h-7 bg-[var(--primary)] rounded-lg flex items-center justify-center">
                                                    <Sparkles className="w-4 h-4 text-white animate-pulse" />
                                                </div>
                                                <div className="flex items-center gap-2 py-2">
                                                    <LoadingSpinner size="sm" />
                                                    <span className="text-sm text-[var(--text-secondary)]">Thinking...</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Input Area */}
                                    <div className="p-3 bg-[var(--card-bg)] border-t border-[var(--card-border)]">
                                        {selectedText && (
                                            <div className="mb-3 p-2.5 bg-[var(--info-bg)] rounded-xl border border-[var(--info-border)] text-xs text-[var(--primary)] relative animate-in fade-in slide-in-from-bottom-2">
                                                <div className="font-bold mb-1 flex justify-between items-center">
                                                    <span className="flex items-center gap-1">
                                                        <FileText className="w-3 h-3" />
                                                        Selected from Page {selectedText.page}
                                                    </span>
                                                    <button onClick={() => setSelectedText(null)} className="p-1 hover:bg-[var(--bg-tertiary)] rounded-full text-[var(--text-tertiary)]">x</button>
                                                </div>
                                                <p className="line-clamp-2 italic opacity-80">&quot;{selectedText.text}&quot;</p>
                                            </div>
                                        )}
                                        <div className="flex gap-2 items-end">
                                            <textarea
                                                value={chatInput}
                                                onChange={(e) => setChatInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendQuery();
                                                    }
                                                }}
                                                placeholder="Ask about this document..."
                                                className="flex-1 resize-none border border-[var(--card-border)] rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none min-h-[44px] max-h-28 transition-all bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                                                rows={1}
                                            />
                                            <Button
                                                variant="primary"
                                                onClick={handleSendQuery}
                                                disabled={isLoading || (!chatInput.trim() && !selectedText)}
                                                className="rounded-xl h-[44px] w-[44px] p-0 flex items-center justify-center"
                                            >
                                                <Send className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
}

export default function WorkspacePage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen">
                <LoadingSpinner size="lg" />
            </div>
        }>
            <WorkspaceContent />
        </Suspense>
    );
}
