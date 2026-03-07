"use client"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react"
import { useState } from "react"

export type ToolPart = {
  type: string
  state:
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const { state, input, output, toolCallId } = toolPart

  const getStateIcon = () => {
    switch (state) {
      case "input-streaming":
        return <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
      case "input-available":
        return <Settings className="h-4 w-4 text-[var(--warning)]" />
      case "output-available":
        return <CheckCircle className="h-4 w-4 text-[var(--success)]" />
      case "output-error":
        return <XCircle className="h-4 w-4 text-[var(--danger)]" />
      default:
        return <Settings className="h-4 w-4 text-[var(--text-muted)]" />
    }
  }

  const getStateBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium"
    switch (state) {
      case "input-streaming":
        return (
          <span
            className={cn(
              baseClasses,
              "border border-[var(--primary)]/20 bg-[var(--primary-light)] text-[var(--primary)]"
            )}
          >
            Processing
          </span>
        )
      case "input-available":
        return (
          <span
            className={cn(
              baseClasses,
              "border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"
            )}
          >
            Ready
          </span>
        )
      case "output-available":
        return (
          <span
            className={cn(
              baseClasses,
              "border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
            )}
          >
            Completed
          </span>
        )
      case "output-error":
        return (
          <span
            className={cn(
              baseClasses,
              "border border-[var(--error-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
            )}
          >
            Error
          </span>
        )
      default:
        return (
          <span
            className={cn(
              baseClasses,
              "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
            )}
          >
            Pending
          </span>
        )
    }
  }

  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return "undefined"
    if (typeof value === "string") return value
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-[1.2rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] shadow-[var(--card-shadow)]",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-between rounded-none bg-transparent px-4 py-3 font-normal hover:bg-[var(--accent)]"
          >
            <div className="flex items-center gap-2">
              {getStateIcon()}
              <span className="font-mono text-sm font-medium">
                {toolPart.type}
              </span>
              {getStateBadge()}
            </div>
            <ChevronDown className={cn("h-4 w-4", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
          <CollapsibleContent
            className={cn(
            "border-t border-[var(--card-border)]",
            "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
          )}
        >
          <div className="space-y-3 bg-transparent p-4">
            {input && Object.keys(input).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                  Input
                </h4>
                <div className="rounded-[1rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-3 font-mono text-sm">
                  {Object.entries(input).map(([key, value]) => (
                    <div key={key} className="mb-1">
                      <span className="text-[var(--text-muted)]">{key}:</span>{" "}
                      <span>{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {output && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                  Output
                </h4>
                <div className="max-h-60 overflow-auto rounded-[1rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-3 font-mono text-sm">
                  <pre className="whitespace-pre-wrap">
                    {formatValue(output)}
                  </pre>
                </div>
              </div>
            )}

            {state === "output-error" && toolPart.errorText && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-[var(--danger)]">Error</h4>
                <div className="rounded-[1rem] border border-[var(--error-border)] bg-[var(--danger-bg)] p-3 text-sm">
                  {toolPart.errorText}
                </div>
              </div>
            )}

            {state === "input-streaming" && (
              <div className="text-sm text-[var(--text-muted)]">
                Processing tool call...
              </div>
            )}

            {toolCallId && (
              <div className="border-t border-[var(--card-border)] pt-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono">Call ID: {toolCallId}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
