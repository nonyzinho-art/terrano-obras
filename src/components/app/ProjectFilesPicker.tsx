import { useRef, useState } from "react";
import { FileText, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fmtSize,
  groupByFolder,
  MAX_PROJECT_FILE,
  selectProjectFiles,
  type ProjectFile,
} from "@/lib/project-files";

/** Picks a whole project folder (with sub-folders) and/or loose files. */
export function ProjectFilesPicker({
  value,
  onChange,
  disabled,
}: {
  value: ProjectFile[];
  onChange: (files: ProjectFile[]) => void;
  disabled?: boolean;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [skipped, setSkipped] = useState<{ ignored: number; tooLarge: string[] }>({
    ignored: 0,
    tooLarge: [],
  });
  const [open, setOpen] = useState(false);
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = selectProjectFiles(Array.from(list));
    const known = new Set(value.map((f) => f.path));
    const merged = [...value, ...picked.files.filter((f) => !known.has(f.path))].sort((a, b) =>
      a.path.localeCompare(b.path, "pt-BR", { numeric: true }),
    );
    onChange(merged);
    setSkipped({ ignored: picked.ignored.length, tooLarge: picked.tooLarge.map((f) => f.path) });
  };
  const total = value.reduce((sum, f) => sum + f.file.size, 0);
  const groups = groupByFolder(value.map((f) => ({ ...f, title: f.path })));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => folderInput.current?.click()}
        >
          <FolderOpen className="h-4 w-4" /> Escolher pasta do projeto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => filesInput.current?.click()}
        >
          <FileText className="h-4 w-4" /> Escolher arquivos
        </Button>
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange([]);
              setSkipped({ ignored: 0, tooLarge: [] });
            }}
          >
            <X className="h-4 w-4" /> Limpar
          </Button>
        )}
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          aria-label="Pasta do projeto"
          // Non-standard attribute supported by every current browser.
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          aria-label="Arquivos do projeto"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {value.length > 0 && (
        <div className="rounded border bg-muted/40 p-2 text-sm">
          <button
            type="button"
            className="font-medium text-brand hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {value.length} arquivo(s) · {fmtSize(total)} · {groups.length} pasta(s)
            {open ? " — ocultar lista" : " — ver lista"}
          </button>
          {open && (
            <div className="mt-2 max-h-48 space-y-2 overflow-auto">
              {groups.map(([folder, files]) => (
                <div key={folder}>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {folder || "Arquivos soltos"}
                  </p>
                  {files.map((f) => (
                    <p key={f.path} className="truncate pl-3 text-xs">
                      {f.file.name}{" "}
                      <span className="text-muted-foreground">· {fmtSize(f.file.size)}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {skipped.tooLarge.length > 0 && (
        <p className="rounded border bg-warning-soft p-2 text-xs">
          {skipped.tooLarge.length} arquivo(s) acima de {fmtSize(MAX_PROJECT_FILE)} ficaram de fora:{" "}
          {skipped.tooLarge.slice(0, 5).join(", ")}
          {skipped.tooLarge.length > 5 ? "…" : ""}. Divida ou compacte esses arquivos e envie
          separadamente.
        </p>
      )}
      {skipped.ignored > 0 && (
        <p className="text-xs text-muted-foreground">
          {skipped.ignored} arquivo(s) do sistema ou vazios foram ignorados.
        </p>
      )}
    </div>
  );
}
