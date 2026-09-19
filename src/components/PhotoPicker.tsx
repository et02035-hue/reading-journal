import { Camera, ImageIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PhotoPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img src={preview} alt="선택한 페이지 사진" className="w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="사진 지우기"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground shadow"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground active:bg-secondary"
          >
            <Camera className="size-6 text-primary" strokeWidth={1.75} />
            카메라로 찍기
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground active:bg-secondary"
          >
            <ImageIcon className="size-6 text-primary" strokeWidth={1.75} />
            보관함에서 고르기
          </button>
        </div>
      )}
    </div>
  );
}
