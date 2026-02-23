'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
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
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden">
            {/* Controls */}
            <div className="flex items-center justify-between p-2 bg-white border-b border-gray-200 z-10 shadow-sm">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="text-sm font-medium">Page {pageNumber} of {numPages}</span>
                    <button
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setScale(s => s - 0.1)} className="p-1 hover:bg-gray-100 rounded">-</button>
                    <span className="text-xs">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => s + 0.1)} className="p-1 hover:bg-gray-100 rounded">+</button>
                </div>
            </div>

            {/* Scroller */}
            <div
                className="flex-1 overflow-auto p-4 flex justify-center"
                onMouseUp={handleMouseUp}
            >
                <div className="shadow-2xl">
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
