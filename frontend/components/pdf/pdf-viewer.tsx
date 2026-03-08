'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, MousePointer2, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type PDFSelectionMode = 'text' | 'image';

export interface PDFTextSelection {
    text: string;
    page: number;
}

export interface PDFImageSelection {
    imageDataUrl: string;
    page: number;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface PDFViewerProps {
    url: string;
    onTextSelect?: (selection: PDFTextSelection) => void;
    onImageSelect?: (selection: PDFImageSelection) => void;
    initialPage?: number;
}

interface DragRect {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ActiveDrag {
    page: number;
    canvas: HTMLCanvasElement;
    canvasRect: DOMRect;
    originX: number;
    originY: number;
}

const MIN_IMAGE_SELECTION_SIZE = 18;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function rectFromPoints(originX: number, originY: number, pointX: number, pointY: number): Omit<DragRect, 'page'> {
    const x = Math.min(originX, pointX);
    const y = Math.min(originY, pointY);
    return {
        x,
        y,
        width: Math.abs(pointX - originX),
        height: Math.abs(pointY - originY),
    };
}

function dataUrlFromCanvasSelection(canvas: HTMLCanvasElement, canvasRect: DOMRect, rect: Omit<DragRect, 'page'>) {
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const sx = Math.round(rect.x * scaleX);
    const sy = Math.round(rect.y * scaleY);
    const sw = Math.max(1, Math.round(rect.width * scaleX));
    const sh = Math.max(1, Math.round(rect.height * scaleY));

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sw;
    outputCanvas.height = sh;

    const context = outputCanvas.getContext('2d');
    if (!context) {
        return null;
    }

    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return outputCanvas.toDataURL('image/png');
}

function findPageNumberFromNode(node: Node | null): number | null {
    if (!node) return null;

    const element =
        node instanceof HTMLElement
            ? node
            : node.parentElement instanceof HTMLElement
                ? node.parentElement
                : null;

    if (!element) return null;

    const pageElement = element.closest<HTMLElement>('[data-page-number]');
    if (!pageElement) return null;

    const value = Number(pageElement.dataset.pageNumber);
    return Number.isFinite(value) ? value : null;
}

export default function PDFViewer({ url, onTextSelect, onImageSelect, initialPage = 1 }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [scale, setScale] = useState(1.0);
    const [selectionMode, setSelectionMode] = useState<PDFSelectionMode>('text');
    const [dragRect, setDragRect] = useState<DragRect | null>(null);

    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const activeDragRef = useRef<ActiveDrag | null>(null);
    const initialScrollDoneRef = useRef(false);

    const pageNumbers = useMemo(
        () => Array.from({ length: numPages }, (_, index) => index + 1),
        [numPages],
    );

    const onDocumentLoadSuccess = useCallback(({ numPages: totalPages }: { numPages: number }) => {
        setNumPages(totalPages);
    }, []);

    useEffect(() => {
        const root = scrollContainerRef.current;
        if (!root || pageNumbers.length === 0) return;

        const observer = new IntersectionObserver(
            entries => {
                const bestEntry = entries
                    .filter(entry => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                if (!bestEntry) return;

                const page = Number((bestEntry.target as HTMLElement).dataset.pageNumber);
                if (Number.isFinite(page)) {
                    setCurrentPage(page);
                }
            },
            {
                root,
                threshold: [0.3, 0.55, 0.8],
            },
        );

        pageRefs.current.forEach(pageRef => {
            if (pageRef) observer.observe(pageRef);
        });

        return () => observer.disconnect();
    }, [pageNumbers]);

    useEffect(() => {
        initialScrollDoneRef.current = false;
    }, [url, initialPage]);

    useEffect(() => {
        if (initialScrollDoneRef.current) return;
        if (!pageNumbers.length) return;

        const targetPage = clamp(initialPage || 1, 1, pageNumbers.length);
        const target = pageRefs.current[targetPage - 1];
        if (!target) return;

        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        setCurrentPage(targetPage);
        initialScrollDoneRef.current = true;
    }, [initialPage, pageNumbers]);

    const clearImageSelection = useCallback(() => {
        activeDragRef.current = null;
        setDragRect(null);
    }, []);

    const handleTextSelection = useCallback(() => {
        if (selectionMode !== 'text') return;

        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (!selection || !text) return;

        const page = findPageNumberFromNode(selection.anchorNode) ?? currentPage;
        onTextSelect?.({ text, page });
    }, [currentPage, onTextSelect, selectionMode]);

    const handleImageSelectionStart = useCallback(
        (page: number, event: React.MouseEvent<HTMLDivElement>) => {
            if (selectionMode !== 'image') return;

            const pageElement = event.currentTarget;
            const canvas = pageElement.querySelector('canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return;

            const canvasRect = canvas.getBoundingClientRect();
            const pointX = clamp(event.clientX - canvasRect.left, 0, canvasRect.width);
            const pointY = clamp(event.clientY - canvasRect.top, 0, canvasRect.height);

            activeDragRef.current = {
                page,
                canvas,
                canvasRect,
                originX: pointX,
                originY: pointY,
            };

            setDragRect({
                page,
                x: pointX,
                y: pointY,
                width: 0,
                height: 0,
            });
        },
        [selectionMode],
    );

    useEffect(() => {
        if (!dragRect) return;

        const handleMouseMove = (event: MouseEvent) => {
            const activeDrag = activeDragRef.current;
            if (!activeDrag) return;

            const pointX = clamp(event.clientX - activeDrag.canvasRect.left, 0, activeDrag.canvasRect.width);
            const pointY = clamp(event.clientY - activeDrag.canvasRect.top, 0, activeDrag.canvasRect.height);
            const nextRect = rectFromPoints(activeDrag.originX, activeDrag.originY, pointX, pointY);

            setDragRect({
                page: activeDrag.page,
                ...nextRect,
            });
        };

        const handleMouseUp = () => {
            const activeDrag = activeDragRef.current;
            const finalRect = dragRect;

            clearImageSelection();

            if (!activeDrag || !finalRect) return;
            if (
                finalRect.width < MIN_IMAGE_SELECTION_SIZE ||
                finalRect.height < MIN_IMAGE_SELECTION_SIZE
            ) {
                return;
            }

            const imageDataUrl = dataUrlFromCanvasSelection(activeDrag.canvas, activeDrag.canvasRect, finalRect);
            if (!imageDataUrl) return;

            onImageSelect?.({
                imageDataUrl,
                page: activeDrag.page,
                rect: {
                    x: finalRect.x / activeDrag.canvasRect.width,
                    y: finalRect.y / activeDrag.canvasRect.height,
                    width: finalRect.width / activeDrag.canvasRect.width,
                    height: finalRect.height / activeDrag.canvasRect.height,
                },
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp, { once: true });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [clearImageSelection, dragRect, onImageSelect]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-4 py-3 shadow-[var(--card-shadow)] backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <div className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]">
                        Page {currentPage} of {numPages || '...'}
                    </div>
                    <div className="hidden rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] md:inline-flex">
                        Scroll Reader
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-1">
                        <Button
                            type="button"
                            variant={selectionMode === 'text' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => {
                                clearImageSelection();
                                setSelectionMode('text');
                            }}
                            className="rounded-full"
                        >
                            <MousePointer2 className="mr-1.5 h-4 w-4" />
                            Text
                        </Button>
                        <Button
                            type="button"
                            variant={selectionMode === 'image' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setSelectionMode('image')}
                            className="rounded-full"
                        >
                            <ImageIcon className="mr-1.5 h-4 w-4" />
                            Image
                        </Button>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.6, s - 0.1))}>
                        <Minus className="h-4 w-4" />
                    </Button>
                    <span className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                        {Math.round(scale * 100)}%
                    </span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setScale(s => Math.min(2.2, s + 0.1))}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                className={cn(
                    'paper-grid flex-1 overflow-y-auto overflow-x-auto p-6',
                    selectionMode === 'image' && 'select-none',
                )}
                onMouseUp={handleTextSelection}
            >
                <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
                    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-8">
                        {pageNumbers.map(pageNumber => (
                            <div
                                key={pageNumber}
                                ref={element => {
                                    pageRefs.current[pageNumber - 1] = element;
                                }}
                                data-page-number={pageNumber}
                                onMouseDown={event => handleImageSelectionStart(pageNumber, event)}
                                className={cn(
                                    'study-desk-page relative mx-auto w-fit overflow-hidden rounded-[1.2rem] border border-[var(--card-border)] bg-white shadow-[0_26px_60px_rgba(15,23,42,0.16)]',
                                    selectionMode === 'image' && 'cursor-crosshair',
                                )}
                            >
                                <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full bg-[color:color-mix(in_srgb,var(--bg-primary)_76%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] shadow-sm">
                                    Page {pageNumber}
                                </div>
                                {dragRect?.page === pageNumber && (
                                    <div
                                        className="pointer-events-none absolute z-30 rounded-md border-2 border-[var(--primary)] bg-[var(--primary)]/15 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
                                        style={{
                                            left: dragRect.x,
                                            top: dragRect.y,
                                            width: dragRect.width,
                                            height: dragRect.height,
                                        }}
                                    />
                                )}
                                <Page
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    renderAnnotationLayer={true}
                                    renderTextLayer={true}
                                />
                            </div>
                        ))}
                    </div>
                </Document>
            </div>
        </div>
    );
}
