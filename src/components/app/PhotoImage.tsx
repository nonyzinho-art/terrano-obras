import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { photoUrl } from "@/lib/photo-urls";
import type { Photo } from "@/lib/types";

export function PhotoImage({
  photo,
  ...props
}: { photo: Photo } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError">) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setUrl("");
    setError(false);
    let force = retry > 0;
    const load = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      const request = photoUrl(photo, force);
      force = false;
      void request
        .then((next) => {
          if (live) {
            setUrl(next);
            setError(false);
          }
        })
        .catch(() => {
          if (live) setError(true);
        });
    };
    load();
    const timer = setInterval(load, 5 * 60_000);
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [visible, photo.id, photo.storage_path, photo.file_url, retry]);
  const retryPhoto = () => setRetry((r) => r + 1);
  const nested = !!host.current?.closest("button");
  return (
    <span
      ref={host}
      className="block"
      onClickCapture={(e) => {
        if (error && nested) {
          e.stopPropagation();
          retryPhoto();
        }
      }}
    >
      {error ? (
        <span
          className={`${props.className ?? ""} flex items-center justify-center bg-muted p-3 text-xs text-muted-foreground`}
        >
          Foto indisponível.{" "}
          {nested ? (
            "Clique para tentar novamente."
          ) : (
            <button
              type="button"
              className="ml-2 underline"
              onClick={(e) => {
                e.stopPropagation();
                retryPhoto();
              }}
            >
              Tentar novamente
            </button>
          )}
        </span>
      ) : url ? (
        <img {...props} src={url} onError={() => setError(true)} />
      ) : (
        <span
          className={`${props.className ?? ""} flex items-center justify-center bg-muted text-xs text-muted-foreground`}
        >
          Carregando foto…
        </span>
      )}
    </span>
  );
}
