'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

// Dynamic import for PDFViewer as it uses browser-only APIs (DOMMatrix)
const PDFViewer = dynamic(() => import('@/components/pdf/pdf-viewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-gray-400">Loading PDF Viewer...</div>
        </div>
    )
});

import BlockEditor from '@/components/editor/block-editor';
import { FileText, Send, Sparkles, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: any[];
}

function WorkspaceContent() {
    const searchParams = useSearchParams();
    const documentId = searchParams.get('id');
    const [docUrl, setDocUrl] = useState<string | null>(null);

    const [selectedText, setSelectedText] = useState<{ text: string; page: number } | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [rightPane, setRightPane] = useState<'notes' | 'ai'>('ai');

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (documentId) {
            api.getDocument(documentId).then(doc => {
                const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/documents/${documentId}/file`;
                setDocUrl(url);
            }).catch(err => console.error("Error loading document:", err));
        }
    }, [documentId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleTextSelect = (text: string, page: number) => {
        setSelectedText({ text, page });
        setRightPane('ai');
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

    if (!documentId) return <div className="p-8">Please select a document from the dashboard to open the workspace.</div>;
    if (!docUrl) return <div className="flex items-center justify-center h-screen">Loading document...</div>;

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
            <PanelGroup orientation="horizontal">

                {/* LEFT: PDF VIEWER */}
                <Panel defaultSize={50} minSize={30} className="border-r border-gray-200">
                    <PDFViewer
                        url={docUrl}
                        onTextSelect={handleTextSelect}
                    />
                </Panel>

                <PanelResizeHandle className="w-1.5 bg-gray-100 hover:bg-blue-400/30 transition-all cursor-col-resize active:bg-blue-500/50" />

                {/* RIGHT: AI & NOTES */}
                <Panel defaultSize={50} minSize={30}>
                    <div className="flex flex-col h-full bg-white">
                        {/* Tabs */}
                        <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200">
                            <button
                                onClick={() => setRightPane('ai')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    rightPane === 'ai' ? "bg-white shadow-sm text-blue-600 ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                <Sparkles className="w-4 h-4" />
                                AI Assistant
                            </button>
                            <button
                                onClick={() => setRightPane('notes')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all",
                                    rightPane === 'notes' ? "bg-white shadow-sm text-blue-600 ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                <FileText className="w-4 h-4" />
                                Study Notes
                            </button>
                        </div>

                        {/* Pane Content */}
                        <div className="flex-1 overflow-hidden relative">
                            {rightPane === 'notes' ? (
                                <div className="h-full overflow-y-auto p-12 max-w-4xl mx-auto">
                                    <div className="mb-8 border-b border-gray-100 pb-4">
                                        <h1 className="text-3xl font-bold text-gray-900">Research Notes</h1>
                                        <p className="text-gray-400 text-sm">Created from Study Workspace</p>
                                    </div>
                                    <BlockEditor />
                                </div>
                            ) : (
                                <div className="flex flex-col h-full bg-slate-50/30">
                                    {/* Chat History */}
                                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                                        {messages.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-sm mx-auto">
                                                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                                                    <Sparkles className="w-8 h-8" />
                                                </div>
                                                <h3 className="font-semibold text-gray-900">Your AI Study Partner</h3>
                                                <p className="text-sm text-gray-500">Highlight text in the PDF to ask questions, or just start typing below.</p>
                                            </div>
                                        )}

                                        {messages.map((msg, i) => (
                                            <div key={i} className={cn(
                                                "flex gap-4 p-4 rounded-2xl max-w-[90%]",
                                                msg.role === 'user' ? "bg-white shadow-sm border border-gray-100 self-end ml-auto" : "bg-blue-600 text-white self-start shadow-xl shadow-blue-500/10"
                                            )}>
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                                    msg.role === 'user' ? "bg-gray-100 text-gray-600" : "bg-white/20 text-white"
                                                )}>
                                                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                                                </div>
                                                <div className="space-y-3 overflow-hidden">
                                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                                    {msg.sources && msg.sources.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                                                            {msg.sources.map((src: any, idx) => (
                                                                <div key={idx} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors">
                                                                    <FileText className="w-3 h-3" />
                                                                    Page {src.metadata?.page_number || '?'}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {isLoading && (
                                            <div className="flex gap-4 p-4 self-start">
                                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                                                </div>
                                                <div className="flex gap-1 py-3">
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Input Area */}
                                    <div className="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.05)]">
                                        {selectedText && (
                                            <div className="mb-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-blue-700 relative animate-in fade-in slide-in-from-bottom-2">
                                                <div className="font-bold mb-1 flex justify-between items-center text-blue-600">
                                                    <span className="flex items-center gap-1">
                                                        <FileText className="w-3 h-3" />
                                                        Selected from Page {selectedText.page}
                                                    </span>
                                                    <button onClick={() => setSelectedText(null)} className="p-1 hover:bg-blue-100 rounded-full">×</button>
                                                </div>
                                                <p className="line-clamp-2 italic opacity-80">"{selectedText.text}"</p>
                                            </div>
                                        )}
                                        <div className="flex gap-3 items-end">
                                            <div className="relative flex-1">
                                                <textarea
                                                    value={chatInput}
                                                    onChange={(e) => setChatInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSendQuery();
                                                        }
                                                    }}
                                                    placeholder="Ask me anything about these pages..."
                                                    className="w-full resize-none border border-gray-200 rounded-2xl p-4 pr-12 text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[60px] max-h-32 transition-all shadow-sm bg-gray-50/30 focus:bg-white"
                                                />
                                            </div>
                                            <button
                                                onClick={handleSendQuery}
                                                disabled={isLoading || (!chatInput.trim() && !selectedText)}
                                                className="p-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl shadow-xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center shrink-0"
                                            >
                                                <Send className="w-5 h-5" />
                                            </button>
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
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading workspace...</div>}>
            <WorkspaceContent />
        </Suspense>
    );
}
