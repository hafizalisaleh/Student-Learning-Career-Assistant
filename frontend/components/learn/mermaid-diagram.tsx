'use client';

import { useEffect, useRef, useState } from 'react';

let mermaidInstance: typeof import('mermaid').default | null = null;

async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import('mermaid');
    mermaidInstance = mod.default;
  }
  return mermaidInstance;
}

interface MermaidDiagramProps {
  code: string;
  title?: string;
}

export function MermaidDiagram({ code, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const render = async () => {
      if (!containerRef.current || !code.trim()) return;

      try {
        setError(null);
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          flowchart: { htmlLabels: true, curve: 'basis' },
          themeVariables: {
            primaryColor: '#4B6A9B',
            primaryTextColor: '#FFFFFF',
            primaryBorderColor: '#3D5A87',
            secondaryColor: '#5C8A72',
            secondaryTextColor: '#FFFFFF',
            secondaryBorderColor: '#4A7560',
            tertiaryColor: '#8B7355',
            tertiaryTextColor: '#FFFFFF',
            tertiaryBorderColor: '#745F47',
            lineColor: '#52525B',
            background: '#FFFFFF',
            mainBkg: '#FFFFFF',
            nodeBkg: '#E8EEF4',
            nodeBorder: '#4B6A9B',
            nodeTextColor: '#1a1a1a',
            textColor: '#1a1a1a',
            labelTextColor: '#1a1a1a',
            noteBkgColor: '#FDF8F0',
            noteTextColor: '#1a1a1a',
            noteBorderColor: '#B8860B',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: '14px',
          },
        });
        const renderId = `lesson-diagram-${Date.now()}`;
        const { svg } = await mermaid.render(renderId, code);
        if (active && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Failed to render mermaid diagram', err);
        if (active) {
          setError('Failed to render diagram');
        }
      }
    };

    render();
    return () => {
      active = false;
    };
  }, [code]);

  if (error) {
    return (
      <div className="rounded-[1.25rem] border border-[var(--error-border)] bg-[var(--error-bg)] p-4">
        {title ? <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{title}</p> : null}
        <p className="text-sm text-[var(--error)]">{error}</p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
          {code}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-container overflow-x-auto" />;
}
