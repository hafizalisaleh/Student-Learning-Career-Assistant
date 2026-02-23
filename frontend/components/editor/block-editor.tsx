'use client';

import {
    useCreateBlockNote,
    getDefaultReactSlashMenuItems,
    SuggestionMenuController,
    DefaultReactSuggestionItem
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useEffect, useState } from "react";
import { Sparkles, BrainCircuit } from "lucide-react";

interface BlockEditorProps {
    initialContent?: string;
    onChange?: (json: string) => void;
    editable?: boolean;
}

export default function BlockEditor({ initialContent, onChange, editable = true }: BlockEditorProps) {
    const [mounted, setMounted] = useState(false);

    const editor = useCreateBlockNote({
        initialContent: initialContent ? JSON.parse(initialContent) : undefined,
    });

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
                            content: "✨ Generating AI Summary based on context...",
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
                            content: "🧠 Creating a practice quiz for you...",
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
