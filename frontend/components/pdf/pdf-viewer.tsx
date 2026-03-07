'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set worker path for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
    url: string;
    onTextSelect?: (text: string, page: number) => void;
    currentPage?: number;
}

export default function PDFViewer({ url, onTextSelect, currentPage = 1 }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(currentPage);
    const [scale, setScale] = useState(1.0);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    const handleMouseUp = useCallback(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            if (onTextSelect) {
                onTextSelect(selection.toString().trim(), pageNumber);
            }
        }
    }, [pageNumber, onTextSelect]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-4 py-3 shadow-[var(--card-shadow)] backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                    >
                        Previous
                    </Button>
                    <span className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]">
                        Page {pageNumber} of {numPages}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                    >
                        Next
                    </Button>
                </div>
                <div className="flex items-center gap-2">
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
                className="paper-grid flex flex-1 justify-center overflow-auto p-6"
                onMouseUp={handleMouseUp}
            >
                <div className="overflow-hidden rounded-[1.2rem] border border-[var(--card-border)] bg-white shadow-[0_26px_60px_rgba(15,23,42,0.16)]">
                    <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
                        <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderAnnotationLayer={true}
                            renderTextLayer={true}
                        />
                    </Document>
                </div>
            </div>
        </div>
    );
}
