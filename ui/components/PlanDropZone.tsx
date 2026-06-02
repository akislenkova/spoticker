"use client";

import { useCallback, useState } from "react";

type UploadedFile = { name: string; content: string };

type Props = {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
};

const ACCEPTED = [".yaml", ".yml", ".tf", "Dockerfile", ".dockerfile", ".env"];

function fileAccepted(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".tf") ||
    lower.endsWith(".dockerfile") ||
    lower === "dockerfile" ||
    lower.startsWith("dockerfile.")
  );
}

export default function PlanDropZone({ files, onFilesChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const readFiles = useCallback(
    async (rawFiles: FileList | File[]) => {
      const arr = Array.from(rawFiles).filter((f) => fileAccepted(f.name));
      const read = await Promise.all(
        arr.map(
          (f) =>
            new Promise<UploadedFile>((res) => {
              const reader = new FileReader();
              reader.onload = (e) => res({ name: f.name, content: String(e.target?.result ?? "") });
              reader.readAsText(f);
            })
        )
      );
      onFilesChange([...files, ...read]);
    },
    [files, onFilesChange]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    readFiles(e.dataTransfer.files);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) readFiles(e.target.files);
    e.target.value = "";
  }

  function removeFile(name: string) {
    onFilesChange(files.filter((f) => f.name !== name));
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded border-2 border-dashed px-8 py-10 cursor-pointer transition-all
          ${dragging
            ? "border-[rgba(0,255,136,0.6)] bg-[rgba(0,255,136,0.06)] shadow-[0_0_24px_rgba(0,255,136,0.1)]"
            : "border-[rgba(0,255,136,0.15)] bg-[rgba(3,12,9,0.6)] hover:border-[rgba(0,255,136,0.35)] hover:bg-[rgba(0,255,136,0.03)]"
          }
        `}
      >
        <input
          type="file"
          multiple
          accept="*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={handleInput}
        />
        <div className="w-10 h-10 rounded border border-[rgba(0,255,136,0.25)] bg-[rgba(0,255,136,0.07)] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,136,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="font-mono text-sm text-[#7aab8e]">
            Drop files here or <span className="text-[#00ff88]">browse</span>
          </p>
          <p className="font-mono text-[11px] text-[#2d4038]">
            Dockerfile · k8s YAML · Terraform .tf · Helm values.yaml
          </p>
        </div>
      </label>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-3 rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.7)] px-3 py-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,136,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span className="flex-1 font-mono text-xs text-[#7aab8e] truncate">{f.name}</span>
              <span className="font-mono text-[10px] text-[#2d4038]">
                {Math.round(f.content.length / 1024 * 10) / 10} KB
              </span>
              <button
                onClick={() => removeFile(f.name)}
                className="text-[#2d4038] hover:text-[#d07080] transition-colors"
                aria-label={`Remove ${f.name}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
