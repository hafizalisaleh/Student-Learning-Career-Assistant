'use client';

import {
    useCreateBlockNote,
    getDefaultReactSlashMenuItems,
    SuggestionMenuController,
    DefaultReactSuggestionItem
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useRef } from "react";
import { Sparkles, BrainCircuit } from "lucide-react";

interface BlockEditorProps {
    initialContent?: string;
    markdownContent?: string;
    onChange?: (json: string) => void;
    editable?: boolean;
}

export default function BlockEditor({ initialContent, markdownContent, onChange, editable = true }: BlockEditorProps) {
    const [mounted, setMounted] = useState(false);
    const markdownLoaded = useRef(false);

    const editor = useCreateBlockNote({
        initialContent: (() => {
            if (!initialContent) return undefined;
            try {
                const parsed = JSON.parse(initialContent);
                // BlockNote requires a non-empty array with valid blocks
                if (Array.isArray(parsed) && parsed.length === 0) return undefined;
                return parsed;
            } catch {
                return undefined;
            }
        })(),
    });

    // Convert markdown to blocks after mount
    useEffect(() => {
        if (mounted && markdownContent && editor && !markdownLoaded.current) {
            markdownLoaded.current = true;
            try {
                const blocks = editor.tryParseMarkdownToBlocks(markdownContent);
                editor.replaceBlocks(editor.document, blocks);
            } catch (e) {
                console.warn('Markdown to blocks conversion failed:', e);
            }
        }
    }, [mounted, markdownContent, editor]);

    // Define custom items
    const getCustomSlashMenuItems = (editor: any): DefaultReactSuggestionItem[] => [
        ...getDefaultReactSlashMenuItems(editor),
        {
            title: "AI Summary",
            onItemClick: () => {
                const currentBlock = editor.getTextCursorPosition().block;
                editor.insertBlocks(
                    [
                        {
                            type: "paragraph",
                            content: "Generating AI Summary based on context...",
                        },
                    ],
                    currentBlock,
                    "after"
                );
            },
            aliases: ["summary", "ai", "sum"],
            group: "AI Tools",
            icon: <Sparkles size={18} />,
            subtext: "Create a summary of the current context",
        },
        {
            title: "AI Quiz",
            onItemClick: () => {
                const currentBlock = editor.getTextCursorPosition().block;
                editor.insertBlocks(
                    [
                        {
                            type: "paragraph",
                            content: "Creating a practice quiz for you...",
                        },
                    ],
                    currentBlock,
                    "after"
                );
            },
            aliases: ["quiz", "test", "ai"],
            group: "AI Tools",
            icon: <BrainCircuit size={18} />,
            subtext: "Generate a quiz from selection",
        }
    ];

    useEffect(() => {
        setMounted(true);
    }, []);

    // Simple local filter for menu items
    const filterItems = (items: DefaultReactSuggestionItem[], query: string) => {
        return items.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            (item.aliases && item.aliases.some(alias => alias.toLowerCase().includes(query.toLowerCase())))
        );
    };

    if (!mounted) return null;

    return (
        <div className="w-full h-full min-h-[500px]">
            <BlockNoteView
                editor={editor}
                editable={editable}
                theme="light"
                slashMenu={false}
                onChange={() => {
                    if (onChange) {
                        onChange(JSON.stringify(editor.document));
                    }
                }}
            >
                <SuggestionMenuController
                    triggerCharacter={"/"}
                    getItems={async (query) =>
                        filterItems(getCustomSlashMenuItems(editor), query)
                    }
                />
            </BlockNoteView>
        </div>
    );
}
